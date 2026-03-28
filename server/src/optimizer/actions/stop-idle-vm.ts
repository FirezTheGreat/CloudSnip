import { computeInstances, config } from "../../config";
import { Resource } from "../../models/Resource";

/**
 * Detect whether a resource is a real GCP resource or demo/seed data.
 * Real GCP compute instance IDs are purely numeric (e.g. "1234567890123").
 * Our seed IDs use AWS-style prefixes (e.g. "i-0a1b2c3d...") or contain "synthetic".
 */
function isDemoResource(resourceId: string): boolean {
  if (!config.gcp.projectId?.trim()) return true;  // No GCP project configured
  if (resourceId.startsWith("i-")) return true;
  if (resourceId.startsWith("synthetic")) return true;
  if (resourceId.startsWith("vol-")) return true;
  if (resourceId.startsWith("fn-")) return true;
  if (resourceId.startsWith("s3-")) return true;
  return false;
}

/** Resolve zone + canonical name — DB zone/name can be wrong; API 404s if either mismatches. */
async function locateComputeVm(
  projectId: string,
  resourceId: string,
  hintName?: string | null
): Promise<{ zone: string; name: string; machineType?: string } | null> {
  if (!projectId) return null;
  try {
    const iter = computeInstances.aggregatedListAsync({ project: projectId });
    for await (const [zonePath, scoped] of iter) {
      const zone = (zonePath || "").split("/").pop() || "";
      for (const inst of scoped.instances || []) {
        const idMatch = inst.id != null && String(inst.id) === String(resourceId);
        const nameMatch = Boolean(hintName && inst.name === hintName);
        if (idMatch || nameMatch) {
          const machineType = (inst.machineType || "").split("/").pop();
          return { zone, name: inst.name || hintName || resourceId, machineType };
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function stopIdleVM(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  if (anomaly.resource_type !== "compute") {
    throw new Error(
      `stop_instance applies only to Compute Engine VMs (resource_type=compute), got ${anomaly.resource_type}`
    );
  }

  const resource = await Resource.findOne({ resource_id: anomaly.resource_id }).lean();
  const costBefore = resource?.hourly_cost || 0;
  const metadata = resource?.metadata || {};
  const hintName = resource?.name || metadata.name;

  // ─── Demo Mode: simulate success locally ─────────────────────────
  if (isDemoResource(anomaly.resource_id)) {
    await Resource.updateOne(
      { resource_id: anomaly.resource_id },
      { status: "STOPPED", hourly_cost: 0, last_seen: new Date() }
    );

    return {
      success: true,
      costBefore,
      costAfter: 0,
      details: {
        instanceId: anomaly.resource_id,
        instanceName: hintName || anomaly.resource_id,
        machineType: resource?.instanceType || metadata.machineType || "unknown",
        zone: resource?.region || metadata.zone || "us-east-1a",
        message: `Stopped idle VM ${hintName || anomaly.resource_id} (${resource?.instanceType || metadata.machineType || "unknown"}) — saving $${(costBefore * 730).toFixed(2)}/mo`,
        mode: "demo",
      },
    };
  }

  // ─── Live Mode: call real GCP API ─────────────────────────────────
  const located = await locateComputeVm(config.gcp.projectId, anomaly.resource_id, hintName);

  if (!located) {
    return {
      success: false,
      costBefore,
      costAfter: costBefore,
      details: {
        message: `No VM in project ${config.gcp.projectId} matched id=${anomaly.resource_id} or name=${hintName || "?"}. It may have been deleted or belongs to another project.`,
        resource_id: anomaly.resource_id,
        hintName: hintName || null,
      },
    };
  }

  try {
    const [, operation] = await computeInstances.stop({
      project: config.gcp.projectId,
      zone: located.zone,
      instance: located.name,
    });

    await Resource.updateOne(
      { resource_id: anomaly.resource_id },
      { status: "STOPPING", hourly_cost: 0, last_seen: new Date() }
    );

    return {
      success: true,
      costBefore,
      costAfter: 0,
      details: {
        instanceId: anomaly.resource_id,
        instanceName: located.name,
        machineType: located.machineType || metadata.machineType,
        zone: located.zone,
        operationId: operation?.id != null ? String(operation.id) : undefined,
        message: `Stopped idle VM ${located.name} (${located.machineType || metadata.machineType || "unknown"}) in ${located.zone}`,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    return {
      success: false,
      costBefore,
      costAfter: costBefore,
      details: {
        error: msg,
        zone: located.zone,
        instance: located.name,
      },
    };
  }
}
