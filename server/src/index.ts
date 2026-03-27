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
    service: "cloud-cost-intel-server",
    dryRun: config.dryRun,
    uptime: process.uptime(),
  });
});

app.use("/api/costs", costRoutes);
app.use("/api/anomalies", anomalyRoutes);
app.use("/api/actions", actionRoutes);
app.use("/api/dashboard", dashboardRoutes);

async function start() {
  await connectDB();

  app.listen(config.server.port, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Cloud Cost Intelligence System              ║`);
    console.log(`║  API:       http://localhost:${config.server.port}             ║`);
    console.log(`║  WebSocket: ws://localhost:${config.server.wsPort}              ║`);
    console.log(`║  Dry Run:   ${config.dryRun ? "YES (no real actions)" : "NO (live mode)"}       ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);

    initWebSocket();
    startScheduler();
  });
}

start();
