import { computeDisks, config } from "../../config";
import { Resource } from "../../models/Resource";

function isDemoResource(resourceId: string): boolean {
  if (!config.gcp.projectId?.trim()) return true;
  if (resourceId.startsWith("vol-")) return true;
  if (resourceId.startsWith("synthetic")) return true;
  if (resourceId.startsWith("i-")) return true;
  return false;
}

export async function cleanupDisks(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const resource = await Resource.findOne({ resource_id: anomaly.resource_id }).lean();
  const costBefore = resource?.hourly_cost || 0;
  const metadata = resource?.metadata || {};
  const diskName = resource?.name || metadata.name;
  const zone = metadata.zone || config.gcp.zone.split("/").pop();
  const sizeGB = metadata.sizeGb || 10;
  const diskType = metadata.diskType || "pd-standard";

  // ─── Demo Mode ────────────────────────────────────────────────────
  if (isDemoResource(anomaly.resource_id)) {
    // Mark as deleted in DB (don't actually remove — just change status)
    await Resource.updateOne(
      { resource_id: anomaly.resource_id },
      { status: "DELETED", hourly_cost: 0, last_seen: new Date() }
    );

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
        monthlyCostSaved: Number((costBefore * 730).toFixed(2)),
        message: `Deleted unattached disk ${diskName} (${sizeGB} GB ${diskType}) — saving $${(costBefore * 730).toFixed(2)}/mo`,
        mode: "demo",
      },
    };
  }

  // ─── Live Mode ────────────────────────────────────────────────────
  const [operation] = await computeDisks.delete({
    project: config.gcp.projectId,
    zone,
    disk: diskName,
  });

  await Resource.deleteOne({ resource_id: anomaly.resource_id });

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
