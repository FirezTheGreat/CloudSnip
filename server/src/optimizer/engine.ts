import { config } from "../config";
import { Anomaly } from "../models/Anomaly";
import { Action } from "../models/Action";
import { stopIdleVM } from "./actions/stop-idle-vm";
import { capCloudFunction } from "./actions/cap-cloud-function";
import { cleanupDisks } from "./actions/cleanup-disks";
import { labelResources } from "./actions/label-resources";
import { broadcast } from "../websocket";

interface AnomalyRecord {
  _id: any;
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
  const severityOrder = { critical: 1, high: 2, medium: 3, low: 4 };
  const anomalies = await Anomaly.find({ resolved: false })
    .sort({ anomaly_score: -1 })
    .lean();

  anomalies.sort(
    (a, b) =>
      (severityOrder[a.severity as keyof typeof severityOrder] || 4) -
      (severityOrder[b.severity as keyof typeof severityOrder] || 4)
  );

  if (anomalies.length === 0) {
    console.log("[Optimizer] No unresolved anomalies");
    return;
  }

  console.log(`[Optimizer] Processing ${anomalies.length} unresolved anomalies`);

  for (const anomaly of anomalies as AnomalyRecord[]) {
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
        await Anomaly.updateOne(
          { _id: anomaly._id },
          { resolved: true, resolved_at: new Date(), resolved_by: mapping.actionType }
        );

        broadcast({
          type: "action_completed",
          data: {
            anomalyId: anomaly._id,
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

  await Action.create({
    anomaly_id: anomaly._id,
    resource_id: anomaly.resource_id,
    resource_type: anomaly.resource_type,
    action_type: actionType,
    status: success ? "success" : "failed",
    cost_before_hourly: costBefore,
    cost_after_hourly: costAfter,
    savings_hourly: savingsHourly,
    savings_monthly_projected: savingsMonthly,
    details,
    dry_run: config.dryRun,
  });
}
