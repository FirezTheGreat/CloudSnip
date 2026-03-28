import { computeInstances, computeDisks, config } from "../../config";
import { Resource } from "../../models/Resource";

function isDemoResource(resourceId: string): boolean {
  if (!config.gcp.projectId?.trim()) return true;
  if (resourceId.startsWith("i-")) return true;
  if (resourceId.startsWith("vol-")) return true;
  if (resourceId.startsWith("fn-")) return true;
  if (resourceId.startsWith("s3-")) return true;
  if (resourceId.startsWith("synthetic")) return true;
  return false;
}

export async function labelResources(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const resource = await Resource.findOne({ resource_id: anomaly.resource_id }).lean();
  const metadata = resource?.metadata || {};
  const name = resource?.name || "";
  const zone = metadata.zone || config.gcp.zone.split("/").pop();

  const labels: Record<string, string> = {
    ...(metadata.labels || {}),
    "cost-intel": "needs-review",
    "tagged-by": "cloud-cost-intel-auto",
    "tagged-at": new Date().toISOString().split("T")[0],
  };

  // ─── Demo Mode ────────────────────────────────────────────────────
  if (isDemoResource(anomaly.resource_id)) {
    await Resource.updateOne(
      { resource_id: anomaly.resource_id },
      {
        $set: {
          "metadata.labels": labels,
          tags: labels,
          last_seen: new Date(),
        },
      }
    );

    return {
      success: true,
      costBefore: 0,
      costAfter: 0,
      details: {
        resourceId: anomaly.resource_id,
        resourceName: name,
        labelsApplied: labels,
        message: `Labeled ${name || anomaly.resource_id} with 'needs-review'`,
        mode: "demo",
      },
    };
  }

  // ─── Live Mode ────────────────────────────────────────────────────
  try {
    if (anomaly.resource_type === "compute") {
      const [instance] = await computeInstances.get({
        project: config.gcp.projectId,
        zone,
        instance: name,
      });

      await computeInstances.setLabels({
        project: config.gcp.projectId,
        zone,
        instance: name,
        instancesSetLabelsRequestResource: {
          labels,
          labelFingerprint: instance.labelFingerprint || "",
        },
      });
    } else if (anomaly.resource_type === "disk") {
      const [disk] = await computeDisks.get({
        project: config.gcp.projectId,
        zone,
        disk: name,
      });

      await computeDisks.setLabels({
        project: config.gcp.projectId,
        zone,
        resource: name,
        zoneSetLabelsRequestResource: {
          labels,
          labelFingerprint: disk.labelFingerprint || "",
        },
      });
    }
  } catch (err: any) {
    console.error(`[Optimizer] Failed to label ${name}:`, err.message);
    return {
      success: false,
      costBefore: 0,
      costAfter: 0,
      details: {
        resourceId: anomaly.resource_id,
        resourceName: name,
        error: err.message,
      },
    };
  }

  return {
    success: true,
    costBefore: 0,
    costAfter: 0,
    details: {
      resourceId: anomaly.resource_id,
      resourceName: name,
      labelsApplied: labels,
      message: `Labeled ${name} with 'needs-review'`,
    },
  };
}
