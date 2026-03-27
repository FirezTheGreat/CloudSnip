import dotenv from "dotenv";
import { InstancesClient, DisksClient, ZoneOperationsClient } from "@google-cloud/compute";
import { MetricServiceClient } from "@google-cloud/monitoring";
import { CloudBillingClient } from "@google-cloud/billing";
import { CloudFunctionsServiceClient } from "@google-cloud/functions";
import { Storage } from "@google-cloud/storage";

dotenv.config();

export const config = {
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || "",
    zone: process.env.GCP_ZONE || "us-central1-a",
    region: process.env.GCP_REGION || "us-central1",
    keyFilePath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    billingAccountId: process.env.GCP_BILLING_ACCOUNT_ID || "",
  },
  db: {
    url: process.env.DATABASE_URL || "postgresql://costintel:password@localhost:5432/costintel",
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
  cronSchedule: process.env.CRON_SCHEDULE || "*/5 * * * *",
};

// GCP clients authenticate via GOOGLE_APPLICATION_CREDENTIALS env var (service account JSON key)
export const computeInstances = new InstancesClient();
export const computeDisks = new DisksClient();
export const computeZoneOps = new ZoneOperationsClient();
export const monitoring = new MetricServiceClient();
export const billing = new CloudBillingClient();
export const functionsClient = new CloudFunctionsServiceClient();
export const storage = new Storage();
