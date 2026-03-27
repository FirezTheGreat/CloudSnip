import { computeDisks, config } from "../../config";
import { query } from "../../db";

export async function cleanupDisks(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const resourceResult = await query(
    `SELECT name, hourly_cost, metadata FROM resources WHERE resource_id = $1`,
    [anomaly.resource_id]
  );

  const costBefore = resourceResult.rows[0]?.hourly_cost || 0;
  const metadata = resourceResult.rows[0]?.metadata || {};
  const diskName = resourceResult.rows[0]?.name || metadata.name;
  const zone = metadata.zone || config.gcp.zone.split("/").pop();

  const [operation] = await computeDisks.delete({
    project: config.gcp.projectId,
    zone,
    disk: diskName,
  });

  await query(`DELETE FROM resources WHERE resource_id = $1`, [anomaly.resource_id]);

  const sizeGB = metadata.sizeGb || 10;
  const diskType = metadata.diskType || "pd-standard";

  return {
    success: true,
    costBefore,
    costAfter: 0,
    details: {
      diskId: anomaly.resource_id,
      diskName,
      sizeGB,
      diskType,
      zone,
      monthlyCostSaved: sizeGB * (diskType === "pd-ssd" ? 0.17 : 0.04),
      message: `Deleted unattached disk ${diskName} (${sizeGB} GB ${diskType}) in ${zone}`,
    },
  };
}
