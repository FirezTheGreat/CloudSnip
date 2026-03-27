import { Router } from "express";
import { Metric } from "../models/Metric";
import { CostSummary } from "../models/CostSummary";

const router = Router();

router.get("/trend", async (_req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const data = await Metric.aggregate([
      {
        $match: {
          metric_name: { $in: ["estimated_cost", "cpuutilization"] },
          time: { $gt: twentyFourHoursAgo },
        },
      },
      {
        $group: {
          _id: {
            hour: {
              $dateTrunc: { date: "$time", unit: "hour" },
            },
            resource_type: "$resource_type",
          },
          avg_value: { $avg: "$value" },
          total_value: { $sum: "$value" },
        },
      },
      { $sort: { "_id.hour": 1 } },
      {
        $project: {
          _id: 0,
          hour: "$_id.hour",
          resource_type: "$_id.resource_type",
          avg_value: 1,
          total_value: 1,
        },
      },
    ]);

    res.json({ data });
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

export default router;
