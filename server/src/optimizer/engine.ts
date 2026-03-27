import { config } from "../config";
import { Anomaly } from "../models/Anomaly";
import { Action } from "../models/Action";
import { Resource } from "../models/Resource";
import { broadcast } from "../websocket";

interface AnomalyRecord {
  _id: any;
  resource_id: string;
  resource_type: string;
  anomaly_type: string;
  severity: string;
  anomaly_score: number;
}

type ActionResult = {
  success: boolean;
  costBefore: number;
  costAfter: number;
  details: Record<string, any>;
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
    const actionType = getActionType(anomaly.anomaly_type);
    if (!actionType) {
      console.log(`[Optimizer] No action mapped for: ${anomaly.anomaly_type}`);
      continue;
    }

    try {
      if (config.dryRun) {
        console.log(`[Optimizer] DRY RUN — would execute ${actionType} on ${anomaly.resource_id}`);
        await logAction(anomaly, actionType, true, 0, 0, { dry_run: true });
        continue;
      }

      console.log(`[Optimizer] Executing ${actionType} on ${anomaly.resource_id}...`);

      let result: ActionResult;

      if (config.simulationMode) {
        result = await simulateAction(anomaly, actionType);
      } else {
        result = await executeRealAction(anomaly, actionType);
      }

      const savingsHourly = result.costBefore - result.costAfter;
      const savingsMonthly = savingsHourly * 730;

      await logAction(anomaly, actionType, result.success, result.costBefore, result.costAfter, result.details);

      if (result.success) {
        await Anomaly.updateOne(
          { _id: anomaly._id },
          { resolved: true, resolved_at: new Date(), resolved_by: actionType }
        );

        broadcast({
          type: "action_completed",
          data: {
            anomalyId: anomaly._id,
            resourceId: anomaly.resource_id,
            actionType,
            savingsHourly,
            savingsMonthly,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (err: any) {
      console.error(`[Optimizer] Failed ${actionType} on ${anomaly.resource_id}:`, err.message);
      await logAction(anomaly, actionType, false, 0, 0, { error: err.message });
    }
  }
}

function getActionType(anomalyType: string): string | null {
  const map: Record<string, string> = {
    idle_instance: "stop_instance",
    runaway_function: "cap_instances",
    unused_volume: "delete_disk",
    untagged_resource: "label_resource",
  };
  return map[anomalyType] || null;
}

async function simulateAction(anomaly: AnomalyRecord, actionType: string): Promise<ActionResult> {
  const resource = await Resource.findOne({ resource_id: anomaly.resource_id }).lean();
  const costBefore = resource?.hourly_cost || 0.0076;
  const name = resource?.name || anomaly.resource_id;

  await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

  switch (actionType) {
    case "stop_instance":
      await Resource.updateOne(
        { resource_id: anomaly.resource_id },
        { status: "STOPPED", hourly_cost: 0 }
      );
      return {
        success: true,
        costBefore,
        costAfter: 0,
        details: {
          instanceName: name,
          machineType: resource?.metadata?.machineType || "e2-micro",
          zone: resource?.metadata?.zone || "us-central1-a",
          message: `Stopped idle VM ${name} (${resource?.metadata?.machineType || "unknown"})`,
          simulatedAction: true,
        },
      };

    case "cap_instances":
      return {
        success: true,
        costBefore: 0,
        costAfter: 0,
        details: {
          functionName: name,
          maxInstancesSet: config.thresholds.maxFunctionInstances,
          previousMaxInstances: resource?.metadata?.maxInstanceCount || "unlimited",
          message: `Capped ${name} to max ${config.thresholds.maxFunctionInstances} instances`,
          simulatedAction: true,
        },
      };

    case "delete_disk":
      await Resource.deleteOne({ resource_id: anomaly.resource_id });
      return {
        success: true,
        costBefore,
        costAfter: 0,
        details: {
          diskName: name,
          sizeGB: resource?.metadata?.sizeGb || 10,
          diskType: resource?.metadata?.diskType || "pd-standard",
          message: `Deleted unattached disk ${name} (${resource?.metadata?.sizeGb || 10} GB)`,
          simulatedAction: true,
        },
      };

    case "label_resource":
      return {
        success: true,
        costBefore: 0,
        costAfter: 0,
        details: {
          resourceName: name,
          labelsApplied: { "cost-intel": "needs-review" },
          message: `Labeled ${name} with 'needs-review'`,
          simulatedAction: true,
        },
      };

    default:
      return { success: false, costBefore: 0, costAfter: 0, details: { error: "Unknown action" } };
  }
}

async function executeRealAction(anomaly: AnomalyRecord, actionType: string): Promise<ActionResult> {
  switch (actionType) {
    case "stop_instance": {
      const { stopIdleVM } = await import("./actions/stop-idle-vm");
      return stopIdleVM(anomaly);
    }
    case "cap_instances": {
      const { capCloudFunction } = await import("./actions/cap-cloud-function");
      return capCloudFunction(anomaly);
    }
    case "delete_disk": {
      const { cleanupDisks } = await import("./actions/cleanup-disks");
      return cleanupDisks(anomaly);
    }
    case "label_resource": {
      const { labelResources } = await import("./actions/label-resources");
      return labelResources(anomaly);
    }
    default:
      return { success: false, costBefore: 0, costAfter: 0, details: { error: "Unknown action" } };
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
