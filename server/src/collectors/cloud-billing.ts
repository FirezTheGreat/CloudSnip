import { Resource } from "../models/Resource";
import { CostSummary } from "../models/CostSummary";

const GCP_HOURLY_PRICING: Record<string, number> = {
  "e2-micro": 0.00838,
  "e2-small": 0.01675,
  "e2-medium": 0.03351,
  "f1-micro": 0.0076,
  "n1-standard-1": 0.0475,
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

    let insertCount = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const row of pipeline) {
      const service = GCP_SERVICE_NAMES[row._id] || row._id;
      const dailyCost = row.total_hourly * 24;

      if (dailyCost === 0 && row._id !== "gcs") continue;

      await CostSummary.updateOne(
        { time: now, service },
        { $set: { total_cost: dailyCost, resource_count: row.count } },
        { upsert: true }
      );

      insertCount++;
    }

    console.log(`[CloudBilling] Estimated ${insertCount} cost records from resource inventory`);
    return insertCount;
  } catch (err: any) {
    console.error("[CloudBilling] Error:", err.message);
    return 0;
  }
}

export function getHourlyCost(machineType: string): number {
  return GCP_HOURLY_PRICING[machineType] || 0.0076;
}
