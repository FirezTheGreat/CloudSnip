import { config } from "../config";
import { query } from "../db";

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
  const metricsResult = await query(`
    SELECT
      resource_id,
      MAX(CASE WHEN metric_name = 'cpuutilization' THEN value ELSE 0 END) AS cpu_utilization,
      MAX(CASE WHEN metric_name = 'invocations' THEN value ELSE 0 END) AS invocation_count,
      MAX(CASE WHEN metric_name = 'networkin' THEN value ELSE 0 END) AS network_in,
      MAX(CASE WHEN metric_name = 'networkout' THEN value ELSE 0 END) AS network_out,
      COALESCE(
        (SELECT hourly_cost FROM resources WHERE resources.resource_id = metrics.resource_id LIMIT 1),
        0
      ) AS estimated_hourly_cost,
      time AS timestamp
    FROM metrics
    WHERE time > NOW() - INTERVAL '2 hours'
    GROUP BY resource_id, time
    ORDER BY resource_id, time
  `);

  if (metricsResult.rows.length < 10) {
    console.log(`[Anomaly] Not enough data points (${metricsResult.rows.length}) — need at least 10`);
    return [];
  }

  const payload = {
    metrics: metricsResult.rows.map((row) => ({
      resource_id: row.resource_id,
      timestamp: row.timestamp,
      cpu_utilization: parseFloat(row.cpu_utilization) || 0,
      invocation_count: parseFloat(row.invocation_count) || 0,
      network_in: parseFloat(row.network_in) || 0,
      network_out: parseFloat(row.network_out) || 0,
      estimated_hourly_cost: parseFloat(row.estimated_hourly_cost) || 0,
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

      const resourceTypeResult = await query(
        `SELECT resource_type FROM resources WHERE resource_id = $1 LIMIT 1`,
        [anomaly.resource_id]
      );
      const resourceType = resourceTypeResult.rows[0]?.resource_type || "unknown";

      await query(
        `INSERT INTO anomalies (resource_id, resource_type, anomaly_type, severity, anomaly_score, metric_snapshot, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          anomaly.resource_id,
          resourceType,
          anomaly.anomaly_type,
          severity,
          anomaly.anomaly_score,
          JSON.stringify(anomaly.latest_metrics),
          description,
        ]
      );

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
        `Instance ${anomaly.resource_id} is idle — CPU at ${anomaly.latest_metrics.cpu_utilization?.toFixed(1)}%`
      );
      break;
    case "runaway_function":
      parts.push(
        `Lambda ${anomaly.resource_id} invocation spike — ${anomaly.latest_metrics.invocation_count} invocations`
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
