import { Router } from "express";
import { query } from "../db";

const router = Router();

router.get("/trend", async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        time_bucket('1 hour', time) AS hour,
        resource_type,
        AVG(value) AS avg_value,
        SUM(value) AS total_value
      FROM metrics
      WHERE metric_name IN ('estimated_cost', 'cpuutilization')
        AND time > NOW() - INTERVAL '24 hours'
      GROUP BY hour, resource_type
      ORDER BY hour
    `);

    res.json({ data: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/by-service", async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        service,
        SUM(total_cost) AS total,
        MAX(time) AS latest
      FROM cost_summaries
      WHERE time > NOW() - INTERVAL '7 days'
      GROUP BY service
      ORDER BY total DESC
    `);

    res.json({ data: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/daily", async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        time_bucket('1 day', time) AS day,
        service,
        SUM(total_cost) AS cost
      FROM cost_summaries
      WHERE time > NOW() - INTERVAL '30 days'
      GROUP BY day, service
      ORDER BY day
    `);

    res.json({ data: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
