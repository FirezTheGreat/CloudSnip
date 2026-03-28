import { createServer } from "http";
import express from "express";
import cors from "cors";
import { config } from "./config";
import { connectDB } from "./db";
import { initSocketIO } from "./socket-io";
import { startScheduler } from "./scheduler";
import costRoutes from "./routes/costs";
import anomalyRoutes from "./routes/anomalies";
import actionRoutes from "./routes/actions";
import dashboardRoutes from "./routes/dashboard";
import budgetRoutes from "./routes/budgets";
import recommendationRoutes from "./routes/recommendations";
import simulationRoutes from "./routes/simulation";
import whatIfRoutes from "./routes/what-if";
import analyticsRoutes from "./routes/analytics";
import { complianceRouter } from "./routes/compliance";

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
app.use("/api/budgets", budgetRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/simulation", simulationRoutes);
app.use("/api/costs/what-if", whatIfRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/dashboard", complianceRouter);

const httpServer = createServer(app);

async function start() {
  await connectDB();

  httpServer.listen(config.server.port, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Cloud Cost Intelligence System              ║`);
    console.log(`║  API + Socket.IO: http://localhost:${config.server.port}        ║`);
    console.log(`║  Dry Run:   ${config.dryRun ? "YES (no real actions)" : "NO (live mode)"}       ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);

    initSocketIO(httpServer);
    startScheduler();
  });
}

start();
