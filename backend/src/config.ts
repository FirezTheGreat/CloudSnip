import dotenv from "dotenv";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { CostExplorerClient } from "@aws-sdk/client-cost-explorer";
import { EC2Client } from "@aws-sdk/client-ec2";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";

dotenv.config();

export const config = {
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
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
    lambdaSpikeMultiplier: Number(process.env.LAMBDA_SPIKE_MULTIPLIER) || 10,
    anomalyScoreThreshold: Number(process.env.ANOMALY_SCORE_THRESHOLD) || 0.7,
    maxLambdaConcurrency: Number(process.env.MAX_LAMBDA_CONCURRENCY) || 5,
  },
  server: {
    port: Number(process.env.PORT) || 4000,
    wsPort: Number(process.env.WS_PORT) || 4001,
  },
  dryRun: process.env.DRY_RUN === "true",
  cronSchedule: process.env.CRON_SCHEDULE || "*/5 * * * *",
};

const awsConfig = {
  region: config.aws.region,
  ...(config.aws.accessKeyId && {
    credentials: {
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
    },
  }),
};

export const cloudwatch = new CloudWatchClient(awsConfig);
export const costExplorer = new CostExplorerClient({
  ...awsConfig,
  region: "us-east-1", // Cost Explorer only works in us-east-1
});
export const ec2 = new EC2Client(awsConfig);
export const lambdaClient = new LambdaClient(awsConfig);
export const s3 = new S3Client(awsConfig);
