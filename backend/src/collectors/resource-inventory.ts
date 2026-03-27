import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { DescribeVolumesCommand } from "@aws-sdk/client-ec2";
import { ListFunctionsCommand } from "@aws-sdk/client-lambda";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { ec2, lambdaClient, s3 } from "../config";
import { query } from "../db";

const HOURLY_COSTS: Record<string, number> = {
  "t2.micro": 0.0116,
  "t2.small": 0.023,
  "t2.medium": 0.0464,
  "t3.micro": 0.0104,
  "t3.small": 0.0208,
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

  const [ec2Resources, lambdaResources, ebsResources, s3Resources] =
    await Promise.allSettled([
      collectEC2Instances(),
      collectLambdaFunctions(),
      collectEBSVolumes(),
      collectS3Buckets(),
    ]);

  if (ec2Resources.status === "fulfilled") resources.push(...ec2Resources.value);
  if (lambdaResources.status === "fulfilled") resources.push(...lambdaResources.value);
  if (ebsResources.status === "fulfilled") resources.push(...ebsResources.value);
  if (s3Resources.status === "fulfilled") resources.push(...s3Resources.value);

  for (const r of resources) {
    await query(
      `INSERT INTO resources (resource_id, resource_type, name, status, hourly_cost, last_seen, metadata)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (resource_id)
       DO UPDATE SET status = $4, hourly_cost = $5, last_seen = NOW(), metadata = $6`,
      [r.resourceId, r.resourceType, r.name, r.status, r.hourlyCost, JSON.stringify(r.metadata)]
    );
  }

  console.log(`[Inventory] Found ${resources.length} resources`);
  return resources;
}

async function collectEC2Instances(): Promise<ResourceInfo[]> {
  const cmd = new DescribeInstancesCommand({});
  const response = await ec2.send(cmd);
  const results: ResourceInfo[] = [];

  for (const reservation of response.Reservations || []) {
    for (const instance of reservation.Instances || []) {
      const id = instance.InstanceId || "";
      const instanceType = instance.InstanceType || "unknown";
      const state = instance.State?.Name || "unknown";
      const nameTag = instance.Tags?.find((t) => t.Key === "Name")?.Value || "";

      results.push({
        resourceId: id,
        resourceType: "ec2",
        name: nameTag,
        status: state,
        hourlyCost: state === "running" ? (HOURLY_COSTS[instanceType] || 0.0116) : 0,
        metadata: {
          instanceType,
          launchTime: instance.LaunchTime?.toISOString(),
          availabilityZone: instance.Placement?.AvailabilityZone,
          tags: instance.Tags,
        },
      });
    }
  }

  return results;
}

async function collectLambdaFunctions(): Promise<ResourceInfo[]> {
  const cmd = new ListFunctionsCommand({});
  const response = await lambdaClient.send(cmd);
  const results: ResourceInfo[] = [];

  for (const fn of response.Functions || []) {
    results.push({
      resourceId: fn.FunctionName || "",
      resourceType: "lambda",
      name: fn.FunctionName || "",
      status: "active",
      hourlyCost: 0, // Lambda is pay-per-invocation
      metadata: {
        runtime: fn.Runtime,
        memorySize: fn.MemorySize,
        timeout: fn.Timeout,
        lastModified: fn.LastModified,
        codeSize: fn.CodeSize,
      },
    });
  }

  return results;
}

async function collectEBSVolumes(): Promise<ResourceInfo[]> {
  const cmd = new DescribeVolumesCommand({});
  const response = await ec2.send(cmd);
  const results: ResourceInfo[] = [];

  for (const vol of response.Volumes || []) {
    const sizeGB = vol.Size || 0;
    const attached = (vol.Attachments?.length || 0) > 0;
    const nameTag = vol.Tags?.find((t) => t.Key === "Name")?.Value || "";

    // gp2: $0.10/GB/month ≈ $0.000137/GB/hour
    const hourlyCost = sizeGB * 0.10 / 730;

    results.push({
      resourceId: vol.VolumeId || "",
      resourceType: "ebs",
      name: nameTag,
      status: attached ? "attached" : "unattached",
      hourlyCost,
      metadata: {
        size: sizeGB,
        volumeType: vol.VolumeType,
        state: vol.State,
        attachments: vol.Attachments?.map((a) => a.InstanceId),
        createTime: vol.CreateTime?.toISOString(),
        tags: vol.Tags,
      },
    });
  }

  return results;
}

async function collectS3Buckets(): Promise<ResourceInfo[]> {
  const cmd = new ListBucketsCommand({});
  const response = await s3.send(cmd);
  const results: ResourceInfo[] = [];

  for (const bucket of response.Buckets || []) {
    results.push({
      resourceId: bucket.Name || "",
      resourceType: "s3",
      name: bucket.Name || "",
      status: "active",
      hourlyCost: 0, // S3 cost depends on storage used, not tracked per-bucket here
      metadata: {
        creationDate: bucket.CreationDate?.toISOString(),
      },
    });
  }

  return results;
}
