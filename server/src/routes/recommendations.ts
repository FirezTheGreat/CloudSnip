import { Router } from "express";
import { Resource } from "../models/Resource";
import { Metric } from "../models/Metric";
import { getDowngradeTarget } from "../intelligence/pricing";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recommendations: any[] = [];

    const computeResources = await Resource.find({
      resource_type: "compute",
      status: "RUNNING",
    }).lean();

    for (const resource of computeResources) {
      const avgMetrics = await Metric.aggregate([
        {
          $match: {
            resource_id: resource.resource_id,
            metric_name: "cpuutilization",
            time: { $gt: sevenDaysAgo },
          },
        },
        {
          $group: {
            _id: null,
            avg_cpu: { $avg: "$value" },
            max_cpu: { $max: "$value" },
            sample_count: { $sum: 1 },
          },
        },
      ]);

      if (avgMetrics.length === 0) continue;
      const { avg_cpu, max_cpu, sample_count } = avgMetrics[0];

      const machineType = resource.metadata?.machineType || "unknown";
      const downgrade = getDowngradeTarget(machineType);

      if (avg_cpu < 15 && max_cpu < 50 && downgrade) {
        const monthlySavings = (resource.hourly_cost || 0) * 730 * (downgrade.savingsPct / 100);
        recommendations.push({
          id: `rightsize-${resource.resource_id}`,
          type: "rightsize",
          resource_id: resource.resource_id,
          resource_name: resource.name,
          resource_type: "compute",
          current_config: machineType,
          recommended_config: downgrade.target,
          reason: `Average CPU ${avg_cpu.toFixed(1)}% over ${sample_count} samples (max ${max_cpu.toFixed(1)}%)`,
          estimated_monthly_savings: Number(monthlySavings.toFixed(2)),
          confidence: avg_cpu < 5 ? "high" : avg_cpu < 10 ? "medium" : "low",
        });
      } else if (avg_cpu < 5 && sample_count > 10) {
        const monthlySavings = (resource.hourly_cost || 0) * 730;
        recommendations.push({
          id: `stop-${resource.resource_id}`,
          type: "stop_idle",
          resource_id: resource.resource_id,
          resource_name: resource.name,
          resource_type: "compute",
          current_config: machineType,
          recommended_config: "STOPPED",
          reason: `Near-zero CPU (${avg_cpu.toFixed(1)}%) over ${sample_count} samples — likely unused`,
          estimated_monthly_savings: Number(monthlySavings.toFixed(2)),
          confidence: "high",
        });
      }
    }

    const unattachedDisks = await Resource.find({
      resource_type: "disk",
      status: "unattached",
    }).lean();

    for (const disk of unattachedDisks) {
      const monthlySavings = (disk.hourly_cost || 0) * 730;
      if (monthlySavings <= 0) continue;
      recommendations.push({
        id: `cleanup-${disk.resource_id}`,
        type: "delete_unused",
        resource_id: disk.resource_id,
        resource_name: disk.name,
        resource_type: "disk",
        current_config: `${disk.metadata?.sizeGb || "?"}GB ${disk.metadata?.diskType || "pd-standard"}`,
        recommended_config: "DELETE",
        reason: "Disk is not attached to any instance",
        estimated_monthly_savings: Number(monthlySavings.toFixed(2)),
        confidence: "high",
      });
    }

    recommendations.sort((a, b) => b.estimated_monthly_savings - a.estimated_monthly_savings);
    const totalSavings = recommendations.reduce((s, r) => s + r.estimated_monthly_savings, 0);

    res.json({
      data: recommendations,
      total_potential_savings: Number(totalSavings.toFixed(2)),
      count: recommendations.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
