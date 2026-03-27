import { Router } from "express";
import { query } from "../db";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const result = await query(
      `SELECT
        id, executed_at, anomaly_id, resource_id, resource_type,
        action_type, status,
        cost_before_hourly, cost_after_hourly,
        savings_hourly, savings_monthly_projected,
        details, dry_run
      FROM actions
      ORDER BY executed_at DESC
      LIMIT $1`,
      [limit]
    );

    res.json({ data: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/savings", async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        COALESCE(SUM(savings_hourly), 0) AS total_hourly,
        COALESCE(SUM(savings_monthly_projected), 0) AS total_monthly,
        COUNT(*) AS total_actions,
        COUNT(*) FILTER (WHERE status = 'success') AS successful,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed
      FROM actions
    `);

    const byType = await query(`
      SELECT
        action_type,
        COUNT(*) AS count,
        COALESCE(SUM(savings_monthly_projected), 0) AS savings
      FROM actions
      WHERE status = 'success'
      GROUP BY action_type
      ORDER BY savings DESC
    `);

    res.json({
      summary: result.rows[0],
      byType: byType.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
