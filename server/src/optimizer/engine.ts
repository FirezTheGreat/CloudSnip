import { config } from "../config";
import { Anomaly } from "../models/Anomaly";
import { Action } from "../models/Action";
import { stopIdleVM } from "./actions/stop-idle-vm";
import { capCloudFunction } from "./actions/cap-cloud-function";
import { cleanupDisks } from "./actions/cleanup-disks";
import { labelResources } from "./actions/label-resources";
import { broadcast } from "../socket-io";
import { generateExplanation } from "../notifications/explanation";
import { notifyActionTaken, notifyApprovalNeeded } from "../notifications/slack";

interface AnomalyRecord {
  _id: any;
  resource_id: string;
  resource_type: string;
  anomaly_type: string;
  severity: string;
  anomaly_score: number;
  description?: string;
  metric_snapshot?: Record<string, number>;
}

function actionMatchesResourceType(anomaly: AnomalyRecord, actionType: string): boolean {
  const t = anomaly.resource_type;
  switch (actionType) {
    case "stop_instance":
      return t === "compute";
    case "cap_instances":
      return t === "cloud_function";
    case "delete_disk":
      return t === "disk";
    default:
      return true;
  }
}

type ActionHandler = (anomaly: AnomalyRecord) => Promise<{
  success: boolean;
  costBefore: number;
  costAfter: number;
  details: Record<string, any>;
}>;

const ACTION_MAP: Record<string, { handler: ActionHandler; actionType: string }> = {
  idle_instance:    { handler: stopIdleVM,       actionType: "stop_instance" },
  runaway_function: { handler: capCloudFunction, actionType: "cap_instances" },
  unused_volume:    { handler: cleanupDisks,     actionType: "delete_disk" },
  untagged_resource:{ handler: labelResources,   actionType: "label_resource" },
  // Simulated scenarios that map to label/alert actions
  traffic_spike:    { handler: labelResources,   actionType: "label_resource" },
  cost_spike:       { handler: labelResources,   actionType: "label_resource" },
  usage_anomaly:    { handler: labelResources,   actionType: "label_resource" },
};

const AUTO_APPROVE_SEVERITIES = new Set(["critical", "high"]);

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
      if (!actionMatchesResourceType(anomaly, mapping.actionType)) {
        console.log(
          `[Optimizer] Skip ${mapping.actionType} on ${anomaly.resource_id}: resource_type is ${anomaly.resource_type}`
        );
        continue;
      }

      if (config.dryRun) {
        console.log(`[Optimizer] DRY RUN — would execute ${mapping.actionType} on ${anomaly.resource_id}`);
        await logAction(anomaly, mapping.actionType, "dry_run", 0, 0, { dry_run: true });
        continue;
      }

      const autoApprove = AUTO_APPROVE_SEVERITIES.has(anomaly.severity);

      if (!autoApprove) {
        console.log(`[Optimizer] Queuing ${mapping.actionType} on ${anomaly.resource_id} for approval (severity: ${anomaly.severity})`);
        await logAction(anomaly, mapping.actionType, "pending_approval", 0, 0, {
          message: `Awaiting approval — ${anomaly.anomaly_type} on ${anomaly.resource_id}`,
          anomaly_severity: anomaly.severity,
          anomaly_score: anomaly.anomaly_score,
        });

        broadcast({
          type: "approval_needed",
          data: {
            anomalyId: anomaly._id,
            resourceId: anomaly.resource_id,
            actionType: mapping.actionType,
            severity: anomaly.severity,
          },
        });

        // Slack: approval needed (non-blocking)
        notifyApprovalNeeded({
          resourceId: anomaly.resource_id,
          actionType: mapping.actionType,
          severity: anomaly.severity,
          anomalyType: anomaly.anomaly_type,
          description: anomaly.description || `${anomaly.anomaly_type} on ${anomaly.resource_id}`,
        }).catch(() => null);

        continue;
      }

      console.log(`[Optimizer] Auto-executing ${mapping.actionType} on ${anomaly.resource_id} (severity: ${anomaly.severity})`);
      await executeAction(anomaly, mapping);
    } catch (err: any) {
      console.error(`[Optimizer] Failed ${mapping.actionType} on ${anomaly.resource_id}:`, err.message);
      await logAction(anomaly, mapping.actionType, "failed", 0, 0, { error: err.message });
    }
  }
}

export async function executeAction(
  anomaly: AnomalyRecord,
  mapping: { handler: ActionHandler; actionType: string }
) {
  const result = await mapping.handler(anomaly);
  const savingsHourly = result.costBefore - result.costAfter;
  const savingsMonthly = savingsHourly * 730;

  await logAction(
    anomaly,
    mapping.actionType,
    result.success ? "success" : "failed",
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

    // Slack: action taken (non-blocking)
    const explanation = generateExplanation({
      anomalyType: anomaly.anomaly_type,
      resourceId: anomaly.resource_id,
      resourceType: anomaly.resource_type,
      severity: anomaly.severity,
      anomalyScore: anomaly.anomaly_score,
      metrics: anomaly.metric_snapshot || {},
      actionType: mapping.actionType,
      actionStatus: "success",
      savingsMonthly,
    });

    notifyActionTaken({
      explanation,
      resourceId: anomaly.resource_id,
      resourceType: anomaly.resource_type,
      actionType: mapping.actionType,
      severity: anomaly.severity,
      savingsMonthly,
      savingsHourly,
      executedAt: new Date(),
    }).catch(() => null);
  }
}

export async function approveAction(actionId: string) {
  const action = await Action.findById(actionId);
  if (!action) throw new Error("Action not found");
  if (action.status !== "pending_approval") throw new Error("Action is not pending approval");

  const anomaly = await Anomaly.findById(action.anomaly_id).lean();
  if (!anomaly) throw new Error("Associated anomaly not found");

  const mapping = ACTION_MAP[anomaly.anomaly_type];
  if (!mapping) throw new Error(`No handler for anomaly type: ${anomaly.anomaly_type}`);

  await Action.deleteOne({ _id: action._id });

  await executeAction(anomaly as AnomalyRecord, mapping);
  return { message: `Action ${mapping.actionType} executed on ${action.resource_id}` };
}

export async function rejectAction(actionId: string) {
  const action = await Action.findById(actionId);
  if (!action) throw new Error("Action not found");
  if (action.status !== "pending_approval") throw new Error("Action is not pending approval");

  await Action.updateOne({ _id: action._id }, { status: "rejected" });

  if (action.anomaly_id) {
    await Anomaly.updateOne(
      { _id: action.anomaly_id },
      { resolved: true, resolved_at: new Date(), resolved_by: "rejected" }
    );
  }

  return { message: `Action rejected for ${action.resource_id}` };
}

async function logAction(
  anomaly: AnomalyRecord,
  actionType: string,
  status: string,
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
    status,
    cost_before_hourly: costBefore,
    cost_after_hourly: costAfter,
    savings_hourly: savingsHourly,
    savings_monthly_projected: savingsMonthly,
    details,
    dry_run: config.dryRun,
  });
}
