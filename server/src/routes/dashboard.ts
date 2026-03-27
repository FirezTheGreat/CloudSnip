import { Router } from "express";
import { Resource } from "../models/Resource";
import { Anomaly } from "../models/Anomaly";
import { Action } from "../models/Action";
import { Metric } from "../models/Metric";
import { config } from "../config";
import { runPipeline } from "../scheduler";

const router = Router();

router.get("/summary", async (_req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalResources,
      activeResources,
      openAnomalies,
      anomalies24h,
      savingsAgg,
      costAgg,
    ] = await Promise.all([
      Resource.countDocuments(),
      Resource.countDocuments({ status: { $in: ["RUNNING", "active"] } }),
      Anomaly.countDocuments({ resolved: false }),
      Anomaly.countDocuments({ detected_at: { $gt: twentyFourHoursAgo } }),
      Action.aggregate([
        { $match: { status: "success" } },
        {
          $group: {
            _id: null,
            total_monthly: { $sum: "$savings_monthly_projected" },
            total_hourly: { $sum: "$savings_hourly" },
            count: { $sum: 1 },
          },
        },
      ]),
      Resource.aggregate([
        { $match: { status: { $in: ["RUNNING", "active", "unattached"] } } },
        { $group: { _id: null, total: { $sum: "$hourly_cost" } } },
      ]),
    ]);

    const savings = savingsAgg[0] || { total_monthly: 0, total_hourly: 0, count: 0 };
    const cost = costAgg[0] || { total: 0 };

    res.json({
      total_resources: totalResources,
      active_resources: activeResources,
      open_anomalies: openAnomalies,
      anomalies_24h: anomalies24h,
      total_monthly_savings: savings.total_monthly,
      total_hourly_savings: savings.total_hourly,
      actions_taken: savings.count,
      current_hourly_cost: cost.total,
      simulation_mode: config.simulationMode,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/resources", async (_req, res) => {
  try {
    const data = await Resource.find()
      .sort({ resource_type: 1, name: 1 })
      .lean();

    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/trigger-scan", async (_req, res) => {
  try {
    runPipeline();
    res.json({ message: "Pipeline triggered", simulation_mode: config.simulationMode });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/demo/idle-vm", async (_req, res) => {
  try {
    const { setAnomalyScenario } = await import("../simulation/engine");
    setAnomalyScenario("idle_vm");
    runPipeline();
    res.json({ message: "Idle VM scenario activated — dev-sandbox CPU will drop over next cycles" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/demo/function-spike", async (_req, res) => {
  try {
    const { setAnomalyScenario } = await import("../simulation/engine");
    setAnomalyScenario("function_spike");
    runPipeline();
    res.json({ message: "Function spike scenario activated — process-uploads invocations will surge" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/demo/full-scenario", async (_req, res) => {
  try {
    const { setAnomalyScenario } = await import("../simulation/engine");
    setAnomalyScenario("idle_then_spike");
    runPipeline();
    res.json({ message: "Full scenario activated — idle VM first, then function spike" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/demo/reset", async (_req, res) => {
  try {
    const { setAnomalyScenario } = await import("../simulation/engine");
    setAnomalyScenario("normal");
    await Anomaly.updateMany({ resolved: false }, { resolved: true, resolved_at: new Date(), resolved_by: "manual_reset" });
    res.json({ message: "Demo reset — anomalies cleared, back to normal patterns" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
