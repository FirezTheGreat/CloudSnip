import { Router } from "express";
import { Budget } from "../models/Budget";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const budgets = await Budget.find().sort({ created_at: -1 }).lean();
    const data = budgets.map((b) => ({
      id: String(b._id),
      name: b.name,
      resource_type: b.resource_type,
      monthly_limit: b.monthly_limit,
      current_spend: b.current_spend,
      alert_thresholds: b.alert_thresholds,
      alerts_sent: b.alerts_sent,
      percent_used: b.monthly_limit > 0 ? Number(((b.current_spend / b.monthly_limit) * 100).toFixed(1)) : 0,
      last_checked: b.last_checked,
      created_at: b.created_at,
    }));
    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, resource_type, monthly_limit, alert_thresholds } = req.body;
    if (!name || !monthly_limit) {
      return res.status(400).json({ error: "name and monthly_limit are required" });
    }

    const budget = await Budget.create({
      name,
      resource_type: resource_type || "all",
      monthly_limit,
      alert_thresholds: alert_thresholds || [50, 80, 100],
    });

    res.status(201).json({ id: String(budget._id), message: "Budget created" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Budget.findByIdAndDelete(req.params.id);
    res.json({ message: "Budget deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
