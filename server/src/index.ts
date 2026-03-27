import express from "express";
import cors from "cors";
import { config } from "./config";
import { connectDB } from "./db";
import { initWebSocket } from "./websocket";
import { startScheduler } from "./scheduler";
import costRoutes from "./routes/costs";
import anomalyRoutes from "./routes/anomalies";
import actionRoutes from "./routes/actions";
import dashboardRoutes from "./routes/dashboard";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cloudsnip-server",
    simulation_mode: config.simulationMode,
    dry_run: config.dryRun,
    uptime: process.uptime(),
  });
});

app.use("/api/costs", costRoutes);
app.use("/api/anomalies", anomalyRoutes);
app.use("/api/actions", actionRoutes);
app.use("/api/dashboard", dashboardRoutes);

async function start() {
  await connectDB();

  if (config.simulationMode) {
    const { backfillMetricHistory, simulateCostData, simulateResourceInventory } = await import("./simulation/engine");
    console.log("[Startup] Simulation mode — seeding initial data...");
    await simulateResourceInventory();
    await backfillMetricHistory();
    await simulateCostData();
  }

  app.listen(config.server.port, () => {
    const mode = config.simulationMode ? "SIMULATION" : "LIVE GCP";
    const modeColor = config.simulationMode ? "🟡" : "🟢";

    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║                                                      ║`);
    console.log(`║   ⚡  CloudSnip — Cost Intelligence System           ║`);
    console.log(`║                                                      ║`);
    console.log(`║   API:        http://localhost:${config.server.port}                  ║`);
    console.log(`║   WebSocket:  ws://localhost:${config.server.wsPort}                   ║`);
    console.log(`║   Mode:       ${modeColor}  ${mode.padEnd(36)}  ║`);
    console.log(`║   Dry Run:    ${config.dryRun ? "YES" : "NO"}                                    ║`);
    console.log(`║   Schedule:   ${config.cronSchedule.padEnd(36)}  ║`);
    console.log(`║                                                      ║`);
    console.log(`╚══════════════════════════════════════════════════════╝\n`);

    if (config.simulationMode) {
      console.log("  Demo endpoints:");
      console.log("    POST /api/dashboard/demo/idle-vm        — Trigger idle VM scenario");
      console.log("    POST /api/dashboard/demo/function-spike  — Trigger function spike");
      console.log("    POST /api/dashboard/demo/full-scenario   — Both scenarios combined");
      console.log("    POST /api/dashboard/demo/reset           — Reset to normal\n");
    }

    initWebSocket();
    startScheduler();
  });
}

start();
