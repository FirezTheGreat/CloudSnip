import cron from "node-cron";
import { config } from "./config";
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
    let resourceCount = 0;

    if (config.simulationMode) {
      const { simulateResourceInventory, simulateMetrics, simulateCostData } = await import("./simulation/engine");

      console.log("[Scheduler] Step 1/5: Loading simulated resources...");
      const resources = await simulateResourceInventory();
      resourceCount = resources.length;

      console.log("[Scheduler] Step 2/5: Generating simulated metrics...");
      await simulateMetrics();

      console.log("[Scheduler] Step 3/5: Generating simulated cost data...");
      await simulateCostData();
    } else {
      const { collectResourceInventory } = await import("./collectors/resource-inventory");
      const { collectComputeMetrics, collectFunctionMetrics } = await import("./collectors/cloud-monitoring");
      const { collectCostData } = await import("./collectors/cloud-billing");

      console.log("[Scheduler] Step 1/5: Collecting resource inventory...");
      const resources = await collectResourceInventory();
      resourceCount = resources.length;

      const computeIds = resources
        .filter((r) => r.resourceType === "compute" && r.status === "RUNNING")
        .map((r) => r.resourceId);
      const functionIds = resources
        .filter((r) => r.resourceType === "cloud_function")
        .map((r) => r.resourceId);

      console.log("[Scheduler] Step 2/5: Collecting Cloud Monitoring metrics...");
      await collectComputeMetrics(computeIds);
      await collectFunctionMetrics(functionIds);

      console.log("[Scheduler] Step 3/5: Collecting cost data...");
      await collectCostData();
    }

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
    console.log(`[Scheduler]   Mode: ${config.simulationMode ? "SIMULATION" : "LIVE GCP"}, Resources: ${resourceCount}, Anomalies: ${anomalies.length}`);
  } catch (err: any) {
    console.error("[Scheduler] Pipeline error:", err.message);
  } finally {
    isRunning = false;
  }
}

export function startScheduler() {
  console.log(`[Scheduler] Starting with schedule: ${config.cronSchedule}`);
  cron.schedule(config.cronSchedule, runPipeline);
  setTimeout(runPipeline, 3000);
}

export { runPipeline };
