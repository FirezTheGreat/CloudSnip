import { computeInstances, functionsClient, computeDisks, config } from "../../config";
import { Resource } from "../../models/Resource";
import { Action } from "../../models/Action";

const REVERSIBLE_ACTIONS = new Set(["stop_instance", "cap_instances", "label_resource"]);

export function isReversible(actionType: string): boolean {
  return REVERSIBLE_ACTIONS.has(actionType);
}

function isDemoResource(resourceId: string): boolean {
  if (!config.gcp.projectId?.trim()) return true;
  if (resourceId.startsWith("i-")) return true;
  if (resourceId.startsWith("vol-")) return true;
  if (resourceId.startsWith("fn-")) return true;
  if (resourceId.startsWith("s3-")) return true;
  if (resourceId.startsWith("synthetic")) return true;
  return false;
}

export async function rollbackAction(actionId: string) {
  const action = await Action.findById(actionId).lean();
  if (!action) throw new Error("Action not found");
  if (action.status === "rolled_back") throw new Error("Already rolled back");
  if (!isReversible(action.action_type)) {
    throw new Error(`Action type "${action.action_type}" is irreversible`);
  }

  // Demo mode: handle all rollbacks locally
  if (isDemoResource(action.resource_id)) {
    return rollbackDemo(action);
  }

  switch (action.action_type) {
    case "stop_instance":
      return rollbackStopInstance(action);
    case "cap_instances":
      return rollbackCapFunction(action);
    case "label_resource":
      return rollbackLabels(action);
    default:
      throw new Error(`No rollback handler for ${action.action_type}`);
  }
}

async function rollbackDemo(action: any) {
  const resourceName = action.details?.instanceName || action.details?.resourceName || action.resource_id;

  switch (action.action_type) {
    case "stop_instance": {
      await Resource.updateOne(
        { resource_id: action.resource_id },
        { status: "RUNNING", hourly_cost: action.cost_before_hourly || 0 }
      );
      break;
    }
    case "cap_instances": {
      const previousMax = action.details?.previousMaxInstances;
      if (previousMax && previousMax !== "unlimited") {
        await Resource.updateOne(
          { resource_id: action.resource_id },
          { $set: { "metadata.maxInstanceCount": previousMax } }
        );
      }
      break;
    }
    case "label_resource": {
      // Remove auto-applied labels
      const resource = await Resource.findOne({ resource_id: action.resource_id }).lean();
      const labels = { ...(resource?.metadata?.labels || {}) };
      delete labels["cost-intel"];
      delete labels["tagged-by"];
      delete labels["tagged-at"];
      await Resource.updateOne(
        { resource_id: action.resource_id },
        { $set: { "metadata.labels": labels, tags: labels } }
      );
      break;
    }
  }

  await Action.updateOne(
    { _id: action._id },
    { status: "rolled_back", $set: { "details.rollback_at": new Date().toISOString() } }
  );

  return { message: `Rolled back ${action.action_type} on ${resourceName} (demo mode)` };
}

async function rollbackStopInstance(action: any) {
  const resource = await Resource.findOne({ resource_id: action.resource_id }).lean();
  const metadata = resource?.metadata || {};
  const zone = metadata.zone || action.details?.zone || config.gcp.zone.split("/").pop();
  const name = resource?.name || action.details?.instanceName;

  await computeInstances.start({
    project: config.gcp.projectId,
    zone,
    instance: name,
  });

  await Resource.updateOne(
    { resource_id: action.resource_id },
    { status: "RUNNING", hourly_cost: action.cost_before_hourly || 0 }
  );

  await Action.updateOne(
    { _id: action._id },
    { status: "rolled_back", $set: { "details.rollback_at": new Date().toISOString() } }
  );

  return { message: `Restarted VM ${name} in ${zone}` };
}

async function rollbackCapFunction(action: any) {
  const previousMax = action.details?.previousMaxInstances;
  const resource = await Resource.findOne({ resource_id: action.resource_id }).lean();
  const metadata = resource?.metadata || {};
  const fullName = metadata.fullName ||
    `projects/${config.gcp.projectId}/locations/${config.gcp.region}/functions/${action.resource_id}`;

  const restoreCount = previousMax === "unlimited" ? 0 : (previousMax || 0);

  if (restoreCount > 0) {
    await functionsClient.updateFunction({
      function: {
        name: fullName,
        serviceConfig: { maxInstanceCount: restoreCount },
      } as any,
      updateMask: { paths: ["service_config.max_instance_count"] },
    });
  }

  await Action.updateOne(
    { _id: action._id },
    { status: "rolled_back", $set: { "details.rollback_at": new Date().toISOString() } }
  );

  return { message: `Restored ${action.resource_id} max instances to ${previousMax || "default"}` };
}

async function rollbackLabels(action: any) {
  const resource = await Resource.findOne({ resource_id: action.resource_id }).lean();
  const metadata = resource?.metadata || {};
  const zone = metadata.zone || config.gcp.zone.split("/").pop();
  const name = resource?.name || "";

  const labelsToRemove = ["cost-intel", "tagged-by", "tagged-at"];

  if (action.resource_type === "compute") {
    const [instance] = await computeInstances.get({
      project: config.gcp.projectId, zone, instance: name,
    });
    const labels = { ...(instance.labels || {}) };
    for (const k of labelsToRemove) delete labels[k];

    await computeInstances.setLabels({
      project: config.gcp.projectId, zone, instance: name,
      instancesSetLabelsRequestResource: {
        labels,
        labelFingerprint: instance.labelFingerprint || "",
      },
    });
  } else if (action.resource_type === "disk") {
    const [disk] = await computeDisks.get({
      project: config.gcp.projectId, zone, disk: name,
    });
    const labels = { ...(disk.labels || {}) };
    for (const k of labelsToRemove) delete labels[k];

    await computeDisks.setLabels({
      project: config.gcp.projectId, zone, resource: name,
      zoneSetLabelsRequestResource: {
        labels,
        labelFingerprint: disk.labelFingerprint || "",
      },
    });
  }

  await Action.updateOne(
    { _id: action._id },
    { status: "rolled_back", $set: { "details.rollback_at": new Date().toISOString() } }
  );

  return { message: `Removed auto-labels from ${name}` };
}
