import path from "path";
import dotenv from "dotenv";
import { InstancesClient, DisksClient, ZoneOperationsClient } from "@google-cloud/compute";
import { MetricServiceClient } from "@google-cloud/monitoring";
import { CloudBillingClient } from "@google-cloud/billing";
import { CloudFunctionsServiceClient } from "@google-cloud/functions";
import { Storage } from "@google-cloud/storage";

const cwd = process.cwd();
// Base secrets shared across modes (optional).
dotenv.config({ path: path.join(cwd, ".env") });
// Match common Vite-style layout: only .env.development / .env.production is fine.
const nodeEnv = process.env.NODE_ENV || "development";
const mode = nodeEnv === "production" ? "production" : "development";
dotenv.config({ path: path.join(cwd, `.env.${mode}`), override: true });

export const config = {
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || "",
    zone: process.env.GCP_ZONE || "us-central1-a",
    region: process.env.GCP_REGION || "us-central1",
    keyFilePath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    billingAccountId: process.env.GCP_BILLING_ACCOUNT_ID || "",
  },
  db: {
    url: process.env.MONGODB_URI || "mongodb://localhost:27017/cloudsnip",
  },
  ml: {
    url: process.env.ML_SERVICE_URL || "http://localhost:5001",
  },
  thresholds: {
    idleCpuPercent: Number(process.env.IDLE_CPU_THRESHOLD) || 5,
    idleDurationMinutes: Number(process.env.IDLE_DURATION_MINUTES) || 30,
    functionSpikeMultiplier: Number(process.env.FUNCTION_SPIKE_MULTIPLIER) || 10,
    anomalyScoreThreshold: Number(process.env.ANOMALY_SCORE_THRESHOLD) || 0.6,
    maxFunctionInstances: Number(process.env.MAX_FUNCTION_INSTANCES) || 5,
  },
  server: {
    port: Number(process.env.PORT) || 4000,
  },
  dryRun: process.env.DRY_RUN === "true",
  cronSchedule: process.env.CRON_SCHEDULE || "*/5 * * * *",
};

// GCP clients use Application Default Credentials: GOOGLE_APPLICATION_CREDENTIALS (JSON key) if set,
// else credentials from `gcloud auth application-default login`
export const computeInstances = new InstancesClient();
export const computeDisks = new DisksClient();
export const computeZoneOps = new ZoneOperationsClient();
export const monitoring = new MetricServiceClient();
export const billing = new CloudBillingClient();
export const functionsClient = new CloudFunctionsServiceClient();
export const storage = new Storage();
