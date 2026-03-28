import { Router } from "express";
import { Resource } from "../models/Resource";
import { Anomaly } from "../models/Anomaly";
import { Action } from "../models/Action";
import { runPipeline, pipelineState } from "../scheduler";
import { config } from "../config";

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
      connected_gcp_project: config.gcp.projectId?.trim() || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/resources", async (_req, res) => {
  try {
    const data = await Resource.find()
      .sort({ last_seen: -1, name: 1 })
      .lean();

    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/anomaly-timeline", async (req, res) => {
  try {
    const hours = Math.min(Number(req.query.hours) || 168, 720);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const truncUnit = hours > 48 ? "day" : "hour";

    const [detectedAgg, resolvedAgg] = await Promise.all([
      Anomaly.aggregate([
        { $match: { detected_at: { $gt: cutoff } } },
        {
          $group: {
            _id: { $dateTrunc: { date: "$detected_at", unit: truncUnit } },
            detected: { $sum: 1 },
          },
        },
      ]),
      Anomaly.aggregate([
        {
          $match: {
            resolved: true,
            resolved_at: { $exists: true, $ne: null, $gt: cutoff },
          },
        },
        {
          $group: {
            _id: { $dateTrunc: { date: "$resolved_at", unit: truncUnit } },
            resolved: { $sum: 1 },
          },
        },
      ]),
    ]);

    const merged = new Map<string, { bucket: Date; detected: number; resolved: number }>();

    for (const row of detectedAgg) {
      const key = new Date(row._id as Date).toISOString();
      merged.set(key, {
        bucket: row._id as Date,
        detected: row.detected as number,
        resolved: 0,
      });
    }
    for (const row of resolvedAgg) {
      const key = new Date(row._id as Date).toISOString();
      const cur = merged.get(key) || {
        bucket: row._id as Date,
        detected: 0,
        resolved: 0,
      };
      cur.resolved = row.resolved as number;
      cur.bucket = row._id as Date;
      merged.set(key, cur);
    }

    const data = [...merged.values()].sort(
      (a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime()
    );

    res.json({ data, bucket: truncUnit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/trigger-scan", async (_req, res) => {
  try {
    runPipeline();
    res.json({ message: "Pipeline triggered — check live feed (Socket.IO) for results" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Pipeline status (used by PipelineHealthIndicator in the dashboard header) ─

router.get("/pipeline-status", async (_req, res) => {
  // Check ML service reachability (quick HEAD-like GET to /health)
  let mlOnline = false;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(`${config.ml.url}/health`, { signal: ctrl.signal });
    clearTimeout(timeout);
    mlOnline = r.ok;
  } catch {
    mlOnline = false;
  }

  const nextRunIn = pipelineState.nextRunAt
    ? Math.max(0, Math.round((pipelineState.nextRunAt.getTime() - Date.now()) / 1000))
    : null;

  res.json({
    lastRunAt: pipelineState.lastRunAt?.toISOString() ?? null,
    nextRunIn,
    mlOnline,
    cyclesCompleted: pipelineState.cyclesCompleted,
    lastRunDurationMs: pipelineState.lastRunDurationMs,
    isRunning: pipelineState.isRunning,
  });
});

export default router;
