import { computeDisks, config } from "../../config";
import { Resource } from "../../models/Resource";

export async function cleanupDisks(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const resource = await Resource.findOne({ resource_id: anomaly.resource_id }).lean();
  const costBefore = resource?.hourly_cost || 0;
  const metadata = resource?.metadata || {};
  const diskName = resource?.name || metadata.name;
  const zone = metadata.zone || config.gcp.zone.split("/").pop();

  const [operation] = await computeDisks.delete({
    project: config.gcp.projectId,
    zone,
    disk: diskName,
  });

  await Resource.deleteOne({ resource_id: anomaly.resource_id });

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
