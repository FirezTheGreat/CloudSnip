import { functionsClient, config } from "../../config";
import { query } from "../../db";

export async function capCloudFunction(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const maxInstances = config.thresholds.maxFunctionInstances;

  const resourceResult = await query(
    `SELECT metadata FROM resources WHERE resource_id = $1`,
    [anomaly.resource_id]
  );
  const metadata = resourceResult.rows[0]?.metadata || {};
  const fullName = metadata.fullName ||
    `projects/${config.gcp.projectId}/locations/${config.gcp.region}/functions/${anomaly.resource_id}`;

  const [operation] = await functionsClient.updateFunction({
    function: {
      name: fullName,
      serviceConfig: {
        maxInstanceCount: maxInstances,
      },
    },
    updateMask: {
      paths: ["service_config.max_instance_count"],
    },
  });

  return {
    success: true,
    costBefore: 0,
    costAfter: 0,
    details: {
      functionName: anomaly.resource_id,
      maxInstancesSet: maxInstances,
      previousMaxInstances: metadata.maxInstanceCount || "unlimited",
      message: `Capped ${anomaly.resource_id} to max ${maxInstances} instances`,
    },
  };
}
