import { connectDB } from "./db";
import { Metric } from "./models/Metric";
import { Resource } from "./models/Resource";

async function seed() {
  await connectDB();
  console.log("[Seed] Inserting test data...");

  await Resource.create([
    {
      resource_id: "1234567890123",
      resource_type: "compute",
      name: "cost-intel-demo-vm",
      status: "RUNNING",
      hourly_cost: 0.0076,
      metadata: { machineType: "f1-micro", zone: "us-central1-a" },
    },
    {
      resource_id: "cost-intel-demo-function",
      resource_type: "cloud_function",
      name: "cost-intel-demo-function",
      status: "active",
      hourly_cost: 0,
      metadata: { runtime: "nodejs18", maxInstanceCount: 1000 },
    },
    {
      resource_id: "9876543210987",
      resource_type: "disk",
      name: "cost-intel-orphan-disk",
      status: "unattached",
      hourly_cost: 0.00055,
      metadata: { sizeGb: 10, diskType: "pd-standard", zone: "us-central1-a" },
    },
  ]);

  const now = Date.now();
  const minutes = (m: number) => new Date(now - m * 60 * 1000);

  await Metric.insertMany([
    { time: minutes(120), resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: 45.2, unit: "Percent" },
    { time: minutes(90),  resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: 38.7, unit: "Percent" },
    { time: minutes(60),  resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: 12.1, unit: "Percent" },
    { time: minutes(30),  resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: 3.2, unit: "Percent" },
    { time: minutes(25),  resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: 2.8, unit: "Percent" },
    { time: minutes(20),  resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: 1.9, unit: "Percent" },
    { time: minutes(15),  resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: 2.1, unit: "Percent" },
    { time: minutes(10),  resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: 1.5, unit: "Percent" },
    { time: minutes(5),   resource_id: "1234567890123", resource_type: "compute", metric_name: "cpuutilization", value: 1.2, unit: "Percent" },

    { time: minutes(120), resource_id: "cost-intel-demo-function", resource_type: "cloud_function", metric_name: "invocations", value: 10, unit: "Count" },
    { time: minutes(90),  resource_id: "cost-intel-demo-function", resource_type: "cloud_function", metric_name: "invocations", value: 12, unit: "Count" },
    { time: minutes(60),  resource_id: "cost-intel-demo-function", resource_type: "cloud_function", metric_name: "invocations", value: 8, unit: "Count" },
    { time: minutes(30),  resource_id: "cost-intel-demo-function", resource_type: "cloud_function", metric_name: "invocations", value: 150, unit: "Count" },
    { time: minutes(25),  resource_id: "cost-intel-demo-function", resource_type: "cloud_function", metric_name: "invocations", value: 200, unit: "Count" },
    { time: minutes(20),  resource_id: "cost-intel-demo-function", resource_type: "cloud_function", metric_name: "invocations", value: 180, unit: "Count" },
  ]);

  console.log("[Seed] Done — 3 resources, 15 metric data points");
  process.exit(0);
}

seed();
