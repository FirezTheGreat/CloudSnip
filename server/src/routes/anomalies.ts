import { Router } from "express";
import { Anomaly } from "../models/Anomaly";
import { Action } from "../models/Action";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const resolved = req.query.resolved === "true";

    const anomalies = await Anomaly.find({ resolved })
      .sort({ detected_at: -1 })
      .limit(limit)
      .lean();

    const anomalyIds = anomalies.map((a) => a._id);
    const actions = await Action.find({ anomaly_id: { $in: anomalyIds } })
      .select("anomaly_id action_type status savings_monthly_projected")
      .lean();

    const actionMap = new Map(actions.map((a) => [String(a.anomaly_id), a]));

    const data = anomalies.map((a) => {
      const action = actionMap.get(String(a._id));
      return {
        id: a._id,
        detected_at: a.detected_at,
        resource_id: a.resource_id,
        resource_type: a.resource_type,
        anomaly_type: a.anomaly_type,
        severity: a.severity,
        anomaly_score: a.anomaly_score,
        metric_snapshot: a.metric_snapshot,
        description: a.description,
        explanation: a.explanation || null,
        resolved: a.resolved,
        resolved_at: a.resolved_at,
        action_type: action?.action_type || null,
        action_status: action?.status || null,
        savings_monthly_projected: action?.savings_monthly_projected || null,
      };
    });

    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const data = await Anomaly.aggregate([
      { $match: { detected_at: { $gt: twentyFourHoursAgo } } },
      {
        $group: {
          _id: { anomaly_type: "$anomaly_type", severity: "$severity" },
          count: { $sum: 1 },
          avg_score: { $avg: "$anomaly_score" },
        },
      },
      { $sort: { count: -1 } },
      {
        $project: {
          _id: 0,
          anomaly_type: "$_id.anomaly_type",
          severity: "$_id.severity",
          count: 1,
          avg_score: 1,
        },
      },
    ]);

    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/heatmap", async (_req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const raw = await Anomaly.aggregate([
      { $match: { detected_at: { $gt: sevenDaysAgo } } },
      {
        $group: {
          _id: {
            dayOfWeek: { $dayOfWeek: "$detected_at" }, // 1=Sun … 7=Sat
            hour: { $hour: "$detected_at" },
          },
          count: { $sum: 1 },
          types: { $addToSet: "$anomaly_type" },
        },
      },
    ]);

    // Build a lookup map: "dayOfWeek-hour" → { count, types }
    const map: Record<string, { count: number; types: string[] }> = {};
    for (const row of raw) {
      map[`${row._id.dayOfWeek}-${row._id.hour}`] = {
        count: row.count,
        types: row.types,
      };
    }

    // Flatten into array the UI can render directly
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const cells = [];
    for (let dayIdx = 1; dayIdx <= 7; dayIdx++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${dayIdx}-${hour}`;
        cells.push({
          day: DAYS[dayIdx - 1],
          day_index: dayIdx,
          hour,
          count: map[key]?.count || 0,
          types: map[key]?.types || [],
        });
      }
    }

    const maxCount = Math.max(...cells.map((c) => c.count), 1);
    res.json({ cells, max_count: maxCount, period_days: 7 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
