# Cloud Cost Intelligence System

A real-time cloud cost monitoring, anomaly detection, and auto-optimization platform that connects to live GCP resources, detects genuine cost anomalies using ML, and autonomously executes safe optimizations via cloud APIs.

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
│                    EXPRESS SERVER (:4000)                               │
│  ┌──────────────┐  ┌───────┴────────┐  ┌──────────────────────────┐   │
│  │ Telemetry    │  │ API Routes     │  │ Auto-Optimizer           │   │
│  │ Collector    │  │ /api/costs     │  │ (stop VM, cap Function,  │   │
│  │ (node-cron   │  │ /api/anomalies │  │  delete disks, label)    │   │
│  │  every 5min) │  │ /api/actions   │  │                          │   │
│  └──────┬───────┘  └────────────────┘  └────────────┬─────────────┘   │
│         │                                            │                 │
│         │  GCP Client Libraries                      │  GCP APIs       │
│         ▼                                            ▼                 │
│  ┌──────────────┐                           ┌──────────────────────┐   │
│  │ Cloud        │                           │ Compute / Functions  │   │
│  │ Monitoring   │                           │ stop / limit / clean │   │
│  │ + Billing    │                           │                      │   │
│  └──────┬───────┘                           └──────────────────────┘   │
│         │                                                              │
│         ▼                                                              │
│  ┌──────────────────────────────────────────────────┐                  │
│  │             MongoDB (:27017)                      │                  │
│  │  metrics | anomalies | actions | resources        │                  │
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
│   ├── GCP_SETUP.md                   # Step-by-step GCP provisioning guide
│   ├── DATABASE_SCHEMA.md             # MongoDB collections documentation
│   └── DEMO_PLAYBOOK.md              # How to trigger & demo anomalies
│
├── docker-compose.yml                 # MongoDB + ML service
│
├── server/                            # Express + TypeScript
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts                   # Express server + WebSocket setup
│       ├── config.ts                  # Env vars, GCP config, thresholds
│       ├── db.ts                      # MongoDB/Mongoose connection
│       │
│       ├── models/                    # Mongoose schemas
│       │   ├── Metric.ts
│       │   ├── Anomaly.ts
│       │   ├── Action.ts
│       │   ├── CostSummary.ts
│       │   └── Resource.ts
│       │
│       ├── collectors/                # Telemetry pipeline
│       │   ├── cloud-monitoring.ts    # CPU, network, Cloud Functions metrics
│       │   ├── cloud-billing.ts       # Cost estimation per service
│       │   └── resource-inventory.ts  # List VMs, Functions, Disks, Buckets
│       │
│       ├── scheduler.ts              # node-cron: poll every 5 min
│       │
│       ├── anomaly/
│       │   └── client.ts             # HTTP client to Python ML service
│       │
│       ├── optimizer/                 # Autonomous actions
│       │   ├── engine.ts             # Decision logic: which action to take
│       │   └── actions/
│       │       ├── stop-idle-vm.ts
│       │       ├── cap-cloud-function.ts
│       │       ├── cleanup-disks.ts
│       │       └── label-resources.ts
│       │
│       ├── routes/                   # REST API
│       │   ├── costs.ts
│       │   ├── anomalies.ts
│       │   ├── actions.ts
│       │   └── dashboard.ts
│       │
│       ├── websocket.ts             # Push anomalies + actions to frontend
│       └── seed.ts                  # Test data seeder
│
├── ml-service/                       # Python anomaly detection
│   ├── requirements.txt
│   ├── Dockerfile
│   └── app.py                        # Flask + Isolation Forest (~60 lines)
│
└── client/                           # React + Recharts
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

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Cloud | GCP Free Tier | Compute Engine, Cloud Functions, Cloud Storage, Persistent Disks |
| Cloud SDK | @google-cloud/* | Official Node.js client libraries with full TypeScript support |
| Telemetry | node-cron | Polls Cloud Monitoring every 5 min |
| Database | MongoDB + Mongoose | Schema-flexible, fast for document-based telemetry, no migrations |
| Anomaly Detection | Python Flask + scikit-learn | Isolation Forest, ~60 lines, called via HTTP |
| Server API | Express + TypeScript | REST + WebSocket, your comfort zone |
| Autonomous Actions | GCP Client Libraries | Stop VMs, cap functions, delete disks, label resources |
| Client | React + Recharts | Live cost charts, anomaly feed, savings tracker |
| Real-time | WebSockets (ws library) | Push anomalies to client live |

---

## Data Flow — Every 5 Minutes

```
1. Collector pulls Cloud Monitoring metrics (CPU, network, function invocations)
2. Collector estimates cost data from resource inventory + known GCP pricing
3. Collector lists resources (Compute VMs, Cloud Functions, Persistent Disks, GCS Buckets)
4. All data written to MongoDB collections
5. Last 2 hours of metrics sent to ML service POST /detect
6. ML service returns anomaly scores per resource
7. Scores above threshold → written to `anomalies` collection
8. Anomaly triggers optimizer engine:
   - Idle VM (CPU < 5% for 30 min) → stop instance
   - Runaway Cloud Function (invocations spike 10x) → cap max instances
   - Unattached Persistent Disk (no users) → delete
   - Unlabeled resource → label with "needs-review"
9. Before/after cost delta written to `actions` collection
10. WebSocket pushes anomaly + action to client
```

---

## Key Commands

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Install server dependencies
cd server && npm install

# 3. Install ML service dependencies
cd ml-service && pip install -r requirements.txt

# 4. Install client dependencies
cd client && npm install

# 5. (Optional) Seed test data
cd server && npm run db:seed

# 6. Start everything
cd server && npm run dev          # Express on :4000
cd ml-service && python app.py     # Flask on :5001
cd client && npm run dev           # React on :3000
```

---

## Critical Success Metrics for Judges

1. **Real data** — not mocked. Show the GCP Console side-by-side with your dashboard.
2. **Live detection** — trigger an anomaly during the demo, watch it appear.
3. **Concrete savings** — "Stopped cost-intel-demo-vm, saving $0.0076/hr → $5.55/month projected"
4. **Audit trail** — every action logged with before/after, timestamp, status.
5. **Architecture clarity** — the diagram above on your first slide.

---

## License

MIT
