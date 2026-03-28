# CloudSnip — Cloud Cost Intelligence

> Real-time cost monitoring · ML anomaly detection · Autonomous remediation · Hackathon 2026

CloudSnip connects to a live GCP project, ingests telemetry every 5 minutes, runs an Isolation Forest ML model to detect genuine cost anomalies, and automatically executes safe remediations via GCP APIs — all visible in a fully interactive dashboard with real-time Socket.IO updates.

---

## What it does

| Stage | What happens |
|-------|-------------|
| **Collect** | Cloud Monitoring (CPU, network, function invocations) + billing estimates + resource inventory → MongoDB |
| **Detect** | Python Isolation Forest scores every resource. Scores > 0.7 → confirmed anomaly |
| **Explain** | NLP engine generates a 5-field human-readable explanation (what happened, why it matters, what we did, impact, confidence) |
| **Remediate** | Optimizer stops idle VMs, caps runaway functions, deletes orphan disks, labels unreviewed assets |
| **Notify** | Slack Block Kit alert fires: anomaly detected (🔴) → action taken (🟢) → approval needed (🟣) |
| **Report** | Dashboard updates live: cost trends, anomaly feed, savings tracker, compliance score, heatmap |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    REACT DASHBOARD (:5173)                           │
│  Cost Trends · Anomaly Feed (NLP) · Heatmap · What-If · Compliance  │
│  Savings Tracker · Action Log · Budgets · Recommendations            │
│                    REST + Socket.IO                                   │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────────┐
│                EXPRESS SERVER (:4000)                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │
│  │ node-cron   │  │ 9 API routes │  │ Auto-Optimizer              │  │
│  │ 5-min cron  │  │ /costs       │  │ stop VM · cap function      │  │
│  │ 20-min sim  │  │ /anomalies   │  │ delete disk · label asset   │  │
│  │             │  │ /actions     │  │                             │  │
│  │             │  │ /dashboard   │  │ + Slack notifications       │  │
│  │             │  │ /simulation  │  │ + NLP explanation engine    │  │
│  │             │  │ /compliance  │  │                             │  │
│  │             │  │ /what-if     │  │                             │  │
│  └──────┬──────┘  └──────────────┘  └──────────────┬──────────────┘  │
│         │                                          │                  │
│         │  @google-cloud/* SDKs                    │  GCP APIs        │
│         ▼                                          ▼                  │
│  ┌─────────────────────┐               ┌─────────────────────────┐   │
│  │ Cloud Monitoring    │               │ Compute Engine          │   │
│  │ Cloud Billing       │               │ Cloud Functions         │   │
│  │ Resource Inventory  │               │ Persistent Disk         │   │
│  └──────────┬──────────┘               └─────────────────────────┘   │
│             │                                                         │
│             ▼                                                         │
│  ┌──────────────────────────────────────────────────┐                │
│  │  MongoDB Atlas                                   │                │
│  │  metrics (TTL 30d) · anomalies · actions         │                │
│  │  resources · budgets · simulation_events         │                │
│  └──────────────────────┬───────────────────────────┘                │
│                         │  POST /detect                              │
│                         ▼                                            │
│  ┌──────────────────────────────────────────────────┐                │
│  │  PYTHON ML SERVICE (:5001)                       │                │
│  │  Flask · scikit-learn · Isolation Forest         │                │
│  │  POST /detect → anomaly scores per resource      │                │
│  └──────────────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Dashboard Panels

| Row | Panels |
|-----|--------|
| 1 | 6 stat cards (animated countUp) · skeleton loaders on first load |
| 2 | Cost Trends + Prophet forecast toggle · Anomaly Feed (NLP cards) |
| 3 | Simulation Control (5 scenarios) · Anomaly Timeline chart |
| 4 | Savings Tracker · Action Log (approve / reject / rollback) |
| 5 | Anomaly Heatmap (7×24 grid) · What-If Simulator |
| 6 | Compliance Report (score ring + audit log) · Cost Allocation chart |
| 7 | Budget Alerts · AI Recommendations |
| 8 | Resource Inventory (click → drawer) |

All panels are wrapped in error boundaries — a single panel crash stays isolated.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| GCP | Compute Engine, Cloud Functions, Persistent Disk, Cloud Storage, Cloud Monitoring, Billing |
| Cloud SDK | `@google-cloud/compute`, `@google-cloud/monitoring`, `@google-cloud/billing`, `@google-cloud/functions`, `@google-cloud/storage` |
| Server | Express 5 + TypeScript + Socket.IO + node-cron |
| Database | MongoDB Atlas + Mongoose (TTL indexes for 30-day data retention) |
| ML | Python 3 + Flask + scikit-learn (Isolation Forest) |
| Client | React 19 + TypeScript + Recharts + Tailwind CSS v4 |
| Notifications | Slack Block Kit via Incoming Webhooks |

---

## Running Locally

```bash
# 1. Python ML service
cd ml-service
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
python app.py
# ✅ http://localhost:5001

# 2. Express server
cd server
cp .env.example .env          # Fill in GCP_PROJECT_ID, MONGODB_URI, etc.
npm install
npm run dev
# ✅ API + Socket.IO: http://localhost:4000
# After 5s: telemetry pipeline starts
# After 90s: simulation engine starts

# 3. React dashboard
cd client
npm install
npm run dev
# ✅ http://localhost:5173

# (Optional) Seed MongoDB with demo data for instant UI
cd server && npm run db:seed
```

---

## Environment Variables

Copy `server/.env.example` to `server/.env` and fill in:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GCP_PROJECT_ID` | ✅ | — | Your GCP project |
| `MONGODB_URI` | ✅ | — | Atlas or local Mongo |
| `ML_SERVICE_URL` | ✅ | `http://localhost:5001` | Python ML service |
| `DRY_RUN` | ✅ | `false` | `true` = log only, no GCP calls |
| `SLACK_WEBHOOK_URL` | ⬜ | — | Slack Incoming Webhook URL |
| `DASHBOARD_URL` | ⬜ | `http://localhost:5173` | Shown in Slack buttons |
| `CRON_SCHEDULE` | ⬜ | `*/5 * * * *` | Telemetry pipeline frequency |
| `SIM_CRON_SCHEDULE` | ⬜ | `*/20 * * * *` | Auto-simulation frequency |
| `CLOUD_FUNCTION_URL` | ⬜ | — | Deployed demo function URL |
| `ANOMALY_SCORE_THRESHOLD` | ⬜ | `0.7` | ML confidence threshold |

> **⚠️ Security**: `.env`, `.env.development`, `.env.production`, and `service-account-key.json` are all in `.gitignore`. Never commit credentials.

---

## Slack Setup (10 min)

1. https://api.slack.com/apps → **Create New App** → From scratch → name it "CloudSnip"
2. **Incoming Webhooks** (left sidebar) → toggle ON → **Add New Webhook to Workspace**
3. Choose channel (e.g. `#cloudsnip-alerts`) → **Allow**
4. Copy the webhook URL → paste into `server/.env`:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
   ```
5. Restart the server. Trigger "Idle VM" in the Simulation Control panel → Slack message fires in ~5 seconds.

---

## Anomaly Types & Remediations

| Anomaly | Trigger | Action |
|---------|---------|--------|
| `idle_instance` | CPU < 5% for 30 min | `stop_instance` via Compute Engine API |
| `runaway_function` | Invocations > 10× baseline | `cap_instances` → max 5 |
| `orphan_disk` | `disk.users[]` is empty | `delete_disk` |
| `traffic_spike` | Network > 5× baseline | `label_resource` (review required) |
| `cost_spike` | Hourly cost > 3× average | `label_resource` (review required) |

---

## Demo Playbook (5 min)

```
00:00  Open dashboard → skeleton loaders → stats populate (countUp animation)
       Header: ML online · last scan Xs ago · next scan in Ys
00:30  Show live GCP project in header + stat cards
01:00  Simulation Control → click "Idle VM"
       → Anomaly card appears in feed
       → Expand card → NLP full analysis
       → Check Slack: 🔴 detected alert
02:00  Action Log: stop_instance · $X.XX/mo saved
       → Savings Tracker updates · Slack: 🟢 resolved
02:30  Forecast toggle on Cost Trends → Prophet shaded confidence band
03:00  Anomaly Heatmap → point to high-frequency hours
03:30  What-If Simulator → change machine type → show projected savings
04:00  Compliance Report → score ring → risk items → Print for governance
04:30  Rollback an action → "Every decision is reversible"
05:00  Q&A
```

> **💡 Fast demo mode**: Set `SIM_CRON_SCHEDULE=*/2 * * * *` to fire scenarios every 2 min during the presentation.

---

## Project Structure

```
cloudsnip/
├── server/
│   ├── .env.example                  ← Copy to .env and fill in
│   └── src/
│       ├── index.ts                  API + Socket.IO entry
│       ├── scheduler.ts              Cron: telemetry + simulation
│       ├── budget-checker.ts         Budget threshold alerts
│       ├── anomaly/client.ts         ML service HTTP client
│       ├── collectors/               Cloud Monitoring, Billing, Inventory
│       ├── optimizer/                Decision engine + 5 action handlers
│       ├── simulation/               5-scenario anomaly injector
│       ├── notifications/            NLP explanation engine + Slack
│       ├── routes/                   9 API routes
│       ├── models/                   7 Mongoose schemas
│       └── seed.ts                   Demo data seeder
│
├── client/
│   └── src/
│       ├── App.tsx                   8-row dashboard layout
│       ├── hooks/                    useCostData, useWebSocket, useCountUp
│       └── components/              16 components + error boundaries
│
├── ml-service/
│   └── app.py                       Flask + Isolation Forest
│
└── cloud-function-demo/
    └── index.js                     GCP Cloud Function (target of simulations)
```

---

## License

MIT