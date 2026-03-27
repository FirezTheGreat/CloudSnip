import cron from "node-cron";
import { config } from "./config";
import { collectComputeMetrics, collectFunctionMetrics } from "./collectors/cloud-monitoring";
import { collectCostData } from "./collectors/cloud-billing";
import { collectResourceInventory } from "./collectors/resource-inventory";
import { detectAnomalies } from "./anomaly/client";
import { processAnomalies } from "./optimizer/engine";
import { broadcast } from "./websocket";

let isRunning = false;

async function runPipeline() {
  if (isRunning) {
    console.log("[Scheduler] Pipeline already running — skipping");
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  console.log("[Scheduler] ─── Pipeline started ───");

  try {
    console.log("[Scheduler] Step 1/5: Collecting resource inventory...");
    const resources = await collectResourceInventory();

    const computeInstances = resources
      .filter((r) => r.resourceType === "compute" && r.status === "RUNNING")
      .map((r) => r.resourceId);

    const cloudFunctions = resources
      .filter((r) => r.resourceType === "cloud_function")
      .map((r) => r.resourceId);

    console.log("[Scheduler] Step 2/5: Collecting Cloud Monitoring metrics...");
    await collectComputeMetrics(computeInstances);
    await collectFunctionMetrics(cloudFunctions);

    console.log("[Scheduler] Step 3/5: Collecting cost data...");
    await collectCostData();

    console.log("[Scheduler] Step 4/5: Running anomaly detection...");
    const anomalies = await detectAnomalies();

    if (anomalies.length > 0) {
      broadcast({
        type: "anomalies_detected",
        data: { count: anomalies.length, anomalies },
      });
    }

    console.log("[Scheduler] Step 5/5: Processing anomalies...");
    await processAnomalies();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Scheduler] ─── Pipeline complete (${duration}s) ───`);
    console.log(`[Scheduler]   Resources: ${resources.length}, Anomalies: ${anomalies.length}`);
  } catch (err: any) {
    console.error("[Scheduler] Pipeline error:", err.message);
  } finally {
    isRunning = false;
  }
}

export function startScheduler() {
  console.log(`[Scheduler] Starting with schedule: ${config.cronSchedule}`);

  cron.schedule(config.cronSchedule, runPipeline);

  setTimeout(runPipeline, 5000);
}

export { runPipeline };
