import { Metric } from "../models/Metric";
import { Resource } from "../models/Resource";
import { CostSummary } from "../models/CostSummary";
import { SIMULATED_RESOURCES } from "./resources";
import type { ResourceInfo } from "../collectors/resource-inventory";

let tickCount = 0;
let anomalyScenario: "normal" | "idle_vm" | "function_spike" | "idle_then_spike" = "normal";

export function setAnomalyScenario(scenario: typeof anomalyScenario) {
  anomalyScenario = scenario;
  tickCount = 0;
  console.log(`[Simulation] Anomaly scenario set to: ${scenario}`);
}

export function getAnomalyScenario() {
  return anomalyScenario;
}

export async function simulateResourceInventory(): Promise<ResourceInfo[]> {
  for (const r of SIMULATED_RESOURCES) {
    await Resource.updateOne(
      { resource_id: r.resourceId },
      {
        $set: {
          resource_type: r.resourceType,
          name: r.name,
          status: r.status,
          hourly_cost: r.hourlyCost,
          last_seen: new Date(),
          metadata: r.metadata,
        },
        $setOnInsert: { resource_id: r.resourceId, first_seen: new Date() },
      },
      { upsert: true }
    );
  }

  console.log(`[Simulation] Loaded ${SIMULATED_RESOURCES.length} simulated resources`);
  return [...SIMULATED_RESOURCES];
}

export async function simulateMetrics(): Promise<void> {
  tickCount++;
  const now = new Date();

  const metrics: Array<{
    time: Date;
    resource_id: string;
    resource_type: string;
    metric_name: string;
    value: number;
    unit: string;
  }> = [];

  // --- Compute VMs ---
  for (const r of SIMULATED_RESOURCES.filter((r) => r.resourceType === "compute")) {
    let cpu: number;
    let netIn: number;
    let netOut: number;

    const isIdleTarget = r.name === "dev-sandbox";

    if (isIdleTarget && (anomalyScenario === "idle_vm" || anomalyScenario === "idle_then_spike")) {
      // Gradually go idle: CPU declines from ~40% to <5% over ticks
      cpu = Math.max(1 + Math.random() * 2, 40 - tickCount * 6 + Math.random() * 3);
      netIn = Math.max(100, 50000 - tickCount * 8000 + Math.random() * 1000);
      netOut = Math.max(50, 20000 - tickCount * 3000 + Math.random() * 500);
    } else if (r.name === "prod-api-server") {
      cpu = 35 + Math.sin(tickCount * 0.5) * 15 + Math.random() * 8;
      netIn = 500000 + Math.random() * 200000;
      netOut = 300000 + Math.random() * 100000;
    } else {
      cpu = 15 + Math.random() * 20;
      netIn = 100000 + Math.random() * 100000;
      netOut = 50000 + Math.random() * 50000;
    }

    metrics.push(
      { time: now, resource_id: r.resourceId, resource_type: "compute", metric_name: "cpuutilization", value: Math.max(0.5, cpu), unit: "Percent" },
      { time: now, resource_id: r.resourceId, resource_type: "compute", metric_name: "networkin", value: netIn, unit: "Bytes" },
      { time: now, resource_id: r.resourceId, resource_type: "compute", metric_name: "networkout", value: netOut, unit: "Bytes" },
    );
  }

  // --- Cloud Functions ---
  for (const r of SIMULATED_RESOURCES.filter((r) => r.resourceType === "cloud_function")) {
    let invocations: number;
    let duration: number;

    const isSpikeTarget = r.name === "process-uploads";

    if (isSpikeTarget && (anomalyScenario === "function_spike" || (anomalyScenario === "idle_then_spike" && tickCount > 5))) {
      invocations = 150 + tickCount * 30 + Math.random() * 50;
      duration = 200 + Math.random() * 300;
    } else {
      invocations = 5 + Math.random() * 10;
      duration = 50 + Math.random() * 80;
    }

    metrics.push(
      { time: now, resource_id: r.resourceId, resource_type: "cloud_function", metric_name: "invocations", value: invocations, unit: "Count" },
      { time: now, resource_id: r.resourceId, resource_type: "cloud_function", metric_name: "duration", value: duration, unit: "Milliseconds" },
    );
  }

  await Metric.insertMany(metrics);
  console.log(`[Simulation] Generated ${metrics.length} metric data points (tick ${tickCount}, scenario: ${anomalyScenario})`);
}

export async function simulateCostData(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const services = [
    { service: "Compute Engine", cost: 1.85 + Math.random() * 0.5 },
    { service: "Cloud Functions", cost: 0.12 + Math.random() * 0.08 },
    { service: "Persistent Disk", cost: 0.45 + Math.random() * 0.1 },
    { service: "Cloud Storage", cost: 0.03 + Math.random() * 0.02 },
  ];

  for (let day = 6; day >= 0; day--) {
    const date = new Date(today);
    date.setDate(date.getDate() - day);

    for (const s of services) {
      const variance = day === 0 ? 1 : 0.8 + Math.random() * 0.4;
      await CostSummary.updateOne(
        { time: date, service: s.service },
        { $set: { total_cost: s.cost * variance, resource_count: Math.floor(2 + Math.random() * 3) } },
        { upsert: true }
      );
    }
  }

  console.log("[Simulation] Generated 7-day cost history");
}

export async function backfillMetricHistory(): Promise<void> {
  const existingCount = await Metric.countDocuments();
  if (existingCount > 20) return;

  console.log("[Simulation] Backfilling 2 hours of metric history...");

  const now = Date.now();
  const metrics: any[] = [];

  for (let minutesAgo = 120; minutesAgo >= 5; minutesAgo -= 5) {
    const time = new Date(now - minutesAgo * 60 * 1000);

    for (const r of SIMULATED_RESOURCES.filter((r) => r.resourceType === "compute")) {
      const baseCpu = r.name === "prod-api-server" ? 35 : r.name === "dev-sandbox" ? 25 : 18;
      metrics.push(
        { time, resource_id: r.resourceId, resource_type: "compute", metric_name: "cpuutilization", value: baseCpu + Math.random() * 15, unit: "Percent" },
        { time, resource_id: r.resourceId, resource_type: "compute", metric_name: "networkin", value: 200000 + Math.random() * 300000, unit: "Bytes" },
        { time, resource_id: r.resourceId, resource_type: "compute", metric_name: "networkout", value: 100000 + Math.random() * 150000, unit: "Bytes" },
      );
    }

    for (const r of SIMULATED_RESOURCES.filter((r) => r.resourceType === "cloud_function")) {
      metrics.push(
        { time, resource_id: r.resourceId, resource_type: "cloud_function", metric_name: "invocations", value: 5 + Math.random() * 10, unit: "Count" },
        { time, resource_id: r.resourceId, resource_type: "cloud_function", metric_name: "duration", value: 50 + Math.random() * 80, unit: "Milliseconds" },
      );
    }
  }

  await Metric.insertMany(metrics);
  console.log(`[Simulation] Backfilled ${metrics.length} historical data points`);
}
