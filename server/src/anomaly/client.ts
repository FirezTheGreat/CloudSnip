import { config } from "../config";
import { Metric } from "../models/Metric";
import { Anomaly } from "../models/Anomaly";
import { Resource } from "../models/Resource";

interface MLAnomaly {
  resource_id: string;
  anomaly_score: number;
  is_anomaly: boolean;
  anomaly_type: string;
  contributing_factors: string[];
  latest_metrics: Record<string, number>;
}

interface MLResponse {
  anomalies: MLAnomaly[];
  model_info: Record<string, any>;
}

const SEVERITY_MAP: Record<string, (score: number) => string> = {
  idle_instance: (s) => (s > 0.9 ? "high" : s > 0.7 ? "medium" : "low"),
  runaway_function: (s) => (s > 0.85 ? "critical" : s > 0.7 ? "high" : "medium"),
  cost_spike: (s) => (s > 0.9 ? "critical" : s > 0.75 ? "high" : "medium"),
  usage_anomaly: (s) => (s > 0.8 ? "high" : "medium"),
};

export async function detectAnomalies(): Promise<MLAnomaly[]> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const metricsRaw = await Metric.aggregate([
    { $match: { time: { $gt: twoHoursAgo } } },
    { $sort: { resource_id: 1, time: 1 } },
    {
      $group: {
        _id: { resource_id: "$resource_id", time: "$time" },
        cpu_utilization: {
          $max: { $cond: [{ $eq: ["$metric_name", "cpuutilization"] }, "$value", 0] },
        },
        invocation_count: {
          $max: { $cond: [{ $eq: ["$metric_name", "invocations"] }, "$value", 0] },
        },
        network_in: {
          $max: { $cond: [{ $eq: ["$metric_name", "networkin"] }, "$value", 0] },
        },
        network_out: {
          $max: { $cond: [{ $eq: ["$metric_name", "networkout"] }, "$value", 0] },
        },
      },
    },
  ]);

  if (metricsRaw.length < 10) {
    console.log(`[Anomaly] Not enough data points (${metricsRaw.length}) — need at least 10`);
    return [];
  }

  const resourceIds = [...new Set(metricsRaw.map((m) => m._id.resource_id))];
  const resourceCosts = await Resource.find(
    { resource_id: { $in: resourceIds } },
    { resource_id: 1, hourly_cost: 1 }
  ).lean();
  const costMap = new Map(resourceCosts.map((r) => [r.resource_id, r.hourly_cost || 0]));

  const payload = {
    metrics: metricsRaw.map((row) => ({
      resource_id: row._id.resource_id,
      timestamp: row._id.time,
      cpu_utilization: row.cpu_utilization || 0,
      invocation_count: row.invocation_count || 0,
      network_in: row.network_in || 0,
      network_out: row.network_out || 0,
      estimated_hourly_cost: costMap.get(row._id.resource_id) || 0,
    })),
  };

  try {
    const response = await fetch(`${config.ml.url}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Anomaly] ML service returned ${response.status}`);
      return [];
    }

    const data: MLResponse = await response.json();
    console.log(`[Anomaly] ML service analyzed ${data.model_info.samples_used} samples, found ${data.anomalies.length} anomalies`);

    const confirmedAnomalies: MLAnomaly[] = [];

    for (const anomaly of data.anomalies) {
      if (anomaly.anomaly_score < config.thresholds.anomalyScoreThreshold) continue;

      const severityFn = SEVERITY_MAP[anomaly.anomaly_type] || SEVERITY_MAP.usage_anomaly;
      const severity = severityFn(anomaly.anomaly_score);
      const description = buildDescription(anomaly);

      const resource = await Resource.findOne(
        { resource_id: anomaly.resource_id },
        { resource_type: 1 }
      ).lean();

      await Anomaly.create({
        resource_id: anomaly.resource_id,
        resource_type: resource?.resource_type || "unknown",
        anomaly_type: anomaly.anomaly_type,
        severity,
        anomaly_score: anomaly.anomaly_score,
        metric_snapshot: anomaly.latest_metrics,
        description,
      });

      confirmedAnomalies.push(anomaly);
    }

    console.log(`[Anomaly] ${confirmedAnomalies.length} anomalies above threshold (${config.thresholds.anomalyScoreThreshold})`);
    return confirmedAnomalies;
  } catch (err: any) {
    console.error("[Anomaly] ML service error:", err.message);
    return [];
  }
}

function buildDescription(anomaly: MLAnomaly): string {
  const parts: string[] = [];

  switch (anomaly.anomaly_type) {
    case "idle_instance":
      parts.push(
        `VM ${anomaly.resource_id} is idle — CPU at ${anomaly.latest_metrics.cpu_utilization?.toFixed(1)}%`
      );
      break;
    case "runaway_function":
      parts.push(
        `Cloud Function ${anomaly.resource_id} invocation spike — ${anomaly.latest_metrics.invocation_count} invocations`
      );
      break;
    case "cost_spike":
      parts.push(
        `Cost spike on ${anomaly.resource_id} — $${anomaly.latest_metrics.estimated_hourly_cost?.toFixed(4)}/hr`
      );
      break;
    default:
      parts.push(`Anomaly on ${anomaly.resource_id} (score: ${anomaly.anomaly_score})`);
  }

  if (anomaly.contributing_factors.length > 0) {
    parts.push(`Contributing factors: ${anomaly.contributing_factors.join(", ")}`);
  }

  return parts.join(". ");
}
