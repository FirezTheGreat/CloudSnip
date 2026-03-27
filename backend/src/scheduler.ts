import cron from "node-cron";
import { config } from "./config";
import { collectEC2Metrics, collectLambdaMetrics } from "./collectors/cloudwatch";
import { collectCostData } from "./collectors/cost-explorer";
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
    // Step 1: Collect resource inventory
    console.log("[Scheduler] Step 1/5: Collecting resource inventory...");
    const resources = await collectResourceInventory();

    const ec2Instances = resources
      .filter((r) => r.resourceType === "ec2" && r.status === "running")
      .map((r) => r.resourceId);

    const lambdaFunctions = resources
      .filter((r) => r.resourceType === "lambda")
      .map((r) => r.resourceId);

    // Step 2: Collect CloudWatch metrics
    console.log("[Scheduler] Step 2/5: Collecting CloudWatch metrics...");
    await collectEC2Metrics(ec2Instances);
    await collectLambdaMetrics(lambdaFunctions);

    // Step 3: Collect cost data
    console.log("[Scheduler] Step 3/5: Collecting cost data...");
    await collectCostData();

    // Step 4: Run anomaly detection
    console.log("[Scheduler] Step 4/5: Running anomaly detection...");
    const anomalies = await detectAnomalies();

    if (anomalies.length > 0) {
      broadcast({
        type: "anomalies_detected",
        data: { count: anomalies.length, anomalies },
      });
    }

    // Step 5: Process anomalies (execute optimizations)
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

  // Run immediately on startup
  setTimeout(runPipeline, 5000);
}

export { runPipeline };
