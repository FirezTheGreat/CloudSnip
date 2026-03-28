/**
 * Realistic Seed System
 *
 * Seeds the database with a fleet of AWS-style priced resources,
 * each assigned a workload profile that generates consistent,
 * explainable metric data. No random spikes without logic.
 *
 * Fleet composition:
 *   • 4 compute instances (one per workload profile)
 *   • 2 cloud functions
 *   • 3 disks (one orphan)
 *   • 1 storage bucket
 */

import { connectDB } from "./db";
import { Metric } from "./models/Metric";
import { Resource } from "./models/Resource";
import { Budget } from "./models/Budget";
import { CostSummary } from "./models/CostSummary";
import { Anomaly } from "./models/Anomaly";
import { Action } from "./models/Action";
import { SimulationEvent } from "./models/SimulationEvent";
import { computeHourlyCost, INSTANCE_CATALOG, diskHourlyCost } from "./intelligence/pricing";
import { generateMetricSnapshot, type WorkloadProfile } from "./intelligence/workload-profiles";

// ─── Fleet Definition ─────────────────────────────────────────────────────────

interface SeedResource {
  resource_id: string;
  resource_type: string;
  name: string;
  status: string;
  instanceType: string;
  workloadProfile: WorkloadProfile;
  region: string;
  tags: Record<string, string>;
  metadata: Record<string, any>;
  // Computed at runtime:
  hourly_cost?: number;
}

const COMPUTE_FLEET: SeedResource[] = [
  {
    resource_id: "i-0a1b2c3d4e5f60001",
    resource_type: "compute",
    name: "web-frontend-prod",
    status: "RUNNING",
    instanceType: "t3.medium",
    workloadProfile: "stable",
    region: "us-east-1",
    tags: { env: "production", team: "frontend", service: "web" },
    metadata: { machineType: "t3.medium", zone: "us-east-1a" },
  },
  {
    resource_id: "i-0a1b2c3d4e5f60002",
    resource_type: "compute",
    name: "api-gateway-prod",
    status: "RUNNING",
    instanceType: "c5.xlarge",
    workloadProfile: "high_load",
    region: "us-east-1",
    tags: { env: "production", team: "backend", service: "api", "do-not-terminate": "true" },
    metadata: { machineType: "c5.xlarge", zone: "us-east-1b" },
  },
  {
    resource_id: "i-0a1b2c3d4e5f60003",
    resource_type: "compute",
    name: "staging-test-server",
    status: "RUNNING",
    instanceType: "m5.large",
    workloadProfile: "idle",
    region: "us-east-1",
    tags: { env: "staging", team: "qa" },
    metadata: { machineType: "m5.large", zone: "us-east-1a" },
  },
  {
    resource_id: "i-0a1b2c3d4e5f60004",
    resource_type: "compute",
    name: "batch-processor",
    status: "RUNNING",
    instanceType: "c5.large",
    workloadProfile: "spiky",
    region: "us-west-2",
    tags: { env: "production", team: "data", service: "etl" },
    metadata: { machineType: "c5.large", zone: "us-west-2a" },
  },
  {
    resource_id: "i-0a1b2c3d4e5f60005",
    resource_type: "compute",
    name: "dev-sandbox",
    status: "RUNNING",
    instanceType: "t3.small",
    workloadProfile: "idle",
    region: "us-east-1",
    tags: { env: "development", team: "engineering" },
    metadata: { machineType: "t3.small", zone: "us-east-1a" },
  },
  {
    resource_id: "i-0a1b2c3d4e5f60006",
    resource_type: "compute",
    name: "ml-training-node",
    status: "RUNNING",
    instanceType: "c5.2xlarge",
    workloadProfile: "high_load",
    region: "us-east-1",
    tags: { env: "production", team: "ml", service: "training" },
    metadata: { machineType: "c5.2xlarge", zone: "us-east-1c" },
  },
];

const FUNCTION_FLEET: SeedResource[] = [
  {
    resource_id: "fn-webhook-handler",
    resource_type: "cloud_function",
    name: "webhook-handler",
    status: "active",
    instanceType: "cloud_function",
    workloadProfile: "spiky",
    region: "us-east-1",
    tags: { env: "production", team: "integrations" },
    metadata: { runtime: "nodejs20", maxInstanceCount: 100, memoryMB: 256 },
  },
  {
    resource_id: "fn-report-generator",
    resource_type: "cloud_function",
    name: "report-generator",
    status: "active",
    instanceType: "cloud_function",
    workloadProfile: "stable",
    region: "us-east-1",
    tags: { env: "production", team: "analytics" },
    metadata: { runtime: "python312", maxInstanceCount: 10, memoryMB: 512 },
  },
];

const DISK_FLEET: SeedResource[] = [
  {
    resource_id: "vol-0a1b2c3d4e5f0001",
    resource_type: "disk",
    name: "api-gateway-boot",
    status: "attached",
    instanceType: "gp3",
    workloadProfile: "stable",
    region: "us-east-1",
    tags: { env: "production" },
    metadata: { sizeGb: 50, diskType: "gp3", zone: "us-east-1b", users: ["i-0a1b2c3d4e5f60002"] },
  },
  {
    resource_id: "vol-0a1b2c3d4e5f0002",
    resource_type: "disk",
    name: "orphan-snapshot-disk",
    status: "unattached",
    instanceType: "gp2",
    workloadProfile: "idle",
    region: "us-east-1",
    tags: {},
    metadata: { sizeGb: 100, diskType: "gp2", zone: "us-east-1a", users: [] },
  },
  {
    resource_id: "vol-0a1b2c3d4e5f0003",
    resource_type: "disk",
    name: "ml-training-data",
    status: "attached",
    instanceType: "io1",
    workloadProfile: "high_load",
    region: "us-east-1",
    tags: { env: "production", team: "ml" },
    metadata: { sizeGb: 200, diskType: "io1", zone: "us-east-1c", users: ["i-0a1b2c3d4e5f60006"] },
  },
];

const STORAGE_FLEET: SeedResource[] = [
  {
    resource_id: "s3-cloudsnip-assets",
    resource_type: "gcs",
    name: "cloudsnip-assets",
    status: "active",
    instanceType: "standard",
    workloadProfile: "stable",
    region: "us-east-1",
    tags: { team: "platform" },
    metadata: { location: "US", storageClass: "STANDARD", sizeGB: 50 },
  },
];

// ─── Seed Logic ───────────────────────────────────────────────────────────────

async function seed() {
  await connectDB();
  console.log("[Seed] ═══════════════════════════════════════════");
  console.log("[Seed] CloudSnip Realistic FinOps Seed System");
  console.log("[Seed] ═══════════════════════════════════════════\n");

  // Phase 1: Clear ALL data
  console.log("[Seed] Phase 1 — Clearing all existing data...");
  await Promise.all([
    Resource.deleteMany({}),
    Metric.deleteMany({}),
    Budget.deleteMany({}),
    CostSummary.deleteMany({}),
    Anomaly.deleteMany({}),
    Action.deleteMany({}),
    SimulationEvent.deleteMany({}),
  ]);

  // Phase 2: Insert resources with realistic pricing
  console.log("[Seed] Phase 2 — Seeding fleet with AWS-like pricing...");

  const allResources = [...COMPUTE_FLEET, ...FUNCTION_FLEET, ...DISK_FLEET, ...STORAGE_FLEET];

  for (const r of allResources) {
    let hourlyCost = 0;

    if (r.resource_type === "compute") {
      hourlyCost = computeHourlyCost(r.instanceType, r.region);
    } else if (r.resource_type === "disk") {
      hourlyCost = diskHourlyCost(r.metadata.sizeGb || 0, r.metadata.diskType || "gp3");
    } else if (r.resource_type === "cloud_function") {
      hourlyCost = 0;  // Pay-per-invocation
    } else if (r.resource_type === "gcs") {
      hourlyCost = (r.metadata.sizeGB || 0) * 0.023 / 730;
    }

    await Resource.create({
      resource_id: r.resource_id,
      resource_type: r.resource_type,
      name: r.name,
      status: r.status,
      region: r.region,
      tags: r.tags,
      hourly_cost: Number(hourlyCost.toFixed(6)),
      metadata: { ...r.metadata, labels: r.tags },
      instanceType: r.instanceType,
      workloadProfile: r.workloadProfile,
    });

    const monthlyCost = (hourlyCost * 730).toFixed(2);
    console.log(`  ✓ ${r.name.padEnd(25)} ${r.instanceType.padEnd(15)} $${monthlyCost}/mo  [${r.workloadProfile}]`);
  }

  // Phase 3: Generate 48 hours of realistic metric history
  console.log("\n[Seed] Phase 3 — Generating 48h of profile-based metrics...");

  const now = Date.now();
  const metrics: any[] = [];
  let totalFleetCostPerHour = 0;

  for (const r of allResources) {
    let hourlyCost = 0;
    if (r.resource_type === "compute") {
      hourlyCost = computeHourlyCost(r.instanceType, r.region);
    } else if (r.resource_type === "disk") {
      hourlyCost = diskHourlyCost(r.metadata.sizeGb || 0, r.metadata.diskType || "gp3");
    } else if (r.resource_type === "cloud_function") {
      hourlyCost = 0.12 / 730; // ~$0.12/mo for invocation-based billing
    } else if (r.resource_type === "gcs") {
      hourlyCost = (r.metadata.sizeGB || 0) * 0.023 / 730;
    }
    totalFleetCostPerHour += hourlyCost;
  }

  // 96 data points = every 30 min for 48 hours
  for (let i = 0; i < 96; i++) {
    const t = new Date(now - i * 30 * 60 * 1000);
    const hourOfDay = t.getHours();

    for (const r of COMPUTE_FLEET) {
      const snapshot = generateMetricSnapshot(r.workloadProfile, hourOfDay);
      const hourlyCost = computeHourlyCost(r.instanceType, r.region);

      metrics.push(
        { time: t, resource_id: r.resource_id, resource_type: "compute", metric_name: "cpuutilization", value: snapshot.cpuUtilization, unit: "Percent" },
        { time: t, resource_id: r.resource_id, resource_type: "compute", metric_name: "memoryutilization", value: snapshot.memoryUtilization, unit: "Percent" },
        { time: t, resource_id: r.resource_id, resource_type: "compute", metric_name: "networkin", value: snapshot.networkIn, unit: "Bytes" },
        { time: t, resource_id: r.resource_id, resource_type: "compute", metric_name: "networkout", value: snapshot.networkOut, unit: "Bytes" },
        { time: t, resource_id: r.resource_id, resource_type: "compute", metric_name: "estimated_cost", value: hourlyCost, unit: "USD/hr" }
      );
    }

    for (const r of FUNCTION_FLEET) {
      const snapshot = generateMetricSnapshot(r.workloadProfile, hourOfDay);
      const invocations = r.workloadProfile === "spiky"
        ? Math.max(0, Math.round(5 + (snapshot.cpuUtilization / 100) * 200))
        : Math.max(1, Math.round(snapshot.cpuUtilization / 10));

      const fnHourlyCost = invocations * 0.0000002 * 200; // ~$0.00004 per invocation at 200ms avg
      metrics.push(
        { time: t, resource_id: r.resource_id, resource_type: "cloud_function", metric_name: "invocations", value: invocations, unit: "Count" },
        { time: t, resource_id: r.resource_id, resource_type: "cloud_function", metric_name: "duration", value: 80 + snapshot.cpuUtilization * 2, unit: "ms" },
        { time: t, resource_id: r.resource_id, resource_type: "cloud_function", metric_name: "estimated_cost", value: fnHourlyCost, unit: "USD/hr" }
      );
    }

    for (const r of DISK_FLEET) {
      const hourlyCost = diskHourlyCost(r.metadata.sizeGb || 0, r.metadata.diskType || "gp3");
      metrics.push(
        { time: t, resource_id: r.resource_id, resource_type: "disk", metric_name: "estimated_cost", value: hourlyCost, unit: "USD/hr" }
      );
    }

    for (const r of STORAGE_FLEET) {
      const gcsHourlyCost = (r.metadata.sizeGB || 0) * 0.023 / 730;
      metrics.push(
        { time: t, resource_id: r.resource_id, resource_type: "gcs", metric_name: "estimated_cost", value: gcsHourlyCost, unit: "USD/hr" }
      );
    }

    // Fleet aggregate
    metrics.push({
      time: t,
      resource_id: "_fleet",
      resource_type: "fleet",
      metric_name: "estimated_cost",
      value: totalFleetCostPerHour,
      unit: "USD/hr",
    });
  }

  await Metric.insertMany(metrics, { ordered: false });
  console.log(`  ✓ ${metrics.length} metric datapoints generated`);

  // Phase 4: Seed sample anomalies (realistic, based on workload profiles)
  console.log("\n[Seed] Phase 4 — Seeding anomalies from workload analysis...");

  const at = (daysAgo: number, h = 14, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d;
  };

  await Anomaly.insertMany([
    {
      detected_at: at(3, 9),
      resource_id: "i-0a1b2c3d4e5f60003",
      resource_type: "compute",
      anomaly_type: "idle_instance",
      severity: "high",
      anomaly_score: 0.89,
      description: "staging-test-server (m5.large) idle for 72+ hours. CPU avg 2.8%, costing $70.08/mo for zero production value.",
      resolved: false,
    },
    {
      detected_at: at(2, 14),
      resource_id: "i-0a1b2c3d4e5f60005",
      resource_type: "compute",
      anomaly_type: "idle_instance",
      severity: "medium",
      anomaly_score: 0.72,
      description: "dev-sandbox (t3.small) idle — avg CPU 1.9%. Low cost ($15.18/mo) but still wasteful.",
      resolved: false,
    },
    {
      detected_at: at(1, 3),
      resource_id: "vol-0a1b2c3d4e5f0002",
      resource_type: "disk",
      anomaly_type: "unused_volume",
      severity: "high",
      anomaly_score: 0.91,
      description: "orphan-snapshot-disk (100GB gp2) unattached — $10.00/mo waste with zero consumers.",
      resolved: false,
    },
    {
      detected_at: at(0, 8),
      resource_id: "i-0a1b2c3d4e5f60004",
      resource_type: "compute",
      anomaly_type: "usage_anomaly",
      severity: "low",
      anomaly_score: 0.58,
      description: "batch-processor showing spiky pattern (PAR=4.2). Normal for batch workloads — monitoring.",
      resolved: true,
      resolved_at: at(0, 12),
      resolved_by: "auto_dismissed",
    },
  ]);
  console.log("  ✓ 4 realistic anomalies seeded");

  // Phase 5: Budgets
  console.log("\n[Seed] Phase 5 — Setting up budgets...");
  await Budget.create([
    {
      name: "Total Monthly",
      resource_type: "all",
      monthly_limit: 800,
      alert_thresholds: [50, 80, 100],
      current_spend: 0,
    },
    {
      name: "Compute Budget",
      resource_type: "compute",
      monthly_limit: 600,
      alert_thresholds: [50, 80, 100],
      current_spend: 0,
    },
    {
      name: "Storage Budget",
      resource_type: "disk",
      monthly_limit: 100,
      alert_thresholds: [50, 80, 100],
      current_spend: 0,
    },
  ]);
  console.log("  ✓ 3 budgets created");

  // Phase 6: Cost summaries
  console.log("\n[Seed] Phase 6 — Generating daily cost summaries...");

  const costSummaries: any[] = [];
  for (let d = 7; d >= 0; d--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - d);
    dayStart.setHours(0, 0, 0, 0);

    // Compute total daily cost per service
    let computeDaily = 0;
    for (const r of COMPUTE_FLEET) {
      computeDaily += computeHourlyCost(r.instanceType, r.region) * 24;
    }
    let diskDaily = 0;
    for (const r of DISK_FLEET) {
      diskDaily += diskHourlyCost(r.metadata.sizeGb || 0, r.metadata.diskType || "gp3") * 24;
    }

    costSummaries.push(
      { time: dayStart, service: "Compute Engine", total_cost: Number(computeDaily.toFixed(4)), resource_count: COMPUTE_FLEET.length },
      { time: dayStart, service: "Persistent Disk", total_cost: Number(diskDaily.toFixed(4)), resource_count: DISK_FLEET.length },
      { time: dayStart, service: "Cloud Functions", total_cost: 0.12, resource_count: FUNCTION_FLEET.length },
      { time: dayStart, service: "Cloud Storage", total_cost: Number((50 * 0.023 / 30).toFixed(4)), resource_count: 1 }
    );
  }
  await CostSummary.insertMany(costSummaries);
  console.log(`  ✓ ${costSummaries.length} daily cost summaries created`);

  // Summary
  console.log("\n[Seed] ═══════════════════════════════════════════");
  console.log(`[Seed] Fleet: ${allResources.length} resources`);
  console.log(`[Seed] Metrics: ${metrics.length} datapoints (48h history)`);
  console.log(`[Seed] Fleet hourly burn: $${totalFleetCostPerHour.toFixed(4)}/hr`);
  console.log(`[Seed] Fleet monthly burn: $${(totalFleetCostPerHour * 730).toFixed(2)}/mo`);
  console.log("[Seed] ═══════════════════════════════════════════");
  process.exit(0);
}

seed();
