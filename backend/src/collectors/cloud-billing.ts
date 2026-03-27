import { config } from "../config";
import { query } from "../db";

// GCP Cloud Billing Export uses BigQuery — for free tier without BigQuery,
// we estimate costs from resource inventory and known pricing.
// If you have billing export enabled, replace this with a BigQuery query.

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
    const resourceResult = await query(`
      SELECT resource_type, COUNT(*) AS count,
             COALESCE(SUM(hourly_cost), 0) AS total_hourly
      FROM resources
      WHERE status IN ('RUNNING', 'active', 'READY')
      GROUP BY resource_type
    `);

    let insertCount = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0); // start of today

    for (const row of resourceResult.rows) {
      const service = GCP_SERVICE_NAMES[row.resource_type] || row.resource_type;
      const dailyCost = parseFloat(row.total_hourly) * 24;

      if (dailyCost === 0 && row.resource_type !== "gcs") continue;

      await query(
        `INSERT INTO cost_summaries (time, service, total_cost, resource_count)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [now, service, dailyCost, parseInt(row.count)]
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
  return GCP_HOURLY_PRICING[machineType] || 0.0076; // default to f1-micro
}
