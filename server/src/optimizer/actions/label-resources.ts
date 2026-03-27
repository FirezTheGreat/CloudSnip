import { computeInstances, computeDisks, config } from "../../config";
import { Resource } from "../../models/Resource";

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
