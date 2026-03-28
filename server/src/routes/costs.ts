import { Router } from "express";
import { Metric } from "../models/Metric";
import { Resource } from "../models/Resource";
import { CostSummary } from "../models/CostSummary";
import { config } from "../config";

const router = Router();

router.get("/trend", async (req, res) => {
  try {
    const hours = Math.min(Number(req.query.hours) || 24, 168);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const truncUnit = hours > 48 ? "day" : "hour";

    const data = await Metric.aggregate([
      {
        $match: {
          metric_name: "estimated_cost",
          time: { $gt: cutoff },
        },
      },
      {
        $group: {
          _id: {
            bucket: { $dateTrunc: { date: "$time", unit: truncUnit } },
            resource_type: "$resource_type",
          },
          avg_value: { $avg: "$value" },
          total_value: { $sum: "$value" },
        },
      },
      { $sort: { "_id.bucket": 1 } },
      {
        $project: {
          _id: 0,
          hour: "$_id.bucket",
          resource_type: "$_id.resource_type",
          avg_value: 1,
          total_value: 1,
        },
      },
    ]);

    res.json({ data, bucket: truncUnit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/by-service", async (_req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const data = await CostSummary.aggregate([
      { $match: { time: { $gt: sevenDaysAgo } } },
      {
        $group: {
          _id: "$service",
          total: { $sum: "$total_cost" },
          latest: { $max: "$time" },
        },
      },
      { $sort: { total: -1 } },
      {
        $project: {
          _id: 0,
          service: "$_id",
          total: 1,
          latest: 1,
        },
      },
    ]);

    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/daily", async (_req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const data = await CostSummary.aggregate([
      { $match: { time: { $gt: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            day: { $dateTrunc: { date: "$time", unit: "day" } },
            service: "$service",
          },
          cost: { $sum: "$total_cost" },
        },
      },
      { $sort: { "_id.day": 1 } },
      {
        $project: {
          _id: 0,
          day: "$_id.day",
          service: "$_id.service",
          cost: 1,
        },
      },
    ]);

    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/by-label", async (_req, res) => {
  try {
    const resources = await Resource.find().lean();

    const labelCosts: Record<string, { cost: number; count: number }> = {};
    for (const r of resources) {
      const labels = r.metadata?.labels || r.tags || {};
      const entries = Object.entries(labels);
      if (entries.length === 0) {
        const key = "unlabeled";
        if (!labelCosts[key]) labelCosts[key] = { cost: 0, count: 0 };
        labelCosts[key].cost += (r.hourly_cost || 0) * 730;
        labelCosts[key].count++;
      } else {
        for (const [k, v] of entries) {
          const key = `${k}:${v}`;
          if (!labelCosts[key]) labelCosts[key] = { cost: 0, count: 0 };
          labelCosts[key].cost += (r.hourly_cost || 0) * 730;
          labelCosts[key].count++;
        }
      }
    }

    const data = Object.entries(labelCosts)
      .map(([label, info]) => ({ label, monthly_cost: Number(info.cost.toFixed(2)), count: info.count }))
      .sort((a, b) => b.monthly_cost - a.monthly_cost);

    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/forecast", async (_req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const historicalData = await Metric.aggregate([
      { $match: { metric_name: "estimated_cost", time: { $gt: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateTrunc: { date: "$time", unit: "hour" } },
          total_cost: { $sum: "$value" },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, ds: "$_id", y: "$total_cost" } },
    ]);

    if (historicalData.length < 6) {
      return res.json({ forecast: [], message: "Not enough data for forecasting" });
    }

    try {
      const mlResponse = await fetch(`${config.ml.url}/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historicalData, periods: 168 }),
      });

      if (mlResponse.ok) {
        const result = await mlResponse.json();
        return res.json(result);
      }
    } catch {
      // ML service forecast not available, use simple linear projection
    }

    const n = historicalData.length;
    const avgCost = historicalData.reduce((s, d) => s + d.y, 0) / n;
    const lastCost = historicalData[n - 1].y;
    const trend = n > 1 ? (lastCost - historicalData[0].y) / n : 0;

    const forecast = [];
    const lastTime = new Date(historicalData[n - 1].ds);
    for (let i = 1; i <= 168; i++) {
      const ds = new Date(lastTime.getTime() + i * 3600000);
      const predicted = Math.max(0, avgCost + trend * i);
      forecast.push({
        ds,
        yhat: Number(predicted.toFixed(6)),
        yhat_lower: Number(Math.max(0, predicted * 0.7).toFixed(6)),
        yhat_upper: Number((predicted * 1.3).toFixed(6)),
      });
    }

    res.json({ forecast, method: "linear_projection" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
