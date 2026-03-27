import { StopInstancesCommand } from "@aws-sdk/client-ec2";
import { ec2 } from "../../config";
import { query } from "../../db";

export async function stopIdleEC2(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const resourceResult = await query(
    `SELECT hourly_cost, metadata FROM resources WHERE resource_id = $1`,
    [anomaly.resource_id]
  );

  const costBefore = resourceResult.rows[0]?.hourly_cost || 0.0116;
  const metadata = resourceResult.rows[0]?.metadata || {};

  const cmd = new StopInstancesCommand({
    InstanceIds: [anomaly.resource_id],
  });

  const response = await ec2.send(cmd);
  const stoppingState = response.StoppingInstances?.[0]?.CurrentState?.Name;

  await query(
    `UPDATE resources SET status = 'stopping', hourly_cost = 0 WHERE resource_id = $1`,
    [anomaly.resource_id]
  );

  return {
    success: stoppingState === "stopping" || stoppingState === "stopped",
    costBefore,
    costAfter: 0,
    details: {
      instanceId: anomaly.resource_id,
      instanceType: metadata.instanceType,
      previousState: response.StoppingInstances?.[0]?.PreviousState?.Name,
      currentState: stoppingState,
      message: `Stopped idle instance ${anomaly.resource_id} (${metadata.instanceType || "unknown"})`,
    },
  };
}
