import { Router } from "express";
import { query } from "../db";
import { runPipeline } from "../scheduler";

const router = Router();

router.get("/summary", async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM resources) AS total_resources,
        (SELECT COUNT(*) FROM resources WHERE status = 'running' OR status = 'active') AS active_resources,
        (SELECT COUNT(*) FROM anomalies WHERE resolved = FALSE) AS open_anomalies,
        (SELECT COUNT(*) FROM anomalies WHERE detected_at > NOW() - INTERVAL '24 hours') AS anomalies_24h,
        (SELECT COALESCE(SUM(savings_monthly_projected), 0) FROM actions WHERE status = 'success') AS total_monthly_savings,
        (SELECT COALESCE(SUM(savings_hourly), 0) FROM actions WHERE status = 'success') AS total_hourly_savings,
        (SELECT COUNT(*) FROM actions WHERE status = 'success') AS actions_taken,
        (SELECT COALESCE(SUM(hourly_cost), 0) FROM resources WHERE status IN ('running', 'active', 'unattached')) AS current_hourly_cost
    `);

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/resources", async (_req, res) => {
  try {
    const result = await query(`
      SELECT resource_id, resource_type, name, status, region, hourly_cost, last_seen, metadata
      FROM resources
      ORDER BY resource_type, name
    `);

    res.json({ data: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/trigger-scan", async (_req, res) => {
  try {
    runPipeline();
    res.json({ message: "Pipeline triggered — check WebSocket for results" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
