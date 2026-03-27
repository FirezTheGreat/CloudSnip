# Cloud Cost Intelligence System

A real-time cloud cost monitoring, anomaly detection, and auto-optimization platform that connects to live AWS resources, detects genuine cost anomalies using ML, and autonomously executes safe optimizations via cloud APIs.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         REACT DASHBOARD (:3000)                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────────────┐   │
│  │ Cost Trends  │  │ Anomaly Feed     │  │ Savings Tracker         │   │
│  │ (Recharts)   │  │ (WebSocket live) │  │ (Before/After deltas)  │   │
│  └──────┬───────┘  └────────┬─────────┘  └────────────┬────────────┘   │
│         │                   │                          │               │
│         └───────────────────┴──────────────────────────┘               │
│                             │ REST + WebSocket                         │
└─────────────────────────────┼──────────────────────────────────────────┘
                              │
┌─────────────────────────────┼──────────────────────────────────────────┐
│                    EXPRESS BACKEND (:4000)                              │
│  ┌──────────────┐  ┌───────┴────────┐  ┌──────────────────────────┐   │
│  │ Telemetry    │  │ API Routes     │  │ Auto-Optimizer           │   │
│  │ Collector    │  │ /api/costs     │  │ (stop EC2, cap Lambda,   │   │
│  │ (node-cron   │  │ /api/anomalies │  │  delete volumes, tag)    │   │
│  │  every 5min) │  │ /api/actions   │  │                          │   │
│  └──────┬───────┘  └────────────────┘  └────────────┬─────────────┘   │
│         │                                            │                 │
│         │  AWS SDK v3                                │  AWS SDK v3     │
│         ▼                                            ▼                 │
│  ┌──────────────┐                           ┌──────────────────────┐   │
│  │ CloudWatch   │                           │ EC2 / Lambda / S3    │   │
│  │ Cost Explorer│                           │ stop / limit / clean │   │
│  └──────┬───────┘                           └──────────────────────┘   │
│         │                                                              │
│         ▼                                                              │
│  ┌──────────────────────────────────────────────────┐                  │
│  │             TimescaleDB (:5432)                   │                  │
│  │  metrics | anomalies | actions | savings          │                  │
│  └──────────────────────┬───────────────────────────┘                  │
│                         │  HTTP POST /detect                           │
│                         ▼                                              │
│  ┌──────────────────────────────────────────────────┐                  │
│  │         PYTHON ML SERVICE (:5001)                 │                  │
│  │  Flask + scikit-learn (Isolation Forest)           │                  │
│  │  One route: POST /detect → anomaly scores         │                  │
│  └──────────────────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
cloud-cost-intelligence/
├── README.md                          # This file
├── docs/
│   ├── ARCHITECTURE.md                # Detailed architecture decisions
│   ├── AWS_SETUP.md                   # Step-by-step AWS provisioning guide
│   ├── DATABASE_SCHEMA.md             # Full schema documentation
│   └── DEMO_PLAYBOOK.md              # How to trigger & demo anomalies
│
├── docker-compose.yml                 # TimescaleDB + ML service
│
├── backend/                           # Express + TypeScript
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts                   # Express server + WebSocket setup
│       ├── config.ts                  # Env vars, AWS config, thresholds
│       ├── db.ts                      # TimescaleDB connection (pg pool)
│       │
│       ├── collectors/                # Telemetry pipeline
│       │   ├── cloudwatch.ts          # CPU, network, Lambda metrics
│       │   ├── cost-explorer.ts       # Daily/hourly cost per service
│       │   └── resource-inventory.ts  # List EC2, Lambda, EBS, S3
│       │
│       ├── scheduler.ts              # node-cron: poll every 5 min
│       │
│       ├── anomaly/
│       │   └── client.ts             # HTTP client to Python ML service
│       │
│       ├── optimizer/                 # Autonomous actions
│       │   ├── engine.ts             # Decision logic: which action to take
│       │   ├── actions/
│       │   │   ├── stop-idle-ec2.ts
│       │   │   ├── cap-lambda.ts
│       │   │   ├── cleanup-volumes.ts
│       │   │   └── tag-resources.ts
│       │   └── audit.ts             # Before/after cost logging
│       │
│       ├── routes/                   # REST API
│       │   ├── costs.ts
│       │   ├── anomalies.ts
│       │   ├── actions.ts
│       │   └── dashboard.ts
│       │
│       └── websocket.ts             # Push anomalies + actions to frontend
│
├── ml-service/                       # Python anomaly detection
│   ├── requirements.txt
│   ├── Dockerfile
│   └── app.py                        # Flask + Isolation Forest (~50 lines)
│
└── dashboard/                        # React + Recharts
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── App.tsx
        ├── hooks/
        │   ├── useWebSocket.ts       # Live anomaly feed
        │   └── useCostData.ts        # REST polling for charts
        ├── components/
        │   ├── CostTrendChart.tsx     # Recharts LineChart
        │   ├── AnomalyFeed.tsx       # Live cards
        │   ├── SavingsTracker.tsx     # Before/after bar chart
        │   ├── ResourceTable.tsx     # Current resource status
        │   └── ActionLog.tsx         # Audit trail of optimizations
        └── types/
            └── index.ts              # Shared TypeScript types
```

---

## Tech Stack Decisions & Rationale

### Why Express + TypeScript (not FastAPI)?
You know TypeScript. The AWS SDK v3 is JavaScript-native. You'll be writing cloud API calls, cron jobs, and REST routes — all of which are natural in Express. Zero context switching except for the 50-line Python ML service.

### Why TimescaleDB (not InfluxDB/Prometheus)?
- It's just PostgreSQL with a time-series extension — you already know SQL
- Free, runs in Docker, zero learning curve
- `time_bucket()` function gives you 5-min / 1-hour / 1-day aggregations in one SQL query
- You can JOIN metrics with anomalies and actions — try doing that in InfluxDB

### Why Isolation Forest (not Prophet)?
- Prophet needs 2+ seasons of data (weeks/months) to work. You have hours. Non-starter for a hackathon.
- Isolation Forest works on **any** dataset size, even 50 rows. It finds outliers by randomly partitioning data — anomalies are isolated faster (fewer splits) than normal points.
- scikit-learn's `IsolationForest` is 3 lines of code. No tuning needed.

### Why a separate Python microservice (not running Python in Node)?
- Clean separation: your Node app sends metrics, gets scores back
- If the ML service crashes, your backend keeps running
- Judges see "microservice architecture" on your diagram — bonus points
- You never need to debug Python, you just call an HTTP endpoint

---

## Data Flow — Minute by Minute

```
Every 5 minutes (node-cron):
  1. Collector pulls CloudWatch metrics (CPU, invocations, network)
  2. Collector pulls Cost Explorer data (spend per service)
  3. Collector lists resources (EC2 instances, Lambdas, EBS volumes)
  4. All data written to TimescaleDB `metrics` table
  5. Last 2 hours of metrics sent to ML service POST /detect
  6. ML service returns anomaly scores per metric
  7. Scores above threshold → written to `anomalies` table
  8. Anomaly triggers optimizer engine:
     - Idle EC2 (CPU < 5% for 30 min)  → stop instance
     - Runaway Lambda (invocations spike 10x) → cap concurrency
     - Unattached EBS volume (no attachments) → delete
     - Untagged resource → tag with "needs-review"
  9. Before/after cost delta written to `actions` table
  10. WebSocket pushes anomaly + action to dashboard
```

---

## Database Tables (TimescaleDB)

### `metrics` — raw telemetry (hypertable, partitioned by time)
| Column | Type | Description |
|--------|------|-------------|
| time | TIMESTAMPTZ | When the metric was collected |
| resource_id | TEXT | AWS resource ID (i-xxx, arn:xxx) |
| resource_type | TEXT | ec2, lambda, s3, ebs, rds |
| metric_name | TEXT | cpu_utilization, invocation_count, estimated_cost, etc. |
| value | DOUBLE PRECISION | The metric value |
| region | TEXT | us-east-1, etc. |

### `anomalies` — detected anomalies
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| detected_at | TIMESTAMPTZ | When detected |
| resource_id | TEXT | Which resource |
| resource_type | TEXT | ec2, lambda, etc. |
| anomaly_type | TEXT | idle_instance, cost_spike, runaway_function, unused_volume |
| severity | TEXT | low, medium, high, critical |
| anomaly_score | DOUBLE PRECISION | ML confidence (0-1) |
| metric_snapshot | JSONB | The metrics that triggered detection |
| resolved | BOOLEAN | Has it been acted on? |
| resolved_at | TIMESTAMPTZ | When was it resolved? |

### `actions` — optimization audit trail
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| executed_at | TIMESTAMPTZ | When the action ran |
| anomaly_id | UUID | FK to anomalies |
| resource_id | TEXT | Which resource |
| action_type | TEXT | stop_instance, cap_concurrency, delete_volume, tag_resource |
| status | TEXT | pending, executing, success, failed, rolled_back |
| cost_before | DOUBLE PRECISION | Hourly cost before action |
| cost_after | DOUBLE PRECISION | Hourly cost after action |
| savings_hourly | DOUBLE PRECISION | Delta |
| savings_monthly_projected | DOUBLE PRECISION | Delta × 730 hours |
| details | JSONB | API response, error messages, etc. |

### `cost_summaries` — daily cost rollups (hypertable)
| Column | Type | Description |
|--------|------|-------------|
| time | TIMESTAMPTZ | Day |
| service | TEXT | EC2, Lambda, S3, RDS |
| total_cost | DOUBLE PRECISION | Total spend for the day |
| resource_count | INT | Number of resources |

---

## AWS IAM Policy (Minimum Required)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CostReadAccess",
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "ce:GetCostForecast"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchReadAccess",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricData",
        "cloudwatch:ListMetrics",
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EC2ReadAndManage",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeVolumes",
        "ec2:StopInstances",
        "ec2:DeleteVolume",
        "ec2:CreateTags"
      ],
      "Resource": "*"
    },
    {
      "Sid": "LambdaReadAndManage",
      "Effect": "Allow",
      "Action": [
        "lambda:ListFunctions",
        "lambda:GetFunction",
        "lambda:PutFunctionConcurrency"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3ReadAccess",
      "Effect": "Allow",
      "Action": [
        "s3:ListAllMyBuckets",
        "s3:GetBucketTagging"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## AWS Resources to Provision (Free Tier)

| Resource | Spec | Purpose | Free Tier Limit |
|----------|------|---------|-----------------|
| EC2 instance | t2.micro, Amazon Linux 2 | "Subject" to monitor + detect idle | 750 hrs/month |
| Lambda function | Node.js 18, 128MB, no concurrency cap | "Subject" for runaway detection | 1M requests/month |
| S3 bucket | Standard, empty | "Subject" for cost tracking | 5 GB |
| RDS instance | db.t3.micro, PostgreSQL | "Subject" for cost tracking | 750 hrs/month |
| EBS volume | 8 GB gp2, unattached | "Subject" for cleanup detection | 30 GB total |
| TimescaleDB | Runs on your laptop/EC2 via Docker | Your app's database | N/A (self-hosted) |

---

## Environment Variables

```bash
# AWS credentials (IAM user with policy above)
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1

# TimescaleDB
DATABASE_URL=postgresql://costintel:password@localhost:5432/costintel

# ML Service
ML_SERVICE_URL=http://localhost:5001

# Thresholds (tune these)
IDLE_CPU_THRESHOLD=5          # % — below this = idle
IDLE_DURATION_MINUTES=30      # How long before flagging
LAMBDA_SPIKE_MULTIPLIER=10   # 10x normal invocations = spike
ANOMALY_SCORE_THRESHOLD=0.7  # ML score above this = anomaly
MAX_LAMBDA_CONCURRENCY=5     # Cap to set when limiting

# Server
PORT=4000
WS_PORT=4001
```

---

## Implementation Order — What to Build & When

### Phase 1: Foundation (Hours 0–8)
**Goal: See real AWS numbers in your terminal**

1. Create AWS free tier account + IAM user
2. `docker-compose up` → TimescaleDB running
3. Backend: single file that calls `CloudWatch.getMetricData()` and prints CPU
4. Backend: call `CostExplorer.getCostAndUsage()` and print daily spend
5. Write results to TimescaleDB → query them back
6. **Checkpoint: you can run `SELECT * FROM metrics` and see real data**

### Phase 2: Pipeline + ML (Hours 8–20)
**Goal: Anomalies are being detected automatically**

1. Set up node-cron to poll every 5 minutes
2. Collectors: CloudWatch, Cost Explorer, resource inventory — all writing to DB
3. Python ML service: Flask + Isolation Forest, one POST route
4. Node anomaly client calls ML service, writes scores to `anomalies` table
5. **Checkpoint: insert fake spiky data, see anomaly detected**

### Phase 3: Auto-Optimization (Hours 20–32)
**Goal: System takes action and logs savings**

1. Optimizer engine: reads anomalies, decides which action
2. Actions: stop EC2, cap Lambda, delete EBS, tag resources
3. Audit trail: before/after cost written to `actions` table
4. **Checkpoint: leave EC2 idle → system stops it → savings logged**

### Phase 4: Dashboard (Hours 32–44)
**Goal: Beautiful, live-updating dashboard**

1. React app with three panels
2. Cost trend chart (Recharts LineChart, hourly buckets)
3. Anomaly feed (WebSocket, live cards with severity colors)
4. Savings tracker (bar chart, cumulative savings counter)
5. **Checkpoint: trigger anomaly → see it appear live → see action logged**

### Phase 5: Demo Prep (Hours 44–48)
**Goal: Reliable 3-minute demo**

1. Trigger anomalies deliberately (idle EC2, Lambda spam, orphan volume)
2. Practice the walkthrough
3. Have fallback screenshots/recordings in case AWS is slow

---

## Key Commands to Get Started

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Install backend dependencies
cd backend && npm install

# 3. Install ML service dependencies
cd ml-service && pip install -r requirements.txt

# 4. Install dashboard dependencies
cd dashboard && npm install

# 5. Run database migrations
cd backend && npm run db:migrate

# 6. Start everything
cd backend && npm run dev          # Express on :4000
cd ml-service && python app.py     # Flask on :5001
cd dashboard && npm start          # React on :3000
```

---

## Critical Success Metrics for Judges

1. **Real data** — not mocked. Show the AWS console side-by-side with your dashboard.
2. **Live detection** — trigger an anomaly during the demo, watch it appear.
3. **Concrete savings** — "Stopped i-0abc123, saving $0.023/hr → $16.56/month projected"
4. **Audit trail** — every action logged with before/after, timestamp, status.
5. **Architecture clarity** — the diagram above on your first slide.

---

## License

MIT
