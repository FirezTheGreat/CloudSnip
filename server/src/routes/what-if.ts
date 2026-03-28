/**
 * What-If Cost Simulator Route
 * POST /api/costs/what-if
 *
 * Takes a hypothetical resource configuration change and returns
 * projected cost delta without touching any real GCP resources.
 */

import { Router } from "express";
import { Resource } from "../models/Resource";
import { Metric } from "../models/Metric";

const router = Router();

// ─── GCP pricing tables (us-central1, on-demand) ──────────────────────────────

const VM_HOURLY_COSTS: Record<string, number> = {
  "e2-micro":       0.0076,
  "e2-small":       0.0152,
  "e2-medium":      0.0304,
  "e2-standard-2":  0.0671,
  "e2-standard-4":  0.1342,
  "e2-standard-8":  0.2684,
  "n1-standard-1":  0.0475,
  "n1-standard-2":  0.0950,
  "n1-standard-4":  0.1900,
  "n1-standard-8":  0.3800,
  "n2-standard-2":  0.0971,
  "n2-standard-4":  0.1942,
  "n2-standard-8":  0.3885,
  "c2-standard-4":  0.2088,
  "c2-standard-8":  0.4176,
};

// Cloud Function: $/million invocations (first 2M free per month)
const CF_COST_PER_MILLION_INVOCATIONS = 0.40;
const CF_GB_SECOND_COST = 0.0000025;

// Persistent disk cost: $/GB/month → to hourly
const DISK_GB_MONTH: Record<string, number> = {
  "pd-standard": 0.04,
  "pd-balanced":  0.10,
  "pd-ssd":       0.17,
};

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const {
      resource_id,
      change_type, // "machine_type" | "vm_count" | "max_instances" | "disk_size" | "disk_type"
      current_value,
      new_value,
      unit_count = 1, // e.g. number of VMs with this machine type
    } = req.body;

    if (!change_type || new_value === undefined) {
      return res.status(400).json({ error: "change_type and new_value are required" });
    }

    let currentCostHourly = 0;
    let projectedCostHourly = 0;
    let label = "";
    let unit = "$/hr";
    let resource = null;

    if (resource_id) {
      resource = await Resource.findOne({ resource_id }).lean();
      if (resource) currentCostHourly = resource.hourly_cost || 0;
    }

    switch (change_type) {
      case "machine_type": {
        const from = current_value || resource?.metadata?.machineType || "e2-medium";
        const to = new_value as string;
        const fromCost = VM_HOURLY_COSTS[from] ?? currentCostHourly;
        const toCost = VM_HOURLY_COSTS[to] ?? fromCost;
        currentCostHourly = fromCost * unit_count;
        projectedCostHourly = toCost * unit_count;
        label = `${unit_count > 1 ? unit_count + "× " : ""}${from} → ${to}`;
        break;
      }

      case "vm_count": {
        const machineType = current_value || resource?.metadata?.machineType || "e2-medium";
        const costPerVm = VM_HOURLY_COSTS[machineType] ?? 0.03;
        const fromCount = Number(resource ? 1 : (current_value || 1));
        const toCount = Number(new_value);
        currentCostHourly = costPerVm * fromCount;
        projectedCostHourly = costPerVm * toCount;
        label = `${fromCount} → ${toCount} VMs (${machineType})`;
        break;
      }

      case "max_instances": {
        // Cloud Function billing: approximate based on max instances × avg duration × invocations
        const fromInstances = Number(current_value || resource?.metadata?.maxInstanceCount || 100);
        const toInstances = Number(new_value);
        // Rough estimate: each max instance slot costs ~$0.001/hr in reserved capacity
        currentCostHourly = fromInstances * 0.001;
        projectedCostHourly = toInstances * 0.001;
        label = `max instances: ${fromInstances} → ${toInstances}`;
        break;
      }

      case "disk_size": {
        const diskType = (current_value || resource?.metadata?.diskType || "pd-standard") as string;
        const costPerGbMonth = DISK_GB_MONTH[diskType] ?? 0.04;
        const costPerGbHr = costPerGbMonth / 730;
        const fromGb = Number(resource?.metadata?.sizeGb || 10);
        const toGb = Number(new_value);
        currentCostHourly = fromGb * costPerGbHr;
        projectedCostHourly = toGb * costPerGbHr;
        label = `disk: ${fromGb}GB → ${toGb}GB (${diskType})`;
        unit = "$/hr";
        break;
      }

      case "disk_type": {
        const sizeGb = Number(current_value || resource?.metadata?.sizeGb || 10);
        const fromType = resource?.metadata?.diskType || "pd-standard";
        const toType = new_value as string;
        currentCostHourly = sizeGb * ((DISK_GB_MONTH[fromType] ?? 0.04) / 730);
        projectedCostHourly = sizeGb * ((DISK_GB_MONTH[toType] ?? 0.04) / 730);
        label = `${sizeGb}GB: ${fromType} → ${toType}`;
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown change_type: ${change_type}` });
    }

    const savingsHourly = currentCostHourly - projectedCostHourly;
    const savingsMonthly = savingsHourly * 730;
    const savingsYearly = savingsMonthly * 12;

    // Historical context: fetch last 7d average actual cost for this resource
    let historicalAvgHourly = currentCostHourly;
    if (resource_id) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hist = await Metric.aggregate([
        { $match: { resource_id, metric_name: "estimated_cost", time: { $gt: sevenDaysAgo } } },
        { $group: { _id: null, avg: { $avg: "$value" } } },
      ]);
      if (hist[0]) historicalAvgHourly = hist[0].avg;
    }

    return res.json({
      label,
      unit,
      change_type,
      current_value,
      new_value,
      current_cost_hourly: Number(currentCostHourly.toFixed(6)),
      projected_cost_hourly: Number(projectedCostHourly.toFixed(6)),
      current_cost_monthly: Number((currentCostHourly * 730).toFixed(2)),
      projected_cost_monthly: Number((projectedCostHourly * 730).toFixed(2)),
      savings_hourly: Number(savingsHourly.toFixed(6)),
      savings_monthly: Number(savingsMonthly.toFixed(2)),
      savings_yearly: Number(savingsYearly.toFixed(2)),
      percent_change: currentCostHourly > 0
        ? Number((((projectedCostHourly - currentCostHourly) / currentCostHourly) * 100).toFixed(1))
        : 0,
      historical_avg_hourly: Number(historicalAvgHourly.toFixed(6)),
      resource_name: resource?.name || resource_id || null,
      resource_type: resource?.resource_type || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/costs/what-if/options
 * Returns available machine types and disk types for the simulator UI.
 */
router.get("/options", (_req, res) => {
  res.json({
    machine_types: Object.entries(VM_HOURLY_COSTS).map(([type, cost]) => ({
      type,
      hourly_cost: cost,
      monthly_cost: Number((cost * 730).toFixed(2)),
    })).sort((a, b) => a.hourly_cost - b.hourly_cost),
    disk_types: Object.entries(DISK_GB_MONTH).map(([type, costPerGbMonth]) => ({
      type,
      cost_per_gb_month: costPerGbMonth,
    })),
  });
});

export default router;
