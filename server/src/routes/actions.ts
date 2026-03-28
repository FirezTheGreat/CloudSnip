import { Router } from "express";
import { Action } from "../models/Action";
import { approveAction, rejectAction } from "../optimizer/engine";
import { rollbackAction, isReversible } from "../optimizer/actions/rollback";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const rows = await Action.find()
      .sort({ executed_at: -1 })
      .limit(limit)
      .lean();

    const data = rows.map((a) => ({
      id: String(a._id),
      executed_at: a.executed_at,
      anomaly_id: a.anomaly_id != null ? String(a.anomaly_id) : null,
      resource_id: a.resource_id,
      resource_type: a.resource_type,
      action_type: a.action_type,
      status: a.status,
      cost_before_hourly: a.cost_before_hourly,
      cost_after_hourly: a.cost_after_hourly,
      savings_hourly: a.savings_hourly,
      savings_monthly_projected: a.savings_monthly_projected,
      details: a.details ?? {},
      dry_run: a.dry_run,
      can_rollback: a.status === "success" && isReversible(a.action_type),
      can_approve: a.status === "pending_approval",
    }));

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
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending_approval"] }, 1, 0] },
          },
          rolled_back: {
            $sum: { $cond: [{ $eq: ["$status", "rolled_back"] }, 1, 0] },
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
      pending: 0,
      rolled_back: 0,
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

router.post("/:id/approve", async (req, res) => {
  try {
    const result = await approveAction(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const result = await rejectAction(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/rollback", async (req, res) => {
  try {
    const result = await rollbackAction(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
