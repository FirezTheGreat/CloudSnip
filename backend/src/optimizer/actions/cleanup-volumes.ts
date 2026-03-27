import { DeleteVolumeCommand } from "@aws-sdk/client-ec2";
import { ec2 } from "../../config";
import { query } from "../../db";

export async function cleanupVolumes(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const resourceResult = await query(
    `SELECT hourly_cost, metadata FROM resources WHERE resource_id = $1`,
    [anomaly.resource_id]
  );

  const costBefore = resourceResult.rows[0]?.hourly_cost || 0;
  const metadata = resourceResult.rows[0]?.metadata || {};

  const cmd = new DeleteVolumeCommand({
    VolumeId: anomaly.resource_id,
  });

  await ec2.send(cmd);

  await query(`DELETE FROM resources WHERE resource_id = $1`, [anomaly.resource_id]);

  const sizeGB = metadata.size || 8;

  return {
    success: true,
    costBefore,
    costAfter: 0,
    details: {
      volumeId: anomaly.resource_id,
      sizeGB,
      volumeType: metadata.volumeType,
      monthlyCostSaved: sizeGB * 0.10,
      message: `Deleted unattached volume ${anomaly.resource_id} (${sizeGB} GB ${metadata.volumeType || "gp2"})`,
    },
  };
}
