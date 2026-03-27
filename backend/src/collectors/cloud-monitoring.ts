import { monitoring, config } from "../config";
import { query } from "../db";

const projectPath = () => `projects/${config.gcp.projectId}`;

export async function collectComputeMetrics(instanceIds: string[]) {
  if (instanceIds.length === 0) return [];

  const now = new Date();
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);

  const results: any[] = [];

  const metricTypes = [
    { type: "compute.googleapis.com/instance/cpu/utilization", name: "cpuutilization", unit: "Percent", scale: 100 },
    { type: "compute.googleapis.com/instance/network/received_bytes_count", name: "networkin", unit: "Bytes", scale: 1 },
    { type: "compute.googleapis.com/instance/network/sent_bytes_count", name: "networkout", unit: "Bytes", scale: 1 },
  ];

  for (const metric of metricTypes) {
    const instanceFilter = instanceIds.map((id) => `resource.labels.instance_id = "${id}"`).join(" OR ");

    const request = {
      name: projectPath(),
      filter: `metric.type = "${metric.type}" AND (${instanceFilter})`,
      interval: {
        startTime: { seconds: Math.floor(tenMinAgo.getTime() / 1000) },
        endTime: { seconds: Math.floor(now.getTime() / 1000) },
      },
      aggregation: {
        alignmentPeriod: { seconds: 300 },
        perSeriesAligner: 1, // ALIGN_MEAN
      },
    };

    try {
      const [timeSeries] = await monitoring.listTimeSeries(request);

      for (const series of timeSeries || []) {
        const instanceId = series.resource?.labels?.instance_id || "";
        for (const point of series.points || []) {
          const value = (point.value?.doubleValue ?? point.value?.int64Value ?? 0) as number;
          const timestamp = new Date(Number(point.interval?.endTime?.seconds || 0) * 1000);

          await query(
            `INSERT INTO metrics (time, resource_id, resource_type, metric_name, value, unit)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [timestamp, instanceId, "compute", metric.name, value * metric.scale, metric.unit]
          );

          results.push({
            resourceId: instanceId,
            resourceType: "compute",
            metricName: metric.name,
            value: value * metric.scale,
            timestamp,
          });
        }
      }
    } catch (err: any) {
      console.error(`[CloudMonitoring] Error fetching ${metric.type}:`, err.message);
    }
  }

  console.log(`[CloudMonitoring] Collected ${results.length} Compute Engine metrics`);
  return results;
}

export async function collectFunctionMetrics(functionNames: string[]) {
  if (functionNames.length === 0) return [];

  const now = new Date();
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);

  const results: any[] = [];

  const metricTypes = [
    { type: "cloudfunctions.googleapis.com/function/execution_count", name: "invocations", unit: "Count", scale: 1 },
    { type: "cloudfunctions.googleapis.com/function/execution_times", name: "duration", unit: "Nanoseconds", scale: 0.000001 }, // ns to ms
    { type: "cloudfunctions.googleapis.com/function/user_memory_bytes", name: "memory_usage", unit: "Bytes", scale: 1 },
  ];

  for (const metric of metricTypes) {
    const fnFilter = functionNames.map((n) => `resource.labels.function_name = "${n}"`).join(" OR ");

    const request = {
      name: projectPath(),
      filter: `metric.type = "${metric.type}" AND (${fnFilter})`,
      interval: {
        startTime: { seconds: Math.floor(tenMinAgo.getTime() / 1000) },
        endTime: { seconds: Math.floor(now.getTime() / 1000) },
      },
      aggregation: {
        alignmentPeriod: { seconds: 300 },
        perSeriesAligner: metric.name === "invocations" ? 3 : 1, // ALIGN_SUM for counts, ALIGN_MEAN otherwise
      },
    };

    try {
      const [timeSeries] = await monitoring.listTimeSeries(request);

      for (const series of timeSeries || []) {
        const functionName = series.resource?.labels?.function_name || "";
        for (const point of series.points || []) {
          const rawValue = (point.value?.doubleValue ?? point.value?.int64Value ?? point.value?.distributionValue?.mean ?? 0) as number;
          const value = rawValue * metric.scale;
          const timestamp = new Date(Number(point.interval?.endTime?.seconds || 0) * 1000);

          await query(
            `INSERT INTO metrics (time, resource_id, resource_type, metric_name, value, unit)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [timestamp, functionName, "cloud_function", metric.name, value, metric.unit]
          );

          results.push({
            resourceId: functionName,
            resourceType: "cloud_function",
            metricName: metric.name,
            value,
            timestamp,
          });
        }
      }
    } catch (err: any) {
      console.error(`[CloudMonitoring] Error fetching ${metric.type}:`, err.message);
    }
  }

  console.log(`[CloudMonitoring] Collected ${results.length} Cloud Functions metrics`);
  return results;
}
