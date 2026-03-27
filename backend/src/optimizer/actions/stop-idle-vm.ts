import { computeInstances, config } from "../../config";
import { query } from "../../db";

export async function stopIdleVM(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const resourceResult = await query(
    `SELECT hourly_cost, metadata FROM resources WHERE resource_id = $1`,
    [anomaly.resource_id]
  );

  const costBefore = resourceResult.rows[0]?.hourly_cost || 0.0076;
  const metadata = resourceResult.rows[0]?.metadata || {};
  const zone = metadata.zone || config.gcp.zone.split("/").pop();
  const instanceName = resourceResult.rows[0]?.name || metadata.name;

  // GCP stop requires the instance name and zone, not the numeric ID.
  // We look up the name from our resources table.
  const nameResult = await query(
    `SELECT name FROM resources WHERE resource_id = $1`,
    [anomaly.resource_id]
  );
  const name = nameResult.rows[0]?.name || instanceName;

  const [operation] = await computeInstances.stop({
    project: config.gcp.projectId,
    zone,
    instance: name,
  });

  await query(
    `UPDATE resources SET status = 'STOPPING', hourly_cost = 0 WHERE resource_id = $1`,
    [anomaly.resource_id]
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
