import { query } from "../db";
import { config } from "../config";
import { stopIdleVM } from "./actions/stop-idle-vm";
import { capCloudFunction } from "./actions/cap-cloud-function";
import { cleanupDisks } from "./actions/cleanup-disks";
import { labelResources } from "./actions/label-resources";
import { broadcast } from "../websocket";

interface AnomalyRecord {
  id: string;
  resource_id: string;
  resource_type: string;
  anomaly_type: string;
  severity: string;
  anomaly_score: number;
}

type ActionHandler = (anomaly: AnomalyRecord) => Promise<{
  success: boolean;
  costBefore: number;
  costAfter: number;
  details: Record<string, any>;
}>;

const ACTION_MAP: Record<string, { handler: ActionHandler; actionType: string }> = {
  idle_instance: { handler: stopIdleVM, actionType: "stop_instance" },
  runaway_function: { handler: capCloudFunction, actionType: "cap_instances" },
  unused_volume: { handler: cleanupDisks, actionType: "delete_disk" },
  untagged_resource: { handler: labelResources, actionType: "label_resource" },
};

export async function processAnomalies() {
  const result = await query(`
    SELECT id, resource_id, resource_type, anomaly_type, severity, anomaly_score
    FROM anomalies
    WHERE resolved = FALSE
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      anomaly_score DESC
  `);

  if (result.rows.length === 0) {
    console.log("[Optimizer] No unresolved anomalies");
    return;
  }

  console.log(`[Optimizer] Processing ${result.rows.length} unresolved anomalies`);

  for (const anomaly of result.rows as AnomalyRecord[]) {
    const mapping = ACTION_MAP[anomaly.anomaly_type];
    if (!mapping) {
      console.log(`[Optimizer] No action mapped for anomaly type: ${anomaly.anomaly_type}`);
      continue;
    }

    try {
      if (config.dryRun) {
        console.log(`[Optimizer] DRY RUN — would execute ${mapping.actionType} on ${anomaly.resource_id}`);
        await logAction(anomaly, mapping.actionType, true, 0, 0, { dry_run: true });
        continue;
      }

      console.log(`[Optimizer] Executing ${mapping.actionType} on ${anomaly.resource_id}...`);

      const result = await mapping.handler(anomaly);
      const savingsHourly = result.costBefore - result.costAfter;
      const savingsMonthly = savingsHourly * 730;

      await logAction(
        anomaly,
        mapping.actionType,
        result.success,
        result.costBefore,
        result.costAfter,
        result.details
      );

      if (result.success) {
        await query(
          `UPDATE anomalies SET resolved = TRUE, resolved_at = NOW(), resolved_by = $1 WHERE id = $2`,
          [mapping.actionType, anomaly.id]
        );

        broadcast({
          type: "action_completed",
          data: {
            anomalyId: anomaly.id,
            resourceId: anomaly.resource_id,
            actionType: mapping.actionType,
            savingsHourly,
            savingsMonthly,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (err: any) {
      console.error(`[Optimizer] Failed ${mapping.actionType} on ${anomaly.resource_id}:`, err.message);
      await logAction(anomaly, mapping.actionType, false, 0, 0, { error: err.message });
    }
  }
}

async function logAction(
  anomaly: AnomalyRecord,
  actionType: string,
  success: boolean,
  costBefore: number,
  costAfter: number,
  details: Record<string, any>
) {
  const savingsHourly = costBefore - costAfter;
  const savingsMonthly = savingsHourly * 730;

  await query(
    `INSERT INTO actions
     (anomaly_id, resource_id, resource_type, action_type, status,
      cost_before_hourly, cost_after_hourly, savings_hourly, savings_monthly_projected,
      details, dry_run)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      anomaly.id,
      anomaly.resource_id,
      anomaly.resource_type,
      actionType,
      success ? "success" : "failed",
      costBefore,
      costAfter,
      savingsHourly,
      savingsMonthly,
      JSON.stringify(details),
      config.dryRun,
    ]
  );
}
