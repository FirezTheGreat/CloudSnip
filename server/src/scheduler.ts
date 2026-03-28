import cron from "node-cron";
import { config } from "./config";
import { collectComputeMetrics, collectFunctionMetrics } from "./collectors/cloud-monitoring";
import { collectCostData } from "./collectors/cloud-billing";
import { collectResourceInventory } from "./collectors/resource-inventory";
import { detectAnomalies } from "./anomaly/client";
import { processAnomalies } from "./optimizer/engine";
import { checkBudgets } from "./budget-checker";
import { broadcast } from "./socket-io";
import { runAutoSimulation } from "./simulation/anomaly-simulator";

let isRunning = false;

// ─── Shared pipeline state (read by /api/dashboard/pipeline-status) ──────────
export const pipelineState = {
  lastRunAt: null as Date | null,
  lastRunDurationMs: null as number | null,
  cyclesCompleted: 0,
  nextRunAt: null as Date | null,
  isRunning: false,
};


async function runPipeline() {
  if (isRunning) {
    console.log("[Scheduler] Pipeline already running — skipping");
    return;
  }

  isRunning = true;
  pipelineState.isRunning = true;
  const startTime = Date.now();
  console.log("[Scheduler] ─── Pipeline started ───");

  try {
    console.log("[Scheduler] Step 1/6: Collecting resource inventory...");
    const resources = await collectResourceInventory();

    const computeInstances = resources
      .filter((r) => r.resourceType === "compute" && r.status === "RUNNING")
      .map((r) => r.resourceId);

    const cloudFunctions = resources
      .filter((r) => r.resourceType === "cloud_function")
      .map((r) => r.resourceId);

    console.log("[Scheduler] Step 2/6: Collecting Cloud Monitoring metrics...");
    await collectComputeMetrics(computeInstances);
    await collectFunctionMetrics(cloudFunctions);

    console.log("[Scheduler] Step 3/6: Collecting cost data...");
    await collectCostData();

    console.log("[Scheduler] Step 4/6: Running anomaly detection...");
    const anomalies = await detectAnomalies();

    if (anomalies.length > 0) {
      broadcast({
        type: "anomalies_detected",
        data: { count: anomalies.length, anomalies },
      });
    }

    console.log("[Scheduler] Step 5/6: Processing anomalies...");
    await processAnomalies();

    console.log("[Scheduler] Step 6/6: Checking budgets...");
    await checkBudgets();

    const duration = Date.now() - startTime;
    const durationSec = (duration / 1000).toFixed(1);
    pipelineState.lastRunAt = new Date();
    pipelineState.lastRunDurationMs = duration;
    pipelineState.cyclesCompleted += 1;
    console.log(`[Scheduler] ─── Pipeline complete (${durationSec}s) ───`);
    console.log(`[Scheduler]   Resources: ${resources.length}, Anomalies: ${anomalies.length}`);
  } catch (err: any) {
    console.error("[Scheduler] Pipeline error:", err.message);
  } finally {
    isRunning = false;
    pipelineState.isRunning = false;
  }
}

// ─── Simulation scheduler ─────────────────────────────────────────────────────

let _simRunning = false;

/**
 * Run one auto-simulation cycle.
 * Guard prevents overlapping runs (each scenario can take up to 60s due to
 * the optional VM start delay).
 */
async function runSim() {
  if (_simRunning) {
    console.log("[SimCron] Previous simulation still running — skipping");
    return;
  }
  _simRunning = true;
  try {
    await runAutoSimulation();
  } catch (err: any) {
    console.error("[SimCron] Simulation error:", err.message);
  } finally {
    _simRunning = false;
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function startScheduler() {
  console.log(`[Scheduler] Starting telemetry pipeline: ${config.cronSchedule}`);

  // Parse cron to compute next run time
  function computeNextRun() {
    // Default 5-min schedule = 300s from now
    const cronStr = config.cronSchedule;
    const match = cronStr.match(/^\*\/(\d+) \* \* \* \*$/);
    const intervalMinutes = match ? parseInt(match[1]) : 5;
    const next = new Date(Date.now() + intervalMinutes * 60 * 1000);
    pipelineState.nextRunAt = next;
  }

  computeNextRun();

  // Telemetry + anomaly-detection pipeline (every 5 min by default)
  cron.schedule(config.cronSchedule, () => {
    computeNextRun();
    return runPipeline();
  });

  // Anomaly simulation cron — default every 20 min, configurable via env
  const simSchedule = process.env.SIM_CRON_SCHEDULE || "*/20 * * * *";
  console.log(`[SimCron] Starting anomaly simulator: ${simSchedule}`);
  cron.schedule(simSchedule, runSim);

  // Kick off both immediately after a short delay (DB/GCP clients need time)
  setTimeout(runPipeline, 5_000);

  // Simulator starts 90s after boot so the first telemetry cycle can insert
  // resource records before the simulator tries to find them
  setTimeout(runSim, 90_000);
}

export { runPipeline };
