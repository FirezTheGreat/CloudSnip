import { Router } from "express";
import { Action } from "../models/Action";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const data = await Action.find()
      .sort({ executed_at: -1 })
      .limit(limit)
      .lean();

    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/savings", async (_req, res) => {
  try {
    const [summaryResult] = await Action.aggregate([
      {
        $group: {
          _id: null,
          total_hourly: { $sum: "$savings_hourly" },
          total_monthly: { $sum: "$savings_monthly_projected" },
          total_actions: { $sum: 1 },
          successful: {
            $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
          },
        },
      },
    ]);

    const summary = summaryResult || {
      total_hourly: 0,
      total_monthly: 0,
      total_actions: 0,
      successful: 0,
      failed: 0,
    };

    const byType = await Action.aggregate([
      { $match: { status: "success" } },
      {
        $group: {
          _id: "$action_type",
          count: { $sum: 1 },
          savings: { $sum: "$savings_monthly_projected" },
        },
      },
      { $sort: { savings: -1 } },
      {
        $project: {
          _id: 0,
          action_type: "$_id",
          count: 1,
          savings: 1,
        },
      },
    ]);

    res.json({ summary, byType });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
