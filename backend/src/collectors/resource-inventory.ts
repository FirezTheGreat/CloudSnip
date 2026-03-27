import { computeInstances, computeDisks, functionsClient, storage, config } from "../config";
import { query } from "../db";
import { getHourlyCost } from "./cloud-billing";

const DISK_HOURLY_PER_GB: Record<string, number> = {
  "pd-standard": 0.04 / 730,   // $0.04/GB/month
  "pd-ssd": 0.17 / 730,        // $0.17/GB/month
  "pd-balanced": 0.10 / 730,   // $0.10/GB/month
};

export interface ResourceInfo {
  resourceId: string;
  resourceType: string;
  name: string;
  status: string;
  hourlyCost: number;
  metadata: Record<string, any>;
}

export async function collectResourceInventory(): Promise<ResourceInfo[]> {
  const resources: ResourceInfo[] = [];

  const [computeResult, functionResult, diskResult, storageResult] =
    await Promise.allSettled([
      collectComputeInstances(),
      collectCloudFunctions(),
      collectDisks(),
      collectStorageBuckets(),
    ]);

  if (computeResult.status === "fulfilled") resources.push(...computeResult.value);
  if (functionResult.status === "fulfilled") resources.push(...functionResult.value);
  if (diskResult.status === "fulfilled") resources.push(...diskResult.value);
  if (storageResult.status === "fulfilled") resources.push(...storageResult.value);

  for (const r of resources) {
    await query(
      `INSERT INTO resources (resource_id, resource_type, name, status, hourly_cost, last_seen, metadata)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (resource_id)
       DO UPDATE SET status = $4, hourly_cost = $5, last_seen = NOW(), metadata = $6`,
      [r.resourceId, r.resourceType, r.name, r.status, r.hourlyCost, JSON.stringify(r.metadata)]
    );
  }

  console.log(`[Inventory] Found ${resources.length} GCP resources`);
  return resources;
}

async function collectComputeInstances(): Promise<ResourceInfo[]> {
  const results: ResourceInfo[] = [];

  const aggListRequest = computeInstances.aggregatedListAsync({
    project: config.gcp.projectId,
  });

  for await (const [zone, instancesObj] of aggListRequest) {
    for (const instance of instancesObj.instances || []) {
      const machineType = (instance.machineType || "").split("/").pop() || "unknown";
      const status = instance.status || "UNKNOWN";
      const id = String(instance.id || "");
      const name = instance.name || "";

      results.push({
        resourceId: id,
        resourceType: "compute",
        name,
        status,
        hourlyCost: status === "RUNNING" ? getHourlyCost(machineType) : 0,
        metadata: {
          machineType,
          zone: (zone || "").split("/").pop(),
          selfLink: instance.selfLink,
          creationTimestamp: instance.creationTimestamp,
          labels: instance.labels,
          networkInterfaces: instance.networkInterfaces?.map((ni) => ni.networkIP),
        },
      });
    }
  }

  return results;
}

async function collectCloudFunctions(): Promise<ResourceInfo[]> {
  const results: ResourceInfo[] = [];
  const parent = `projects/${config.gcp.projectId}/locations/${config.gcp.region}`;

  try {
    const [functions] = await functionsClient.listFunctions({ parent });

    for (const fn of functions || []) {
      const name = (fn.name || "").split("/").pop() || "";
      const status = fn.status ? String(fn.status) : "ACTIVE";

      results.push({
        resourceId: name,
        resourceType: "cloud_function",
        name,
        status: "active",
        hourlyCost: 0, // Cloud Functions are pay-per-invocation
        metadata: {
          runtime: fn.buildConfig?.runtime,
          entryPoint: fn.buildConfig?.entryPoint,
          availableMemory: fn.serviceConfig?.availableMemory,
          maxInstanceCount: fn.serviceConfig?.maxInstanceCount,
          updateTime: fn.updateTime,
          fullName: fn.name,
        },
      });
    }
  } catch (err: any) {
    console.error("[Inventory] Error listing Cloud Functions:", err.message);
  }

  return results;
}

async function collectDisks(): Promise<ResourceInfo[]> {
  const results: ResourceInfo[] = [];

  const aggListRequest = computeDisks.aggregatedListAsync({
    project: config.gcp.projectId,
  });

  for await (const [zone, disksObj] of aggListRequest) {
    for (const disk of disksObj.disks || []) {
      const sizeGB = Number(disk.sizeGb || 0);
      const diskType = (disk.type || "").split("/").pop() || "pd-standard";
      const isAttached = (disk.users || []).length > 0;
      const name = disk.name || "";
      const id = String(disk.id || "");

      const hourlyCost = sizeGB * (DISK_HOURLY_PER_GB[diskType] || DISK_HOURLY_PER_GB["pd-standard"]);

      results.push({
        resourceId: id,
        resourceType: "disk",
        name,
        status: isAttached ? "attached" : "unattached",
        hourlyCost,
        metadata: {
          sizeGb: sizeGB,
          diskType,
          zone: (zone || "").split("/").pop(),
          status: disk.status,
          users: disk.users,
          selfLink: disk.selfLink,
          labels: disk.labels,
          creationTimestamp: disk.creationTimestamp,
        },
      });
    }
  }

  return results;
}

async function collectStorageBuckets(): Promise<ResourceInfo[]> {
  const results: ResourceInfo[] = [];

  try {
    const [buckets] = await storage.getBuckets({ project: config.gcp.projectId });

    for (const bucket of buckets || []) {
      results.push({
        resourceId: bucket.name || "",
        resourceType: "gcs",
        name: bucket.name || "",
        status: "active",
        hourlyCost: 0, // GCS cost depends on storage used + operations
        metadata: {
          location: bucket.metadata?.location,
          storageClass: bucket.metadata?.storageClass,
          timeCreated: bucket.metadata?.timeCreated,
          labels: bucket.metadata?.labels,
        },
      });
    }
  } catch (err: any) {
    console.error("[Inventory] Error listing GCS buckets:", err.message);
  }

  return results;
}
