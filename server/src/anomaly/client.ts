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

  let detectedAnomalies: MLAnomaly[];

  try {
    const response = await fetch(`${config.ml.url}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[Anomaly] ML service returned ${response.status} — falling back to rules`);
      detectedAnomalies = runRuleBasedDetection(payload.metrics);
    } else {
      const data = (await response.json()) as MLResponse;
      console.log(`[Anomaly] ML service analyzed ${data.model_info.samples_used} samples, found ${data.anomalies.length} anomalies`);
      detectedAnomalies = data.anomalies;
    }
  } catch (err: any) {
    console.warn(`[Anomaly] ML service unavailable (${err.message}) — using rule-based fallback`);
    detectedAnomalies = runRuleBasedDetection(payload.metrics);
  }

  const confirmedAnomalies: MLAnomaly[] = [];

  // Also run rule-based detection to catch what ML misses
  const ruleAnomalies = runRuleBasedDetection(payload.metrics);
  for (const ra of ruleAnomalies) {
    const alreadyDetected = detectedAnomalies.some((d) => d.resource_id === ra.resource_id);
    if (!alreadyDetected) detectedAnomalies.push(ra);
  }

  for (const anomaly of detectedAnomalies) {
    if (anomaly.anomaly_score < config.thresholds.anomalyScoreThreshold) continue;

    // Reclassify generic usage_anomaly based on actual metrics
    if (anomaly.anomaly_type === "usage_anomaly") {
      const cpu = anomaly.latest_metrics.cpu_utilization || 0;
      const invocations = anomaly.latest_metrics.invocation_count || 0;
      if (cpu > 0 && cpu < config.thresholds.idleCpuPercent) {
        anomaly.anomaly_type = "idle_instance";
      } else if (invocations > 50) {
        anomaly.anomaly_type = "runaway_function";
      }
    }

    const existing = await Anomaly.findOne({
      resource_id: anomaly.resource_id,
      anomaly_type: anomaly.anomaly_type,
      resolved: false,
    });
    if (existing) continue;

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

  console.log(`[Anomaly] ${confirmedAnomalies.length} new anomalies above threshold (${config.thresholds.anomalyScoreThreshold})`);
  return confirmedAnomalies;
}

function runRuleBasedDetection(
  metrics: Array<{ resource_id: string; cpu_utilization: number; invocation_count: number; network_in: number; network_out: number; estimated_hourly_cost: number }>
): MLAnomaly[] {
  const anomalies: MLAnomaly[] = [];
  const byResource = new Map<string, typeof metrics>();

  for (const m of metrics) {
    const existing = byResource.get(m.resource_id) || [];
    existing.push(m);
    byResource.set(m.resource_id, existing);
  }

  for (const [resourceId, points] of byResource) {
    if (points.length < 3) continue;

    const recentPoints = points.slice(-6);

    const avgCpu = recentPoints.reduce((s, p) => s + p.cpu_utilization, 0) / recentPoints.length;
    if (avgCpu > 0 && avgCpu < config.thresholds.idleCpuPercent) {
      const lp = recentPoints[recentPoints.length - 1];
      anomalies.push({
        resource_id: resourceId,
        anomaly_score: Math.min(0.95, 0.7 + (config.thresholds.idleCpuPercent - avgCpu) * 0.05),
        is_anomaly: true,
        anomaly_type: "idle_instance",
        contributing_factors: [`cpu_utilization: ${avgCpu.toFixed(1)} (threshold: ${config.thresholds.idleCpuPercent})`],
        latest_metrics: { cpu_utilization: lp.cpu_utilization, invocation_count: lp.invocation_count, network_in: lp.network_in, network_out: lp.network_out, estimated_hourly_cost: lp.estimated_hourly_cost },
      });
      continue;
    }

    const allInvocations = points.map((p) => p.invocation_count).filter((v) => v > 0);
    if (allInvocations.length >= 4) {
      const baseline = allInvocations.slice(0, -2);
      const recent = allInvocations.slice(-2);
      const baselineAvg = baseline.reduce((s, v) => s + v, 0) / baseline.length;
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;

      if (baselineAvg > 0 && recentAvg > baselineAvg * config.thresholds.functionSpikeMultiplier) {
        const lp = recentPoints[recentPoints.length - 1];
        anomalies.push({
          resource_id: resourceId,
          anomaly_score: Math.min(0.98, 0.75 + (recentAvg / baselineAvg) * 0.02),
          is_anomaly: true,
          anomaly_type: "runaway_function",
          contributing_factors: [`invocations: ${recentAvg.toFixed(0)} (baseline: ${baselineAvg.toFixed(0)}, ${(recentAvg / baselineAvg).toFixed(1)}x)`],
          latest_metrics: { cpu_utilization: lp.cpu_utilization, invocation_count: lp.invocation_count, network_in: lp.network_in, network_out: lp.network_out, estimated_hourly_cost: lp.estimated_hourly_cost },
        });
      }
    }
  }

  if (anomalies.length > 0) {
    console.log(`[Anomaly] Rule-based fallback detected ${anomalies.length} anomalies`);
  }

  return anomalies;
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
        `Cloud Function ${anomaly.resource_id} invocation spike — ${anomaly.latest_metrics.invocation_count?.toFixed(0)} invocations`
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
