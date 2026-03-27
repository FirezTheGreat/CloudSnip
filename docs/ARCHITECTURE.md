# Architecture Deep Dive

## System Components

This system has **four** independently running processes that communicate via HTTP, WebSocket, and a shared database.

---

## Component 1: Express Backend (TypeScript)

**What it does:** Orchestrates everything. Collects telemetry, calls the ML service, decides on actions, exposes REST API, pushes WebSocket events.

**Why Express and not FastAPI:**
- GCP has official Node.js client libraries (`@google-cloud/*`) with full TypeScript support
- You already know TypeScript — no learning curve
- The cron scheduler, WebSocket server, and REST API all live in one process
- The only Python you touch is the 50-line ML microservice

### Internal modules:

```
src/
├── index.ts              ← Express + WS server startup
├── config.ts             ← All env vars + GCP client initialization
├── db.ts                 ← pg Pool connection to TimescaleDB
│
├── collectors/           ← PULL data from GCP
│   ├── cloud-monitoring.ts   ← Cloud Monitoring: CPU, network, function invocations
│   ├── cloud-billing.ts      ← Cost estimation from resource inventory + pricing
│   └── resource-inventory.ts ← Compute VMs, Cloud Functions, Disks, GCS Buckets
│
├── scheduler.ts          ← node-cron: runs collectors every 5 min
│
├── anomaly/
│   └── client.ts         ← HTTP POST to Python ML service, parse scores
│
├── optimizer/
│   ├── engine.ts         ← Decision tree: which anomaly → which action
│   └── actions/
│       ├── stop-idle-vm.ts         ← compute.instances.stop()
│       ├── cap-cloud-function.ts   ← functions.updateFunction() (maxInstanceCount)
│       ├── cleanup-disks.ts        ← compute.disks.delete()
│       └── label-resources.ts      ← compute.instances.setLabels()
│
├── routes/
│   ├── costs.ts          ← GET /api/costs — time-bucketed cost data
│   ├── anomalies.ts      ← GET /api/anomalies — detected anomalies
│   ├── actions.ts        ← GET /api/actions — audit trail
│   └── dashboard.ts      ← GET /api/dashboard/summary — aggregate stats
│
└── websocket.ts          ← Broadcast anomalies + actions to connected clients
```

### Key design decisions:

**Singleton GCP clients:** Create clients once in `config.ts`, import everywhere. GCP clients auto-detect credentials from `GOOGLE_APPLICATION_CREDENTIALS`.

```typescript
// config.ts — create once, use everywhere
import { InstancesClient, DisksClient } from "@google-cloud/compute";
import { MetricServiceClient } from "@google-cloud/monitoring";
import { CloudFunctionsServiceClient } from "@google-cloud/functions";
import { Storage } from "@google-cloud/storage";

export const computeInstances = new InstancesClient();
export const computeDisks = new DisksClient();
export const monitoring = new MetricServiceClient();
export const functionsClient = new CloudFunctionsServiceClient();
export const storage = new Storage();
```

**GCP auth via service account JSON key:** Set `GOOGLE_APPLICATION_CREDENTIALS` env var to the path of your key file. All GCP client libraries auto-detect it — no explicit credential passing needed.

**node-cron, not setInterval:** `node-cron` gives you cron syntax (`*/5 * * * *`), handles timezone issues, and is a well-known pattern judges will recognize.

---

## Component 2: Python ML Service (Flask + scikit-learn)

**What it does:** Receives a batch of metric data points, runs Isolation Forest, returns anomaly scores.

**Why it's separate:**
- scikit-learn is Python-only, no good JS alternative
- If the ML service crashes, your backend keeps working
- Clean microservice boundary — your Node app doesn't care HOW anomalies are detected
- Judges see "microservice architecture" in your diagram

**How Isolation Forest works (you need to explain this in your demo):**
1. It builds random decision trees that split data randomly
2. Normal data points need many splits to be isolated (they're clustered together)
3. Anomalies need few splits (they're far from everything else)
4. The "anomaly score" is based on the average number of splits needed
5. Score close to 1 = anomaly, close to 0 = normal, around 0.5 = borderline

**The API contract:**

```
POST /detect
Content-Type: application/json

Request body:
{
  "metrics": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "resource_id": "1234567890123456",
      "cpu_utilization": 2.3,
      "network_in": 1024,
      "network_out": 512,
      "estimated_hourly_cost": 0.0076
    },
    ...
  ]
}

Response:
{
  "anomalies": [
    {
      "resource_id": "1234567890123456",
      "anomaly_score": 0.89,
      "is_anomaly": true,
      "anomaly_type": "idle_instance",
      "contributing_factors": ["cpu_utilization: 2.3 (expected >15)"]
    }
  ],
  "model_info": {
    "samples_used": 150,
    "contamination": 0.1
  }
}
```

**contamination parameter:** This tells Isolation Forest what fraction of the data you expect to be anomalous. Set it to 0.1 (10%) — this is generous for a hackathon demo. In production you'd tune this, but 0.1 works well for a system where you're deliberately creating anomalies.

---

## Component 3: TimescaleDB

**What it does:** Stores all time-series metrics, anomalies, and actions with PostgreSQL's full SQL power plus time-series superpowers.

**Why not regular Postgres:**
TimescaleDB adds one critical function: `time_bucket()`. This lets you aggregate metrics into arbitrary time windows in a single query:

```sql
-- Average CPU per hour for the last 24 hours
SELECT
  time_bucket('1 hour', time) AS bucket,
  resource_id,
  AVG(value) as avg_cpu
FROM metrics
WHERE metric_name = 'cpuutilization'
  AND time > NOW() - INTERVAL '24 hours'
GROUP BY bucket, resource_id
ORDER BY bucket;
```

Without TimescaleDB, you'd need to write the bucketing logic in application code. With it, one SQL query gives your dashboard exactly what it needs.

**Hypertables:** The `metrics` and `cost_summaries` tables are "hypertables" — TimescaleDB automatically partitions them by time. This means queries like "last 2 hours" are fast regardless of how much total data you have.

---

## Component 4: React Dashboard

**What it does:** Three-panel real-time dashboard showing cost trends, live anomaly detection, and savings tracking.

**Panel layout:**

```
┌────────────────────────────────────────────────────────────────┐
│  Cloud Cost Intelligence Dashboard              [Live ●]      │
├────────────────────────────────┬───────────────────────────────┤
│                                │                               │
│   COST TRENDS                  │   ANOMALY FEED                │
│   (Recharts LineChart)         │   (WebSocket live cards)      │
│                                │                               │
│   Lines: Compute, Functions,   │   ● CRITICAL: VM idle         │
│          GCS, Disks            │   ● HIGH: Function spike      │
│   X-axis: time (hourly)       │   ● MEDIUM: Orphan disk       │
│   Y-axis: cost ($)            │                               │
│                                │                               │
├────────────────────────────────┴───────────────────────────────┤
│                                                                │
│   SAVINGS TRACKER                                              │
│   (Recharts BarChart — before/after per action)                │
│                                                                │
│   Total saved: $2.34/hr → $1,708/month projected               │
│                                                                │
│   ┌──────┐ ┌──────┐ ┌──────┐                                  │
│   │Before│ │Before│ │Before│                                  │
│   │ $0.5 │ │ $0.3 │ │ $0.1 │                                  │
│   │After │ │After │ │After │                                  │
│   │ $0.0 │ │ $0.05│ │ $0.0 │                                  │
│   └──────┘ └──────┘ └──────┘                                  │
│   Stop VM  Cap Fn   Del Disk                                   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**WebSocket vs polling:**
- Cost trends: REST polling every 30 seconds (data doesn't change faster)
- Anomaly feed: WebSocket push (you want instant appearance)
- Savings tracker: REST polling every 30 seconds

**Why Recharts:**
- React-native, component-based API
- `<LineChart>`, `<BarChart>` — literally what the components are called
- Responsive by default, good-looking defaults
- You won't spend time fighting chart configuration

---

## Data Flow Sequence

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  GCP   │     │ Backend │     │TimescaleDB│    │ML Service│     │Dashboard │
│ Cloud   │     │ (Node)  │     │          │     │ (Python) │     │ (React)  │
└────┬────┘     └────┬────┘     └─────┬────┘     └────┬─────┘     └────┬─────┘
     │               │               │               │               │
     │  cron fires   │               │               │               │
     │◄──────────────│               │               │               │
     │               │               │               │               │
     │  Cloud        │               │               │               │
     │  Monitoring   │               │               │               │
     │  listTimeSeries               │               │               │
     │──────────────►│               │               │               │
     │  CPU=2.3%     │               │               │               │
     │◄──────────────│               │               │               │
     │               │               │               │               │
     │               │ INSERT metric │               │               │
     │               │──────────────►│               │               │
     │               │               │               │               │
     │               │ POST /detect  │               │               │
     │               │ (last 2hrs)   │               │               │
     │               │──────────────────────────────►│               │
     │               │               │               │               │
     │               │ anomaly_score │               │               │
     │               │ = 0.89        │               │               │
     │               │◄──────────────────────────────│               │
     │               │               │               │               │
     │               │ INSERT anomaly│               │               │
     │               │──────────────►│               │               │
     │               │               │               │               │
     │               │ score > 0.7   │               │               │
     │               │ → take action │               │               │
     │               │               │               │               │
     │  instances    │               │               │               │
     │  .stop()      │               │               │               │
     │◄──────────────│               │               │               │
     │  OK           │               │               │               │
     │──────────────►│               │               │               │
     │               │               │               │               │
     │               │ INSERT action │               │               │
     │               │ (before/after)│               │               │
     │               │──────────────►│               │               │
     │               │               │               │               │
     │               │ WebSocket push│               │               │
     │               │──────────────────────────────────────────────►│
     │               │               │               │               │
```

---

## Error Handling Strategy

Every GCP API call should be wrapped in try/catch. The system must keep running even if:
- GCP rate limits you (back off and retry)
- Billing data is not yet available
- ML service is down (log the error, skip anomaly detection this cycle)
- A stop/delete action fails (log to audit trail with status = "failed")

**Critical rule:** Never let an optimizer action crash the collector. The pipeline must keep collecting even if actions fail.

---

## Security Considerations

1. **Least privilege roles:** The service account has exactly the roles needed, nothing more
2. **No credentials in code:** Key file path in `.env`, which is `.gitignore`d. Never commit `service-account-key.json`.
3. **Dry-run mode:** Add a `DRY_RUN=true` env var that logs what it WOULD do without actually calling stop/delete
4. **Action confirmation:** For the demo, you might want a "manual approval" mode where the dashboard shows a "Confirm" button instead of auto-executing
