import { connectDB } from "./db";
import { Metric } from "./models/Metric";
import { Resource } from "./models/Resource";
import { Budget } from "./models/Budget";
import { CostSummary } from "./models/CostSummary";
import { Anomaly } from "./models/Anomaly";

async function seed() {
  await connectDB();
  console.log("[Seed] Clearing old data...");
  await Promise.all([
    Resource.deleteMany({}),
    Metric.deleteMany({}),
    Budget.deleteMany({}),
    CostSummary.deleteMany({}),
    Anomaly.deleteMany({}),
  ]);

  console.log("[Seed] Inserting realistic demo data...");

  await Resource.create([
    {
      resource_id: "1234567890123",
      resource_type: "compute",
      name: "cloudsnip-demo-vm",
      status: "RUNNING",
      hourly_cost: 0.0076,
      metadata: { machineType: "f1-micro", zone: "us-central1-a", labels: { env: "demo", team: "engineering" } },
    },
    {
      resource_id: "2345678901234",
      resource_type: "compute",
      name: "cloudsnip-api-server",
      status: "RUNNING",
      hourly_cost: 0.03351,
      metadata: { machineType: "e2-medium", zone: "us-central1-a", labels: { env: "production", team: "backend" } },
    },
    {
      resource_id: "cloudsnip-demo-function",
      resource_type: "cloud_function",
      name: "cloudsnip-demo-function",
      status: "active",
      hourly_cost: 0,
      metadata: { runtime: "nodejs24", maxInstanceCount: 240, labels: { env: "demo" } },
    },
    {
      resource_id: "cloudsnip-webhook-fn",
      resource_type: "cloud_function",
      name: "cloudsnip-webhook-fn",
      status: "active",
      hourly_cost: 0,
      metadata: { runtime: "python312", maxInstanceCount: 10, labels: { env: "production", team: "integrations" } },
    },
    {
      resource_id: "9876543210987",
      resource_type: "disk",
      name: "cloudsnip-orphan-disk",
      status: "unattached",
      hourly_cost: 0.00055,
      metadata: { sizeGb: 10, diskType: "pd-standard", zone: "us-central1-a" },
    },
    {
      resource_id: "8765432109876",
      resource_type: "disk",
      name: "cloudsnip-boot-disk",
      status: "attached",
      hourly_cost: 0.00137,
      metadata: { sizeGb: 25, diskType: "pd-balanced", zone: "us-central1-a", labels: { env: "production" } },
    },
    {
      resource_id: "cloudsnip-data-bucket",
      resource_type: "gcs",
      name: "cloudsnip-data-bucket",
      status: "active",
      hourly_cost: 0,
      metadata: { location: "US", storageClass: "STANDARD", labels: { team: "data" } },
    },
  ]);

  const now = Date.now();
  const minutes = (m: number) => new Date(now - m * 60 * 1000);

  const metrics: any[] = [];

  for (let i = 0; i < 48; i++) {
    const t = minutes(i * 30);
    const phase = i < 20 ? "normal" : i < 35 ? "idle" : "spike";

    let cpu: number;
    if (phase === "normal") cpu = 25 + Math.random() * 30;
    else if (phase === "idle") cpu = 1 + Math.random() * 3;
    else cpu = 60 + Math.random() * 30;

    metrics.push(
      { time: t, resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: Number(cpu.toFixed(1)), unit: "Percent" },
      { time: t, resource_id: "1234567890123", resource_type: "compute", metric_name: "networkin", value: Math.floor(Math.random() * 50000), unit: "Bytes" },
      { time: t, resource_id: "1234567890123", resource_type: "compute", metric_name: "networkout", value: Math.floor(Math.random() * 30000), unit: "Bytes" },
      { time: t, resource_id: "1234567890123", resource_type: "compute", metric_name: "estimated_cost", value: 0.0076, unit: "USD/hr" },
    );

    const cpu2 = 30 + Math.random() * 20;
    metrics.push(
      { time: t, resource_id: "2345678901234", resource_type: "compute", metric_name: "cpuutilization", value: Number(cpu2.toFixed(1)), unit: "Percent" },
      { time: t, resource_id: "2345678901234", resource_type: "compute", metric_name: "estimated_cost", value: 0.03351, unit: "USD/hr" },
    );

    let invocations: number;
    if (phase === "spike") invocations = 500 + Math.floor(Math.random() * 300);
    else invocations = 5 + Math.floor(Math.random() * 15);

    metrics.push(
      { time: t, resource_id: "cloudsnip-demo-function", resource_type: "cloud_function", metric_name: "invocations", value: invocations, unit: "Count" },
      { time: t, resource_id: "cloudsnip-demo-function", resource_type: "cloud_function", metric_name: "duration", value: 100 + Math.random() * 200, unit: "ms" },
    );

    metrics.push(
      { time: t, resource_id: "cloudsnip-webhook-fn", resource_type: "cloud_function", metric_name: "invocations", value: 2 + Math.floor(Math.random() * 5), unit: "Count" },
    );

    metrics.push(
      { time: t, resource_id: "9876543210987", resource_type: "disk", metric_name: "estimated_cost", value: 0.00055, unit: "USD/hr" },
    );

    const fleetHourly = 0.0076 + 0.03351 + 0.00055 + 0.00137;
    metrics.push({
      time: t,
      resource_id: "_fleet",
      resource_type: "fleet",
      metric_name: "estimated_cost",
      value: fleetHourly,
      unit: "USD/hr",
    });
  }

  await Metric.insertMany(metrics);

  const at = (daysAgo: number, h = 14, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d;
  };

  await Anomaly.insertMany([
    {
      detected_at: at(4, 9),
      resource_id: "1234567890123",
      resource_type: "compute",
      anomaly_type: "idle_instance",
      severity: "medium",
      anomaly_score: 0.72,
      description: "[Seed] Demo anomaly — idle CPU pattern",
      resolved: true,
      resolved_at: at(3, 16),
      resolved_by: "stop_instance",
    },
    {
      detected_at: at(1, 11),
      resource_id: "cloudsnip-demo-function",
      resource_type: "cloud_function",
      anomaly_type: "runaway_function",
      severity: "high",
      anomaly_score: 0.84,
      description: "[Seed] Demo anomaly — invocation spike",
      resolved: true,
      resolved_at: at(1, 18),
      resolved_by: "cap_instances",
    },
    {
      detected_at: at(0, 8),
      resource_id: "2345678901234",
      resource_type: "compute",
      anomaly_type: "cost_spike",
      severity: "low",
      anomaly_score: 0.62,
      description: "[Seed] Open anomaly for dashboard",
      resolved: false,
    },
  ]);

  await Budget.create([
    {
      name: "Overall Monthly",
      resource_type: "all",
      monthly_limit: 50,
      alert_thresholds: [50, 80, 100],
      current_spend: 0,
    },
    {
      name: "Compute Limit",
      resource_type: "compute",
      monthly_limit: 30,
      alert_thresholds: [50, 80, 100],
      current_spend: 0,
    },
  ]);

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  await CostSummary.create([
    { time: dayStart, service: "Compute Engine", total_cost: 0.0076 * 24 + 0.03351 * 24, resource_count: 2 },
    { time: dayStart, service: "Persistent Disk", total_cost: 0.00055 * 24 + 0.00137 * 24, resource_count: 2 },
    { time: dayStart, service: "Cloud Storage", total_cost: 0, resource_count: 1 },
  ]);

  console.log(`[Seed] Done — 7 resources, ${metrics.length} metrics, 3 sample anomalies, 2 budgets, 3 cost summaries`);
  process.exit(0);
}

seed();
