import { computeInstances, computeDisks, config } from "../../config";
import { query } from "../../db";

export async function labelResources(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const resourceResult = await query(
    `SELECT name, metadata FROM resources WHERE resource_id = $1`,
    [anomaly.resource_id]
  );

  const metadata = resourceResult.rows[0]?.metadata || {};
  const name = resourceResult.rows[0]?.name || "";
  const zone = metadata.zone || config.gcp.zone.split("/").pop();

  const labels: Record<string, string> = {
    ...(metadata.labels || {}),
    "cost-intel": "needs-review",
    "tagged-by": "cloud-cost-intel-auto",
    "tagged-at": new Date().toISOString().split("T")[0],
  };

  if (anomaly.resource_type === "compute") {
    // For compute instances, we need the current fingerprint
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
