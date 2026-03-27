import dotenv from "dotenv";

dotenv.config();

const hasGcpCreds =
  !!process.env.GCP_PROJECT_ID &&
  !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

export const config = {
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || "",
    zone: process.env.GCP_ZONE || "us-central1-a",
    region: process.env.GCP_REGION || "us-central1",
    keyFilePath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    billingAccountId: process.env.GCP_BILLING_ACCOUNT_ID || "",
  },
  db: {
    url: process.env.MONGODB_URI || "mongodb://localhost:27017/costintel",
  },
  ml: {
    url: process.env.ML_SERVICE_URL || "http://localhost:5001",
  },
  thresholds: {
    idleCpuPercent: Number(process.env.IDLE_CPU_THRESHOLD) || 5,
    idleDurationMinutes: Number(process.env.IDLE_DURATION_MINUTES) || 30,
    functionSpikeMultiplier: Number(process.env.FUNCTION_SPIKE_MULTIPLIER) || 10,
    anomalyScoreThreshold: Number(process.env.ANOMALY_SCORE_THRESHOLD) || 0.7,
    maxFunctionInstances: Number(process.env.MAX_FUNCTION_INSTANCES) || 5,
  },
  server: {
    port: Number(process.env.PORT) || 4000,
    wsPort: Number(process.env.WS_PORT) || 4001,
  },
  dryRun: process.env.DRY_RUN === "true",
  simulationMode: process.env.SIMULATION_MODE === "true" || !hasGcpCreds,
  cronSchedule: process.env.CRON_SCHEDULE || "*/5 * * * *",
};

// Only initialize GCP clients when we have real credentials
export let computeInstances: any = null;
export let computeDisks: any = null;
export let computeZoneOps: any = null;
export let monitoring: any = null;
export let billing: any = null;
export let functionsClient: any = null;
export let storage: any = null;

if (hasGcpCreds) {
  const compute = require("@google-cloud/compute");
  const mon = require("@google-cloud/monitoring");
  const bill = require("@google-cloud/billing");
  const fns = require("@google-cloud/functions");
  const gcs = require("@google-cloud/storage");

  computeInstances = new compute.InstancesClient();
  computeDisks = new compute.DisksClient();
  computeZoneOps = new compute.ZoneOperationsClient();
  monitoring = new mon.MetricServiceClient();
  billing = new bill.CloudBillingClient();
  functionsClient = new fns.CloudFunctionsServiceClient();
  storage = new gcs.Storage();
}
