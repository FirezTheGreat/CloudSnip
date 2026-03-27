import {
  GetMetricDataCommand,
  type MetricDataQuery,
} from "@aws-sdk/client-cloudwatch";
import { cloudwatch } from "../config";
import { query } from "../db";

interface MetricSpec {
  namespace: string;
  metricName: string;
  dimensionName: string;
  dimensionValue: string;
  resourceType: string;
  resourceId: string;
  unit: string;
  stat: string;
}

export async function collectCloudWatchMetrics(specs: MetricSpec[]) {
  if (specs.length === 0) return [];

  const now = new Date();
  const start = new Date(now.getTime() - 10 * 60 * 1000); // last 10 minutes

  const queries: MetricDataQuery[] = specs.map((s, i) => ({
    Id: `m${i}`,
    MetricStat: {
      Metric: {
        Namespace: s.namespace,
        MetricName: s.metricName,
        Dimensions: [{ Name: s.dimensionName, Value: s.dimensionValue }],
      },
      Period: 300, // 5-minute granularity
      Stat: s.stat,
    },
  }));

  try {
    const cmd = new GetMetricDataCommand({
      MetricDataQueries: queries,
      StartTime: start,
      EndTime: now,
    });

    const response = await cloudwatch.send(cmd);
    const results: any[] = [];

    for (let i = 0; i < specs.length; i++) {
      const resultData = response.MetricDataResults?.[i];
      if (!resultData?.Values?.length) continue;

      const value = resultData.Values[0];
      const timestamp = resultData.Timestamps?.[0] || now;

      await query(
        `INSERT INTO metrics (time, resource_id, resource_type, metric_name, value, unit)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [timestamp, specs[i].resourceId, specs[i].resourceType,
         specs[i].metricName.toLowerCase(), value, specs[i].unit]
      );

      results.push({
        resourceId: specs[i].resourceId,
        resourceType: specs[i].resourceType,
        metricName: specs[i].metricName,
        value,
        timestamp,
      });
    }

    console.log(`[CloudWatch] Collected ${results.length} metrics from ${specs.length} queries`);
    return results;
  } catch (err: any) {
    console.error("[CloudWatch] Error collecting metrics:", err.message);
    return [];
  }
}

export async function collectEC2Metrics(instanceIds: string[]) {
  const specs: MetricSpec[] = [];

  for (const id of instanceIds) {
    specs.push({
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
      dimensionName: "InstanceId",
      dimensionValue: id,
      resourceType: "ec2",
      resourceId: id,
      unit: "Percent",
      stat: "Average",
    });
    specs.push({
      namespace: "AWS/EC2",
      metricName: "NetworkIn",
      dimensionName: "InstanceId",
      dimensionValue: id,
      resourceType: "ec2",
      resourceId: id,
      unit: "Bytes",
      stat: "Sum",
    });
    specs.push({
      namespace: "AWS/EC2",
      metricName: "NetworkOut",
      dimensionName: "InstanceId",
      dimensionValue: id,
      resourceType: "ec2",
      resourceId: id,
      unit: "Bytes",
      stat: "Sum",
    });
  }

  return collectCloudWatchMetrics(specs);
}

export async function collectLambdaMetrics(functionNames: string[]) {
  const specs: MetricSpec[] = [];

  for (const name of functionNames) {
    specs.push({
      namespace: "AWS/Lambda",
      metricName: "Invocations",
      dimensionName: "FunctionName",
      dimensionValue: name,
      resourceType: "lambda",
      resourceId: name,
      unit: "Count",
      stat: "Sum",
    });
    specs.push({
      namespace: "AWS/Lambda",
      metricName: "Duration",
      dimensionName: "FunctionName",
      dimensionValue: name,
      resourceType: "lambda",
      resourceId: name,
      unit: "Milliseconds",
      stat: "Average",
    });
    specs.push({
      namespace: "AWS/Lambda",
      metricName: "Errors",
      dimensionName: "FunctionName",
      dimensionValue: name,
      resourceType: "lambda",
      resourceId: name,
      unit: "Count",
      stat: "Sum",
    });
  }

  return collectCloudWatchMetrics(specs);
}
