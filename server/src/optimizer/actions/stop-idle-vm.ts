import { computeInstances, config } from "../../config";
import { Resource } from "../../models/Resource";

export async function stopIdleVM(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const resource = await Resource.findOne({ resource_id: anomaly.resource_id }).lean();
  const costBefore = resource?.hourly_cost || 0.0076;
  const metadata = resource?.metadata || {};
  const zone = metadata.zone || config.gcp.zone.split("/").pop();
  const name = resource?.name || metadata.name;

  const [operation] = await computeInstances.stop({
    project: config.gcp.projectId,
    zone,
    instance: name,
  });

  await Resource.updateOne(
    { resource_id: anomaly.resource_id },
    { status: "STOPPING", hourly_cost: 0 }
  );

  return {
    success: true,
    costBefore,
    costAfter: 0,
    details: {
      instanceId: anomaly.resource_id,
      instanceName: name,
      machineType: metadata.machineType,
      zone,
      operationId: operation?.latestResponse?.id,
      message: `Stopped idle VM ${name} (${metadata.machineType || "unknown"}) in ${zone}`,
    },
  };
}
