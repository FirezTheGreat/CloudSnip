/**
 * Analytics Routes
 *
 * New API endpoints for the intelligence layer:
 *   GET  /api/analytics/cost-breakdown     — Per-resource cost with classification
 *   GET  /api/analytics/forecast           — 24h/7d predictions with confidence intervals
 *   GET  /api/analytics/classification     — All resources with waste/efficient labels
 *   GET  /api/analytics/recommendations    — Smart recommendations with savings
 *   GET  /api/analytics/decisions          — Decision engine results
 *   POST /api/analytics/simulate-scenario  — What-if analysis
 */

import { Router } from "express";
import { Resource } from "../models/Resource";
import { Metric } from "../models/Metric";
import { classifyFleet, type ResourceInput } from "../intelligence/cost-classifier";
import { generateForecast } from "../intelligence/forecaster";
import { evaluateFleet, type DecisionInput } from "../intelligence/decision-engine";
import { generateRecommendations, simulateWhatIf, type RecommendationInput } from "../intelligence/recommendation-engine";
import { INSTANCE_CATALOG } from "../intelligence/pricing";
import type { WorkloadProfile } from "../intelligence/workload-profiles";

const router = Router();

// ─── GET /api/analytics/cost-breakdown ─────────────────────────────────────────

router.get("/cost-breakdown", async (_req, res) => {
  try {
    const resources = await Resource.find({
      status: { $in: ["RUNNING", "active", "attached", "unattached"] },
    }).lean();

    const totalHourly = resources.reduce((s, r) => s + (r.hourly_cost || 0), 0);
    const totalMonthly = totalHourly * 730;

    const breakdown = resources.map((r) => {
      const hourlyCost = r.hourly_cost || 0;
      const monthlyCost = hourlyCost * 730;
      const costContribution = totalMonthly > 0 ? monthlyCost / totalMonthly : 0;

      return {
        resourceId: r.resource_id,
        name: r.name || r.resource_id,
        resourceType: r.resource_type,
        instanceType: r.instanceType || r.metadata?.machineType || "N/A",
        workloadProfile: r.workloadProfile || "unknown",
        classification: r.classification || "UNKNOWN",
        hourlyCost: Number(hourlyCost.toFixed(6)),
        monthlyCost: Number(monthlyCost.toFixed(2)),
        costContribution: Number((costContribution * 100).toFixed(2)),
        efficiencyScore: r.efficiencyScore != null ? Number((r.efficiencyScore * 100).toFixed(1)) : null,
        status: r.status,
        region: r.region,
        tags: r.tags || r.metadata?.labels || {},
      };
    });

    breakdown.sort((a, b) => b.monthlyCost - a.monthlyCost);

    res.json({
      data: breakdown,
      fleet: {
        totalHourlyCost: Number(totalHourly.toFixed(6)),
        totalMonthlyCost: Number(totalMonthly.toFixed(2)),
        resourceCount: resources.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/forecast ───────────────────────────────────────────────

router.get("/forecast", async (_req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Aggregate fleet-wide hourly cost
    const historicalData = await Metric.aggregate([
      {
        $match: {
          metric_name: "estimated_cost",
          resource_type: { $ne: "fleet" },
          time: { $gt: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateTrunc: { date: "$time", unit: "hour" } },
          total_cost: { $sum: "$value" },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, ds: "$_id", y: "$total_cost" } },
    ]);

    if (historicalData.length < 6) {
      return res.json({
        forecast: [],
        message: "Not enough data for forecasting (need ≥6 hourly points)",
      });
    }

    const series = historicalData.map((d: any) => ({
      ds: new Date(d.ds),
      y: d.y,
    }));

    const result = generateForecast(series, 168);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/classification ─────────────────────────────────────────

router.get("/classification", async (_req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const resources = await Resource.find({
      resource_type: { $in: ["compute", "disk"] },
    }).lean();

    // Fetch avg metrics
    const metricAgg = await Metric.aggregate([
      {
        $match: {
          metric_name: { $in: ["cpuutilization", "memoryutilization"] },
          time: { $gt: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: { resource_id: "$resource_id", metric_name: "$metric_name" },
          avg: { $avg: "$value" },
        },
      },
    ]);

    const metricsMap = new Map<string, { avgCpu: number; avgMem: number }>();
    for (const row of metricAgg) {
      const rid = row._id.resource_id;
      if (!metricsMap.has(rid)) metricsMap.set(rid, { avgCpu: 0, avgMem: 0 });
      const entry = metricsMap.get(rid)!;
      if (row._id.metric_name === "cpuutilization") entry.avgCpu = row.avg;
      if (row._id.metric_name === "memoryutilization") entry.avgMem = row.avg;
    }

    const inputs: ResourceInput[] = resources.map((r) => {
      const stats = metricsMap.get(r.resource_id) || { avgCpu: 0, avgMem: 0 };
      return {
        resourceId: r.resource_id,
        resourceName: r.name || r.resource_id,
        instanceType: r.instanceType || "unknown",
        hourlyCost: r.hourly_cost || 0,
        avgCpu: stats.avgCpu,
        avgMemory: stats.avgMem,
        status: r.status || "UNKNOWN",
      };
    });

    const classifications = classifyFleet(inputs);

    const summary = {
      total: classifications.length,
      CRITICAL_WASTE: classifications.filter((c) => c.classification === "CRITICAL_WASTE").length,
      NECESSARY_EXPENSE: classifications.filter((c) => c.classification === "NECESSARY_EXPENSE").length,
      EFFICIENT: classifications.filter((c) => c.classification === "EFFICIENT").length,
      IGNORABLE: classifications.filter((c) => c.classification === "IGNORABLE").length,
      totalWastedMonthly: Number(
        classifications
          .filter((c) => c.classification === "CRITICAL_WASTE")
          .reduce((s, c) => s + c.monthlyCost, 0)
          .toFixed(2)
      ),
    };

    res.json({ data: classifications, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/recommendations ────────────────────────────────────────

router.get("/recommendations", async (_req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const resources = await Resource.find().lean();

    // Fetch avg metrics
    const metricAgg = await Metric.aggregate([
      {
        $match: {
          metric_name: { $in: ["cpuutilization", "memoryutilization"] },
          time: { $gt: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: { resource_id: "$resource_id", metric_name: "$metric_name" },
          avg: { $avg: "$value" },
          max: { $max: "$value" },
        },
      },
    ]);

    const metricsMap = new Map<string, { avgCpu: number; maxCpu: number; avgMem: number }>();
    for (const row of metricAgg) {
      const rid = row._id.resource_id;
      if (!metricsMap.has(rid)) metricsMap.set(rid, { avgCpu: 0, maxCpu: 0, avgMem: 0 });
      const entry = metricsMap.get(rid)!;
      if (row._id.metric_name === "cpuutilization") {
        entry.avgCpu = row.avg;
        entry.maxCpu = row.max;
      }
      if (row._id.metric_name === "memoryutilization") entry.avgMem = row.avg;
    }

    const allRecommendations = [];

    for (const r of resources) {
      const stats = metricsMap.get(r.resource_id) || { avgCpu: 0, maxCpu: 0, avgMem: 0 };

      const input: RecommendationInput = {
        resourceId: r.resource_id,
        resourceName: r.name || r.resource_id,
        resourceType: r.resource_type,
        instanceType: r.instanceType || r.metadata?.machineType || "unknown",
        region: r.region || "us-east-1",
        hourlyCost: r.hourly_cost || 0,
        avgCpu: stats.avgCpu,
        maxCpu: stats.maxCpu,
        avgMemory: stats.avgMem,
        status: r.status || "UNKNOWN",
        classification: (r.classification as any) || "IGNORABLE",
        workloadProfile: (r.workloadProfile as WorkloadProfile) || "stable",
        storageTier: r.metadata?.storageClass?.toLowerCase(),
        storageGB: r.metadata?.sizeGB,
        diskType: r.metadata?.diskType,
        diskSizeGB: r.metadata?.sizeGb,
      };

      const recs = generateRecommendations(input);
      allRecommendations.push(...recs);
    }

    allRecommendations.sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
    const totalSavings = allRecommendations.reduce((s, r) => s + r.estimatedMonthlySavings, 0);

    res.json({
      data: allRecommendations,
      totalPotentialSavings: Number(totalSavings.toFixed(2)),
      count: allRecommendations.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/decisions ──────────────────────────────────────────────

router.get("/decisions", async (_req, res) => {
  try {
    const resources = await Resource.find({
      resource_type: { $in: ["compute", "disk"] },
    }).lean();

    const inputs: DecisionInput[] = resources.map((r) => ({
      resourceId: r.resource_id,
      resourceName: r.name || r.resource_id,
      classification: (r.classification as any) || "IGNORABLE",
      costContribution: r.costContribution || 0,
      efficiencyScore: r.efficiencyScore || 0,
      monthlyCost: (r.hourly_cost || 0) * 730,
      growthRate: (r.predictedUsage as any)?.growthRate ?? 0,
      trend: (r.predictedUsage as any)?.trend ?? "flat",
      workloadProfile: r.workloadProfile || "stable",
      tags: r.tags || r.metadata?.labels || {},
    }));

    const decisions = evaluateFleet(inputs);

    const summary = {
      STOP: decisions.filter((d) => d.action === "STOP").length,
      DOWNSIZE: decisions.filter((d) => d.action === "DOWNSIZE").length,
      KEEP: decisions.filter((d) => d.action === "KEEP").length,
      IGNORE: decisions.filter((d) => d.action === "IGNORE").length,
      MONITOR: decisions.filter((d) => d.action === "MONITOR").length,
      totalPotentialSavings: Number(
        decisions.reduce((s, d) => s + d.savingsIfActed, 0).toFixed(2)
      ),
    };

    res.json({ data: decisions, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/analytics/simulate-scenario ─────────────────────────────────────

router.post("/simulate-scenario", async (req, res) => {
  try {
    const { resourceId, scenario } = req.body;
    if (!resourceId || !scenario) {
      return res.status(400).json({ error: "resourceId and scenario ('stop'|'downsize'|'change_tier') required" });
    }

    const resource = await Resource.findOne({ resource_id: resourceId }).lean();
    if (!resource) {
      return res.status(404).json({ error: `Resource ${resourceId} not found` });
    }

    const result = simulateWhatIf(
      resource.name || resourceId,
      resource.instanceType || resource.metadata?.machineType || "t3.medium",
      resource.hourly_cost || 0,
      resource.region || "us-east-1",
      scenario,
      (resource.workloadProfile as WorkloadProfile) || "stable"
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
