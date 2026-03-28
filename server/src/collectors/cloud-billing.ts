import { Resource } from "../models/Resource";
import { Metric } from "../models/Metric";
import { CostSummary } from "../models/CostSummary";

const GCP_HOURLY_PRICING: Record<string, number> = {
  "e2-micro": 0.00838,
  "e2-small": 0.01675,
  "e2-medium": 0.03351,
  "f1-micro": 0.0076,
  "n1-standard-1": 0.0475,
  "n1-standard-2": 0.095,
  "n1-standard-4": 0.19,
  "n2-standard-2": 0.0971,
  "n2-standard-4": 0.1942,
  "e2-standard-2": 0.06701,
  "e2-standard-4": 0.13402,
  "g1-small": 0.0257,
};

const GCP_SERVICE_NAMES: Record<string, string> = {
  compute: "Compute Engine",
  cloud_function: "Cloud Functions",
  gcs: "Cloud Storage",
  disk: "Persistent Disk",
  cloud_sql: "Cloud SQL",
};

export async function collectCostData() {
  try {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const activeResources = await Resource.find({
      status: { $in: ["RUNNING", "active", "READY", "unattached"] },
    }).lean();

    let metricCount = 0;
    for (const res of activeResources) {
      if (res.hourly_cost > 0) {
        await Metric.create({
          time: now,
          resource_id: res.resource_id,
          resource_type: res.resource_type,
          metric_name: "estimated_cost",
          value: res.hourly_cost,
          unit: "USD/hr",
        });
        metricCount++;
      }
    }

    const totalHourly = activeResources.reduce((s, r) => s + (Number(r.hourly_cost) || 0), 0);
    await Metric.create({
      time: now,
      resource_id: "_fleet",
      resource_type: "fleet",
      metric_name: "estimated_cost",
      value: totalHourly,
      unit: "USD/hr",
    });
    metricCount++;

    const pipeline = await Resource.aggregate([
      { $match: { status: { $in: ["RUNNING", "active", "READY"] } } },
      {
        $group: {
          _id: "$resource_type",
          count: { $sum: 1 },
          total_hourly: { $sum: "$hourly_cost" },
        },
      },
    ]);

    let summaryCount = 0;
    for (const row of pipeline) {
      const service = GCP_SERVICE_NAMES[row._id] || row._id;
      const dailyCost = row.total_hourly * 24;

      if (dailyCost === 0 && row._id !== "gcs") continue;

      await CostSummary.updateOne(
        { time: dayStart, service },
        { $set: { total_cost: dailyCost, resource_count: row.count } },
        { upsert: true }
      );

      summaryCount++;
    }

    console.log(`[CloudBilling] Wrote ${metricCount} cost metrics, ${summaryCount} daily summaries`);
    return metricCount;
  } catch (err: any) {
    console.error("[CloudBilling] Error:", err.message);
    return 0;
  }
}

export function getHourlyCost(machineType: string): number {
  return GCP_HOURLY_PRICING[machineType] || 0.0076;
}
