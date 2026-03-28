/**
 * Intelligence Runner
 *
 * Orchestrates the full intelligence pipeline:
 *   1. Fetch all resources + their recent metrics
 *   2. Classify workload profiles
 *   3. Run cost classification (waste/efficient/necessary/ignorable)
 *   4. Generate forecasts
 *   5. Run decision engine
 *   6. Persist results back to Resource documents
 *
 * Called by the scheduler after each telemetry cycle.
 */

import { Resource } from "../models/Resource";
import { Metric } from "../models/Metric";
import { classifyWorkload, peakToAverageRatio } from "./workload-profiles";
import { classifyFleet, type ResourceInput } from "./cost-classifier";
import { detectGrowthRate, trendDirection } from "./forecaster";
import { evaluateFleet, type DecisionInput } from "./decision-engine";
import { broadcast } from "../socket-io";

export async function runIntelligencePipeline(): Promise<void> {
  console.log("[Intelligence] ─── Running cost intelligence pipeline ───");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Step 1: Fetch all resources
  const resources = await Resource.find().lean();
  if (resources.length === 0) {
    console.log("[Intelligence] No resources found — skipping");
    return;
  }

  // Step 2: Compute avg metrics per resource (last 7 days)
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
        stdDev: { $stdDevPop: "$value" },
        count: { $sum: 1 },
      },
    },
  ]);

  // Build lookup: resource_id → { avgCpu, avgMem, stdDevCpu, maxCpu, ... }
  type MetricStats = { avgCpu: number; avgMem: number; stdDevCpu: number; maxCpu: number; count: number };
  const metricsMap = new Map<string, MetricStats>();

  for (const row of metricAgg) {
    const rid = row._id.resource_id;
    if (!metricsMap.has(rid)) {
      metricsMap.set(rid, { avgCpu: 0, avgMem: 0, stdDevCpu: 0, maxCpu: 0, count: 0 });
    }
    const stats = metricsMap.get(rid)!;
    if (row._id.metric_name === "cpuutilization") {
      stats.avgCpu = row.avg;
      stats.stdDevCpu = row.stdDev || 0;
      stats.maxCpu = row.max;
      stats.count = row.count;
    } else if (row._id.metric_name === "memoryutilization") {
      stats.avgMem = row.avg;
    }
  }

  // Step 3: Classify workload profiles
  console.log("[Intelligence] Classifying workload profiles...");
  for (const r of resources) {
    const stats = metricsMap.get(r.resource_id);
    if (stats && stats.count > 5) {
      const profile = classifyWorkload(stats.avgCpu, stats.stdDevCpu);
      await Resource.updateOne(
        { resource_id: r.resource_id },
        { workloadProfile: profile }
      );
    }
  }

  // Step 4: Run cost classification
  console.log("[Intelligence] Running cost classification...");
  const classificationInputs: ResourceInput[] = resources
    .filter((r) => r.resource_type === "compute" || r.resource_type === "disk")
    .map((r) => {
      const stats = metricsMap.get(r.resource_id) || { avgCpu: 0, avgMem: 0, stdDevCpu: 0, maxCpu: 0, count: 0 };
      return {
        resourceId: r.resource_id,
        resourceName: r.name || r.resource_id,
        instanceType: r.instanceType || r.metadata?.machineType || "unknown",
        hourlyCost: r.hourly_cost || 0,
        avgCpu: stats.avgCpu,
        avgMemory: stats.avgMem,
        status: r.status || "UNKNOWN",
      };
    });

  const classifications = classifyFleet(classificationInputs);

  // Persist classifications
  for (const c of classifications) {
    await Resource.updateOne(
      { resource_id: c.resourceId },
      {
        classification: c.classification,
        costContribution: c.costContribution,
        efficiencyScore: c.efficiencyScore,
      }
    );
  }

  const wasteful = classifications.filter((c) => c.classification === "CRITICAL_WASTE");
  const efficient = classifications.filter((c) => c.classification === "EFFICIENT");
  const necessary = classifications.filter((c) => c.classification === "NECESSARY_EXPENSE");
  console.log(`[Intelligence]   Waste: ${wasteful.length}, Efficient: ${efficient.length}, Necessary: ${necessary.length}`);

  // Step 5: Growth detection (per resource)
  console.log("[Intelligence] Detecting growth trends...");
  for (const r of resources) {
    if (r.resource_type !== "compute") continue;

    const costHistory = await Metric.find({
      resource_id: r.resource_id,
      metric_name: "estimated_cost",
      time: { $gt: sevenDaysAgo },
    })
      .sort({ time: 1 })
      .lean();

    if (costHistory.length > 10) {
      const series = costHistory.map((m) => ({ ds: m.time, y: m.value }));
      const growthRate = detectGrowthRate(series);
      const trend = trendDirection(growthRate);

      await Resource.updateOne(
        { resource_id: r.resource_id },
        {
          predictedUsage: {
            trend,
            growthRate: Number(growthRate.toFixed(2)),
          },
        }
      );
    }
  }

  // Step 6: Run decision engine
  console.log("[Intelligence] Running smart decision engine...");
  const decisionInputs: DecisionInput[] = classifications.map((c) => {
    const r = resources.find((res) => res.resource_id === c.resourceId);
    const predicted = r?.predictedUsage as { trend?: string; growthRate?: number } | undefined;

    return {
      resourceId: c.resourceId,
      resourceName: c.resourceName,
      classification: c.classification,
      costContribution: c.costContribution,
      efficiencyScore: c.efficiencyScore,
      monthlyCost: c.monthlyCost,
      growthRate: predicted?.growthRate ?? 0,
      trend: (predicted?.trend as "increasing" | "decreasing" | "flat") ?? "flat",
      workloadProfile: r?.workloadProfile || "stable",
      tags: r?.tags || r?.metadata?.labels || {},
    };
  });

  const decisions = evaluateFleet(decisionInputs);

  const actionable = decisions.filter((d) => d.action === "STOP" || d.action === "DOWNSIZE");
  const totalSavings = actionable.reduce((s, d) => s + d.savingsIfActed, 0);

  console.log(`[Intelligence]   Actionable: ${actionable.length} resources, potential savings: $${totalSavings.toFixed(2)}/mo`);

  // Broadcast intelligence results to frontend
  broadcast({
    type: "intelligence_update",
    data: {
      classifications: classifications.length,
      wasteful: wasteful.length,
      decisions: decisions.length,
      actionable: actionable.length,
      potentialSavings: totalSavings,
      timestamp: new Date().toISOString(),
    },
  });

  console.log("[Intelligence] ─── Pipeline complete ───");
}
