import { Router } from "express";
import { query } from "../db";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const resolved = req.query.resolved === "true";

    const result = await query(
      `SELECT
        a.id, a.detected_at, a.resource_id, a.resource_type,
        a.anomaly_type, a.severity, a.anomaly_score,
        a.metric_snapshot, a.description, a.resolved, a.resolved_at,
        act.action_type, act.status AS action_status,
        act.savings_monthly_projected
      FROM anomalies a
      LEFT JOIN actions act ON act.anomaly_id = a.id
      WHERE a.resolved = $1
      ORDER BY a.detected_at DESC
      LIMIT $2`,
      [resolved, limit]
    );

    res.json({ data: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        anomaly_type,
        severity,
        COUNT(*) AS count,
        AVG(anomaly_score) AS avg_score
      FROM anomalies
      WHERE detected_at > NOW() - INTERVAL '24 hours'
      GROUP BY anomaly_type, severity
      ORDER BY count DESC
    `);

    res.json({ data: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
