/**
 * Compliance & Governance Report Route
 * GET /api/dashboard/compliance
 *
 * Returns a structured compliance snapshot:
 * - Resources without labels (untagged governance risk)
 * - Resources in unapproved regions
 * - Unattached disks (orphan risk)
 * - Actions audit trail summary
 * - Total cost exposure from non-compliant resources
 */

import { Router } from "express";
import { Resource } from "../models/Resource";
import { Action } from "../models/Action";
import { Anomaly } from "../models/Anomaly";

const router = Router();

const APPROVED_REGIONS = ["us-central1", "us-east1", "us-west1", "europe-west1"];
const REQUIRED_LABELS = ["env", "team", "cost-centre"];

router.get("/compliance", async (_req, res) => {
  try {
    const [resources, recentActions, openAnomalies] = await Promise.all([
      Resource.find().lean(),
      Action.find({ status: "success", executed_at: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
        .sort({ executed_at: -1 }).lean(),
      Anomaly.find({ resolved: false }).lean(),
    ]);

    // ─── 1. Untagged Resources ───────────────────────────────────────────────
    const untagged = resources.filter((r) => {
      const labels = r.metadata?.labels || {};
      return REQUIRED_LABELS.some((req) => !labels[req]);
    });

    // ─── 2. Resources in unapproved regions ─────────────────────────────────
    const unapprovedRegion = resources.filter(
      (r) => Boolean(r.region) && !APPROVED_REGIONS.some((ar) => (r.region ?? "").startsWith(ar))
    );

    // ─── 3. Orphan / unattached disks ───────────────────────────────────────
    const orphanDisks = resources.filter(
      (r) => r.resource_type === "disk" && r.status === "unattached"
    );

    // ─── 4. Publicly accessible buckets ─────────────────────────────────────
    const publicBuckets = resources.filter(
      (r) => r.resource_type === "gcs" && r.metadata?.publicAccessPrevention === "inherited"
    );

    // ─── 5. Idle resources not yet stopped ──────────────────────────────────
    const idleUnresolved = openAnomalies.filter((a) => a.anomaly_type === "idle_instance");

    // ─── 6. Savings audit (last 30 days) ────────────────────────────────────
    const totalSaved30d = recentActions.reduce((s, a) => s + (a.savings_monthly_projected || 0), 0);
    const actionsByType = recentActions.reduce<Record<string, { count: number; savings: number }>>(
      (acc, a) => {
        if (!acc[a.action_type]) acc[a.action_type] = { count: 0, savings: 0 };
        acc[a.action_type].count++;
        acc[a.action_type].savings += a.savings_monthly_projected || 0;
        return acc;
      },
      {}
    );

    // ─── 7. Risk score ───────────────────────────────────────────────────────
    const riskItems = [
      ...untagged.map((r) => ({
        type: "untagged_resource",
        severity: "medium",
        resource_id: r.resource_id,
        resource_name: r.name,
        resource_type: r.resource_type,
        issue: `Missing required labels: ${REQUIRED_LABELS.filter((l) => !r.metadata?.labels?.[l]).join(", ")}`,
        monthly_cost: Number(((r.hourly_cost || 0) * 730).toFixed(2)),
      })),
      ...orphanDisks.map((r) => ({
        type: "orphan_disk",
        severity: "high",
        resource_id: r.resource_id,
        resource_name: r.name,
        resource_type: "disk",
        issue: `Unattached disk — ${r.metadata?.sizeGb || "?"}GB at $${((r.hourly_cost || 0) * 730).toFixed(2)}/mo with no users`,
        monthly_cost: Number(((r.hourly_cost || 0) * 730).toFixed(2)),
      })),
      ...publicBuckets.map((r) => ({
        type: "public_bucket",
        severity: "critical",
        resource_id: r.resource_id,
        resource_name: r.name,
        resource_type: "gcs",
        issue: "Storage bucket has public access not explicitly prevented",
        monthly_cost: Number(((r.hourly_cost || 0) * 730).toFixed(2)),
      })),
      ...unapprovedRegion.map((r) => ({
        type: "unapproved_region",
        severity: "medium",
        resource_id: r.resource_id,
        resource_name: r.name,
        resource_type: r.resource_type,
        issue: `Resource deployed in ${r.region} — approved regions: ${APPROVED_REGIONS.join(", ")}`,
        monthly_cost: Number(((r.hourly_cost || 0) * 730).toFixed(2)),
      })),
      ...idleUnresolved.map((a) => ({
        type: "idle_not_stopped",
        severity: "high",
        resource_id: a.resource_id,
        resource_name: a.resource_id.split("/").pop(),
        resource_type: a.resource_type,
        issue: "Idle VM detected but optimizer action is pending approval",
        monthly_cost: 0,
      })),
    ];

    const totalRiskCost = riskItems.reduce((s, r) => s + r.monthly_cost, 0);
    const complianceScore = Math.max(
      0,
      100 - riskItems.length * 5 - (publicBuckets.length * 10)
    );

    return res.json({
      generated_at: new Date().toISOString(),
      monitoring_period_days: 30,
      compliance_score: complianceScore,
      summary: {
        total_resources: resources.length,
        compliant_resources: resources.length - new Set(riskItems.map((r) => r.resource_id)).size,
        risk_items: riskItems.length,
        total_risk_monthly_cost: Number(totalRiskCost.toFixed(2)),
        total_saved_30d: Number(totalSaved30d.toFixed(2)),
        actions_taken_30d: recentActions.length,
        open_anomalies: openAnomalies.length,
      },
      risk_items: riskItems.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3);
      }),
      actions_audit: recentActions.slice(0, 50).map((a) => ({
        executed_at: a.executed_at,
        resource_id: a.resource_id,
        resource_type: a.resource_type,
        action_type: a.action_type,
        status: a.status,
        savings_monthly: a.savings_monthly_projected,
        dry_run: a.dry_run,
      })),
      actions_by_type: Object.entries(actionsByType).map(([type, data]) => ({
        action_type: type,
        count: data.count,
        total_monthly_savings: Number(data.savings.toFixed(2)),
      })).sort((a, b) => b.total_monthly_savings - a.total_monthly_savings),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export { router as complianceRouter };
