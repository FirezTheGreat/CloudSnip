/**
 * Anomaly Simulator
 *
 * Creates synthetic anomalies against real GCP resources so the pipeline
 * (telemetry → ML → optimizer → savings) runs in a continuous cycle.
 *
 * Every simulation event:
 *  1. Injects synthetic Metric rows so the ML model sees an anomaly pattern
 *  2. (Optionally) calls the real GCP API to replicate the condition in the
 *     cloud (e.g. actually start an idle VM, fire function requests)
 *  3. Logs the event to the `SimulationEvent` collection
 *  4. After the optimizer resolves the anomaly it restarts the cycle
 *
 * The simulator runs on its own cron, independent of the telemetry pipeline.
 */

import { computeInstances, config } from "../config";
import { Metric } from "../models/Metric";
import { Resource } from "../models/Resource";
import { Anomaly } from "../models/Anomaly";
import { SimulationEvent } from "../models/SimulationEvent";
import { broadcast } from "../socket-io";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScenarioType =
  | "idle_instance"
  | "runaway_function"
  | "orphan_disk"
  | "traffic_spike"
  | "cost_spike";

export interface TriggerResult {
  scenario: ScenarioType;
  resourceId: string;
  resourceName: string;
  injectedPoints: number;
  gcpActionTaken: boolean;
  description: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

/** Prevent two scenarios from running simultaneously on the same resource */
const _activeScenarios = new Set<string>();

/** Track the last scenario type so we don't repeat immediately */
let _lastScenario: ScenarioType | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Inject N synthetic Metric documents for a resource so the ML model
 * sees either a normal baseline (16 pts) + an anomaly spike (8 pts).
 *
 * This is the core trick:  Cloud Monitoring may have only ~1-2 data
 * points for a free-tier VM. The simulator adds realistic fake points
 * so Isolation Forest has enough data AND sees a clear outlier.
 */
async function injectMetrics(
  resourceId: string,
  resourceType: string,
  normalProfile: Record<string, number>,
  anomalyProfile: Record<string, number>,
  normalCount = 16,
  anomalyCount = 8
): Promise<number> {
  const now = Date.now();
  const docs: Array<{
    time: Date;
    resource_id: string;
    resource_type: string;
    metric_name: string;
    value: number;
    unit: string;
  }> = [];

  // Normal baseline — spread over the past 2 hours
  for (let i = normalCount; i > 0; i--) {
    const t = new Date(now - i * (2 * 3600 * 1000) / normalCount);
    for (const [metric_name, baseValue] of Object.entries(normalProfile)) {
      // ±10% jitter
      const jitter = baseValue * (0.05 + Math.random() * 0.05);
      docs.push({
        time: t,
        resource_id: resourceId,
        resource_type: resourceType,
        metric_name,
        value: baseValue + (Math.random() > 0.5 ? jitter : -jitter),
        unit: metricUnit(metric_name),
      });
    }
  }

  // Anomaly spikes — placed in the last 30 minutes
  for (let i = anomalyCount; i > 0; i--) {
    const t = new Date(now - i * (30 * 60 * 1000) / anomalyCount);
    for (const [metric_name, anomalyValue] of Object.entries(anomalyProfile)) {
      docs.push({
        time: t,
        resource_id: resourceId,
        resource_type: resourceType,
        metric_name,
        value: anomalyValue,
        unit: metricUnit(metric_name),
      });
    }
  }

  await Metric.insertMany(docs, { ordered: false });
  return docs.length;
}

function metricUnit(name: string): string {
  if (name.includes("cpu")) return "Percent";
  if (name.includes("network") || name.includes("memory")) return "Bytes";
  if (name.includes("invocations")) return "Count";
  return "Unknown";
}

/** Find a running compute VM from the resource DB */
async function findRunningVM(): Promise<{ resourceId: string; name: string } | null> {
  const vm = await Resource.findOne({
    resource_type: "compute",
    status: "RUNNING",
  }).lean();
  if (vm) return { resourceId: vm.resource_id, name: vm.name || vm.resource_id };
  return null;
}

/** Find a cloud function from the resource DB */
async function findFunction(): Promise<{ resourceId: string; name: string } | null> {
  const fn = await Resource.findOne({ resource_type: "cloud_function" }).lean();
  if (fn) return { resourceId: fn.resource_id, name: fn.name || fn.resource_id };
  return null;
}

/** Find an unattached disk from the resource DB */
async function findOrphanDisk(): Promise<{ resourceId: string; name: string } | null> {
  const disk = await Resource.findOne({
    resource_type: "disk",
    status: "unattached",
  }).lean();
  if (disk) return { resourceId: disk.resource_id, name: disk.name || disk.resource_id };
  return null;
}

// ─── Scenario Implementations ─────────────────────────────────────────────────

/**
 * SCENARIO 1: Idle Instance
 *
 * Injects near-zero CPU metrics for a running VM so the ML model
 * detects it as idle. Optionally starts the VM via GCP API so it
 * is genuinely running when the optimizer stops it.
 */
async function simulateIdleInstance(): Promise<TriggerResult | null> {
  const vm = await findRunningVM();

  // If no running VM exists, synthesise a fake resource record so the
  // rest of the pipeline can still exercise the full code path.
  let resourceId: string;
  let resourceName: string;
  let gcpActionTaken = false;

  if (vm) {
    resourceId = vm.resourceId;
    resourceName = vm.name;
  } else {
    // Check if there is a stopped VM we can restart
    const stoppedVm = await Resource.findOne({
      resource_type: "compute",
      status: { $in: ["STOPPED", "TERMINATED", "STOPPING"] },
    }).lean();

    if (stoppedVm) {
      resourceId = stoppedVm.resource_id;
      resourceName = stoppedVm.name || stoppedVm.resource_id;

      // Try to start it via GCP API
      if (config.gcp.projectId && !config.dryRun) {
        try {
          const zone = stoppedVm.metadata?.zone || config.gcp.zone.split("/").pop() || "us-central1-a";
          await computeInstances.start({
            project: config.gcp.projectId,
            zone,
            instance: resourceName,
          });
          await Resource.updateOne(
            { resource_id: resourceId },
            { status: "RUNNING", hourly_cost: 0.0076 }
          );
          gcpActionTaken = true;
          console.log(`[Simulator] Restarted stopped VM: ${resourceName}`);
          // Wait 60s for GCP to fully start before injecting metrics
          await new Promise((r) => setTimeout(r, 60_000));
        } catch (err: any) {
          console.warn(`[Simulator] Could not restart VM via GCP API: ${err.message}`);
        }
      }
    } else {
      // No VM at all — create a synthetic resource record
      resourceId = `synthetic-vm-${Date.now()}`;
      resourceName = "cloudsnip-demo-vm (synthetic)";
      await Resource.updateOne(
        { resource_id: resourceId },
        {
          $set: {
            resource_type: "compute",
            name: resourceName,
            status: "RUNNING",
            hourly_cost: 0.0076,
            region: config.gcp.region,
            last_seen: new Date(),
            metadata: { machineType: "e2-micro", zone: config.gcp.zone, synthetic: true },
          },
          $setOnInsert: { resource_id: resourceId, first_seen: new Date() },
        },
        { upsert: true }
      );
    }
  }

  if (_activeScenarios.has(resourceId)) return null;
  _activeScenarios.add(resourceId);

  try {
    const injected = await injectMetrics(
      resourceId,
      "compute",
      // Normal profile: healthy CPU ~30-40%, some network traffic
      { cpuutilization: 35, networkin: 500_000, networkout: 200_000 },
      // Anomaly profile: CPU near-zero, no traffic
      { cpuutilization: 1.2, networkin: 1024, networkout: 512 }
    );

    return {
      scenario: "idle_instance",
      resourceId,
      resourceName,
      injectedPoints: injected,
      gcpActionTaken,
      description: `Simulated idle VM: injected ${injected} metrics with CPU ~1.2% for ${resourceName}`,
    };
  } finally {
    // Release lock after 60s so the optimizer has time to process first
    setTimeout(() => _activeScenarios.delete(resourceId), 60_000);
  }
}

/**
 * SCENARIO 2: Runaway Function
 *
 * Injects a massive invocation-count spike for a cloud function.
 * If a real function URL is available, also fires real HTTP requests.
 */
async function simulateRunawayFunction(): Promise<TriggerResult | null> {
  const fn = await findFunction();

  let resourceId: string;
  let resourceName: string;
  let gcpActionTaken = false;

  if (fn) {
    resourceId = fn.resourceId;
    resourceName = fn.name;
  } else {
    // Synthetic resource
    resourceId = `synthetic-fn-${Date.now()}`;
    resourceName = "cloudsnip-demo-function (synthetic)";
    await Resource.updateOne(
      { resource_id: resourceId },
      {
        $set: {
          resource_type: "cloud_function",
          name: resourceName,
          status: "active",
          hourly_cost: 0,
          region: config.gcp.region,
          last_seen: new Date(),
          metadata: { synthetic: true },
        },
        $setOnInsert: { resource_id: resourceId, first_seen: new Date() },
      },
      { upsert: true }
    );
  }

  if (_activeScenarios.has(resourceId)) return null;
  _activeScenarios.add(resourceId);

  try {
    // Fire real HTTP requests if we have a function URL configured
    const functionUrl = process.env.CLOUD_FUNCTION_URL;
    if (functionUrl && !config.dryRun) {
      console.log(`[Simulator] Sending 80 parallel requests to ${functionUrl}`);
      const requests = Array.from({ length: 80 }, () =>
        fetch(functionUrl, { method: "GET", signal: AbortSignal.timeout(5000) }).catch(
          () => null
        )
      );
      await Promise.allSettled(requests);
      gcpActionTaken = true;
      console.log(`[Simulator] Fired 80 HTTP requests at Cloud Function`);
    }

    const injected = await injectMetrics(
      resourceId,
      "cloud_function",
      // Normal: ~5 invocations per 5-min window
      { invocations: 5, cpuutilization: 2 },
      // Anomaly: 150 invocations — 30× spike
      { invocations: 150, cpuutilization: 85 }
    );

    return {
      scenario: "runaway_function",
      resourceId,
      resourceName,
      injectedPoints: injected,
      gcpActionTaken,
      description: `Simulated function spike: ${injected} metrics with 150 invocations for ${resourceName}`,
    };
  } finally {
    setTimeout(() => _activeScenarios.delete(resourceId), 60_000);
  }
}

/**
 * SCENARIO 3: Orphan Disk
 *
 * Injects metrics for an unattached disk to trigger the disk-cleanup
 * optimizer action. Marks it as "unattached" so the resource scanner
 * picks it up.
 */
async function simulateOrphanDisk(): Promise<TriggerResult | null> {
  let disk = await findOrphanDisk();

  let resourceId: string;
  let resourceName: string;

  if (disk) {
    resourceId = disk.resourceId;
    resourceName = disk.name;
  } else {
    // Create varied disk characteristics
    const diskSizes = [20, 50, 100, 150, 200];
    const diskTypes = ["gp2", "gp3", "io1", "st1"] as const;
    const selectedSize = diskSizes[Math.floor(Math.random() * diskSizes.length)];
    const selectedType = diskTypes[Math.floor(Math.random() * diskTypes.length)];
    const diskCostPerGb: Record<string, number> = { gp2: 0.10, gp3: 0.08, io1: 0.125, st1: 0.045 };
    const hourlyCost = selectedSize * (diskCostPerGb[selectedType] || 0.08) / 730;

    resourceId = `synthetic-disk-${Date.now()}`;
    resourceName = `orphan-${selectedType}-${selectedSize}gb`;
    await Resource.updateOne(
      { resource_id: resourceId },
      {
        $set: {
          resource_type: "disk",
          name: resourceName,
          status: "unattached",
          hourly_cost: hourlyCost,
          region: "us-east-1",
          last_seen: new Date(),
          metadata: {
            sizeGb: selectedSize,
            diskType: selectedType,
            zone: "us-east-1a",
            users: [],
            synthetic: true,
          },
        },
        $setOnInsert: { resource_id: resourceId, first_seen: new Date() },
      },
      { upsert: true }
    );
  }

  if (_activeScenarios.has(resourceId)) return null;
  _activeScenarios.add(resourceId);

  try {
    const injected = await injectMetrics(
      resourceId,
      "disk",
      // Normal: baseline cost metrics
      { cpuutilization: 0, networkin: 0, networkout: 0 },
      // Anomaly: cost spike (orphan disks are pure cost anomalies)
      { cpuutilization: 0, networkin: 0, networkout: 0 },
      8,
      8
    );

    // Also directly create the anomaly since orphan disks aren't CPU-based
    // and the ML model needs help from rule-based detection
    const openDup = await Anomaly.findOne({
      resource_id: resourceId,
      anomaly_type: "unused_volume",
      resolved: false,
    }).lean();

    // Dynamic anomaly score based on disk cost (bigger = higher confidence waste)
    const diskResource = await Resource.findOne({ resource_id: resourceId }).lean();
    const monthlyCost = (diskResource?.hourly_cost || 0) * 730;
    const anomalyScore = Math.min(0.98, 0.60 + (monthlyCost / 50) * 0.3 + Math.random() * 0.08);
    const sizeGb = diskResource?.metadata?.sizeGb || 10;
    const diskType = diskResource?.metadata?.diskType || "gp2";

    if (!openDup) {
      await Anomaly.create({
        resource_id: resourceId,
        resource_type: "disk",
        anomaly_type: "unused_volume",
        severity: monthlyCost > 10 ? "high" : monthlyCost > 3 ? "medium" : "low",
        anomaly_score: Number(anomalyScore.toFixed(2)),
        description: `Unattached ${diskType} disk ${resourceName} (${sizeGb} GB) has no users — costing $${monthlyCost.toFixed(2)}/month for zero utility`,
        metric_snapshot: { sizeGb, diskType, users: [] },
      });
    }

    return {
      scenario: "orphan_disk",
      resourceId,
      resourceName,
      injectedPoints: injected,
      gcpActionTaken: false,
      description: `Simulated orphan disk: injected metrics + anomaly record for ${resourceName}`,
    };
  } finally {
    setTimeout(() => _activeScenarios.delete(resourceId), 60_000);
  }
}

/**
 * SCENARIO 4: Traffic Spike (network anomaly)
 *
 * Injects a sudden surge in network_in/network_out bytes so the ML model
 * flags this as a traffic spike on a compute instance.
 */
async function simulateTrafficSpike(): Promise<TriggerResult | null> {
  const vm = await findRunningVM();

  let resourceId: string;
  let resourceName: string;

  if (vm) {
    resourceId = vm.resourceId;
    resourceName = vm.name;
  } else {
    resourceId = `synthetic-vm-traffic-${Date.now()}`;
    resourceName = "cloudsnip-demo-vm (traffic synthetic)";
    await Resource.updateOne(
      { resource_id: resourceId },
      {
        $set: {
          resource_type: "compute",
          name: resourceName,
          status: "RUNNING",
          hourly_cost: 0.0076,
          region: config.gcp.region,
          last_seen: new Date(),
          metadata: { machineType: "e2-micro", zone: config.gcp.zone, synthetic: true },
        },
        $setOnInsert: { resource_id: resourceId, first_seen: new Date() },
      },
      { upsert: true }
    );
  }

  if (_activeScenarios.has(resourceId)) return null;
  _activeScenarios.add(resourceId);

  try {
    const injected = await injectMetrics(
      resourceId,
      "compute",
      // Normal: moderate CPU, baseline ~50 KB/s each direction
      { cpuutilization: 25, networkin: 50_000, networkout: 20_000 },
      // 25× traffic spike while CPU is still moderate (genuine DDoS-like pattern)
      { cpuutilization: 30, networkin: 15_000_000, networkout: 8_000_000 }
    );

    return {
      scenario: "traffic_spike",
      resourceId,
      resourceName,
      injectedPoints: injected,
      gcpActionTaken: false,
      description: `Simulated traffic spike: 15 MB/s inbound, 8 MB/s outbound on ${resourceName}`,
    };
  } finally {
    setTimeout(() => _activeScenarios.delete(resourceId), 60_000);
  }
}

/**
 * SCENARIO 5: Cost Spike
 *
 * Temporarily bumps the hourly_cost of a resource 4× so the ML model flags
 * it as an estimated_hourly_cost anomaly.
 */
async function simulateCostSpike(): Promise<TriggerResult | null> {
  const resource = await Resource.findOne({
    resource_type: { $in: ["compute", "disk"] },
    status: { $in: ["RUNNING", "active", "unattached"] },
    hourly_cost: { $gt: 0 },
  }).lean();

  if (!resource) return null;

  const resourceId = resource.resource_id;
  const resourceName = resource.name || resourceId;

  if (_activeScenarios.has(resourceId)) return null;
  _activeScenarios.add(resourceId);

  try {
    const normalCost = resource.hourly_cost;
    const spikeCost = normalCost * 4.5;

    // Temporarily mark the resource as having a higher cost rating
    await Resource.updateOne({ resource_id: resourceId }, { hourly_cost: spikeCost });

    const injected = await injectMetrics(
      resourceId,
      resource.resource_type,
      { cpuutilization: 25, networkin: 100_000, networkout: 50_000, estimated_hourly_cost: normalCost },
      { cpuutilization: 25, networkin: 100_000, networkout: 50_000, estimated_hourly_cost: spikeCost }
    );

    // Restore cost after 5 minutes so we don't permanently inflate it
    setTimeout(async () => {
      await Resource.updateOne({ resource_id: resourceId }, { hourly_cost: normalCost });
    }, 5 * 60_000);

    return {
      scenario: "cost_spike",
      resourceId,
      resourceName,
      injectedPoints: injected,
      gcpActionTaken: false,
      description: `Simulated cost spike: $${normalCost.toFixed(4)}/hr → $${spikeCost.toFixed(4)}/hr on ${resourceName}`,
    };
  } finally {
    setTimeout(() => _activeScenarios.delete(resourceId), 60_000);
  }
}

// ─── Scenario Picker ──────────────────────────────────────────────────────────

const ALL_SCENARIOS: ScenarioType[] = [
  "idle_instance",
  "runaway_function",
  "orphan_disk",
  "traffic_spike",
  "cost_spike",
];

function pickScenario(): ScenarioType {
  // Weighted: idle_instance and runaway_function are most impactful for demo
  const weighted: ScenarioType[] = [
    "idle_instance",
    "idle_instance",
    "runaway_function",
    "runaway_function",
    "orphan_disk",
    "traffic_spike",
    "cost_spike",
  ];

  // Don't repeat the same scenario twice in a row
  const choices = _lastScenario
    ? weighted.filter((s) => s !== _lastScenario)
    : weighted;

  return choices[Math.floor(Math.random() * choices.length)];
}

async function runScenario(scenario: ScenarioType): Promise<TriggerResult | null> {
  switch (scenario) {
    case "idle_instance":    return simulateIdleInstance();
    case "runaway_function": return simulateRunawayFunction();
    case "orphan_disk":      return simulateOrphanDisk();
    case "traffic_spike":    return simulateTrafficSpike();
    case "cost_spike":       return simulateCostSpike();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Trigger a specific scenario by name (called from the API route).
 */
export async function triggerScenario(scenario: ScenarioType): Promise<TriggerResult | null> {
  console.log(`[Simulator] Manual trigger: ${scenario}`);
  const result = await runScenario(scenario);

  if (result) {
    _lastScenario = scenario;

    await SimulationEvent.create({
      scenario: result.scenario,
      resource_id: result.resourceId,
      resource_name: result.resourceName,
      injected_points: result.injectedPoints,
      gcp_action_taken: result.gcpActionTaken,
      description: result.description,
      triggered_by: "manual",
    });

    broadcast({ type: "simulation_triggered", data: result });
    console.log(`[Simulator] ✓ ${result.description}`);
  }

  return result;
}

/**
 * Run one automatic simulation cycle (called from the cron scheduler).
 * Returns early if GCP project is not configured (seed-data mode).
 */
export async function runAutoSimulation(): Promise<void> {
  const scenario = pickScenario();
  console.log(`[Simulator] Auto-simulation: ${scenario}`);

  const result = await runScenario(scenario);

  if (!result) {
    console.log(`[Simulator] ${scenario} skipped — no eligible resource or lock held`);
    return;
  }

  _lastScenario = scenario;

  await SimulationEvent.create({
    scenario: result.scenario,
    resource_id: result.resourceId,
    resource_name: result.resourceName,
    injected_points: result.injectedPoints,
    gcp_action_taken: result.gcpActionTaken,
    description: result.description,
    triggered_by: "auto",
  });

  broadcast({ type: "simulation_triggered", data: result });
  console.log(`[Simulator] ✓ ${result.description}`);
}

export { ALL_SCENARIOS };
