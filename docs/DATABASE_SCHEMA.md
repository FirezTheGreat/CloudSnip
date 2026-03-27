# Database Schema — TimescaleDB

## Why TimescaleDB

TimescaleDB is PostgreSQL with a time-series extension. You get:
- Standard SQL (you already know this)
- `time_bucket()` function for aggregating metrics into time windows
- Automatic partitioning by time (hypertables) for fast range queries
- JOINs between metrics, anomalies, and actions — impossible in InfluxDB/Prometheus

## Setup

TimescaleDB runs in Docker via `docker-compose.yml`. No installation needed.

```bash
docker-compose up -d timescaledb
```

Connection string:
```
postgresql://costintel:password@localhost:5432/costintel
```

---

## Migration SQL

Save this as `backend/src/migrations/001_initial.sql` and run it on startup.

```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-----------------------------------------------------------
-- TABLE: metrics
-- Raw telemetry data from GCP Cloud Monitoring
-- This is a hypertable — TimescaleDB auto-partitions by time
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS metrics (
    time            TIMESTAMPTZ     NOT NULL,
    resource_id     TEXT            NOT NULL,
    resource_type   TEXT            NOT NULL,    -- compute, cloud_function, gcs, disk, cloud_sql
    metric_name     TEXT            NOT NULL,    -- cpuutilization, invocations, etc.
    value           DOUBLE PRECISION NOT NULL,
    unit            TEXT,                        -- Percent, Count, Bytes, USD
    region          TEXT            DEFAULT 'us-central1'
);

-- Convert to hypertable (partitioned by time, 1-day chunks)
SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);

-- Index for common queries: "give me all CPU data for this VM in the last 2 hours"
CREATE INDEX IF NOT EXISTS idx_metrics_resource_time
    ON metrics (resource_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_type_name_time
    ON metrics (resource_type, metric_name, time DESC);

-----------------------------------------------------------
-- TABLE: anomalies
-- Detected anomalies from the ML service
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS anomalies (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    detected_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    resource_id     TEXT            NOT NULL,
    resource_type   TEXT            NOT NULL,
    anomaly_type    TEXT            NOT NULL,    -- idle_instance, cost_spike, runaway_function, unused_disk, unlabeled_resource
    severity        TEXT            NOT NULL DEFAULT 'medium',  -- low, medium, high, critical
    anomaly_score   DOUBLE PRECISION NOT NULL,  -- 0.0 to 1.0 from Isolation Forest
    metric_snapshot JSONB,                       -- the metric values that triggered this
    description     TEXT,                        -- human-readable explanation
    resolved        BOOLEAN         DEFAULT FALSE,
    resolved_at     TIMESTAMPTZ,
    resolved_by     TEXT                         -- action_id or 'manual'
);

CREATE INDEX IF NOT EXISTS idx_anomalies_detected
    ON anomalies (detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_anomalies_resource
    ON anomalies (resource_id);

CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved
    ON anomalies (resolved) WHERE resolved = FALSE;

-----------------------------------------------------------
-- TABLE: actions
-- Audit trail of automated optimizations
-- This is the "before/after" table judges will look at
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS actions (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    executed_at             TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    anomaly_id              UUID            REFERENCES anomalies(id),
    resource_id             TEXT            NOT NULL,
    resource_type           TEXT            NOT NULL,
    action_type             TEXT            NOT NULL,   -- stop_instance, cap_instances, delete_disk, label_resource
    status                  TEXT            NOT NULL DEFAULT 'pending',  -- pending, executing, success, failed, rolled_back
    cost_before_hourly      DOUBLE PRECISION,           -- $/hr before action
    cost_after_hourly       DOUBLE PRECISION,           -- $/hr after action
    savings_hourly          DOUBLE PRECISION,           -- delta
    savings_monthly_projected DOUBLE PRECISION,         -- delta × 730
    details                 JSONB,                      -- API response, error info, etc.
    dry_run                 BOOLEAN         DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_actions_executed
    ON actions (executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_actions_resource
    ON actions (resource_id);

-----------------------------------------------------------
-- TABLE: cost_summaries
-- Daily cost rollups per service
-- Also a hypertable for efficient time-range queries
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_summaries (
    time            TIMESTAMPTZ     NOT NULL,
    service         TEXT            NOT NULL,    -- Compute Engine, Cloud Functions, Cloud Storage, Persistent Disk
    total_cost      DOUBLE PRECISION NOT NULL,
    currency        TEXT            DEFAULT 'USD',
    resource_count  INT             DEFAULT 0
);

SELECT create_hypertable('cost_summaries', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_cost_summaries_service_time
    ON cost_summaries (service, time DESC);

-----------------------------------------------------------
-- TABLE: resources
-- Current inventory of monitored GCP resources
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS resources (
    resource_id     TEXT            PRIMARY KEY,
    resource_type   TEXT            NOT NULL,
    name            TEXT,
    status          TEXT,           -- RUNNING, STOPPED, active, attached, unattached, etc.
    region          TEXT            DEFAULT 'us-central1',
    tags            JSONB,
    hourly_cost     DOUBLE PRECISION DEFAULT 0,
    first_seen      TIMESTAMPTZ     DEFAULT NOW(),
    last_seen       TIMESTAMPTZ     DEFAULT NOW(),
    metadata        JSONB           -- machine type, disk size, function runtime, etc.
);

CREATE INDEX IF NOT EXISTS idx_resources_type
    ON resources (resource_type);
```

---

## Useful Queries

These are the queries your API routes will use. Study them — they're the bridge between your data and your dashboard.

### Get hourly cost trend (last 24 hours)

```sql
SELECT
    time_bucket('1 hour', time) AS hour,
    resource_type,
    SUM(value) AS total_cost
FROM metrics
WHERE metric_name = 'estimated_cost'
    AND time > NOW() - INTERVAL '24 hours'
GROUP BY hour, resource_type
ORDER BY hour;
```

### Get resources with low CPU (idle detection candidates)

```sql
SELECT
    resource_id,
    AVG(value) AS avg_cpu,
    MAX(time) AS last_seen
FROM metrics
WHERE metric_name = 'cpuutilization'
    AND resource_type = 'compute'
    AND time > NOW() - INTERVAL '30 minutes'
GROUP BY resource_id
HAVING AVG(value) < 5.0;
```

### Get total savings from all actions

```sql
SELECT
    SUM(savings_hourly) AS total_hourly_savings,
    SUM(savings_monthly_projected) AS total_monthly_savings,
    COUNT(*) AS total_actions,
    COUNT(*) FILTER (WHERE status = 'success') AS successful_actions
FROM actions;
```

### Get recent anomalies with their actions

```sql
SELECT
    a.id,
    a.detected_at,
    a.resource_id,
    a.anomaly_type,
    a.severity,
    a.anomaly_score,
    a.description,
    act.action_type,
    act.status AS action_status,
    act.savings_monthly_projected
FROM anomalies a
LEFT JOIN actions act ON act.anomaly_id = a.id
ORDER BY a.detected_at DESC
LIMIT 20;
```

### Dashboard summary (single query for top-level stats)

```sql
SELECT
    (SELECT COUNT(*) FROM resources WHERE status IN ('RUNNING', 'active')) AS active_resources,
    (SELECT COUNT(*) FROM anomalies WHERE resolved = FALSE) AS open_anomalies,
    (SELECT COALESCE(SUM(savings_monthly_projected), 0) FROM actions WHERE status = 'success') AS total_monthly_savings,
    (SELECT COUNT(*) FROM actions WHERE status = 'success') AS total_actions_taken;
```

---

## Data Retention

For a hackathon, you don't need retention policies. But if judges ask:

```sql
-- Keep metrics for 30 days, then auto-delete
SELECT add_retention_policy('metrics', INTERVAL '30 days');
SELECT add_retention_policy('cost_summaries', INTERVAL '90 days');
```

---

## Seed Data for Testing

If you don't have enough real metric data yet, use this seed data to test your dashboard:

```sql
-- Seed some metrics (Compute Engine VM going idle)
INSERT INTO metrics (time, resource_id, resource_type, metric_name, value, unit) VALUES
    (NOW() - INTERVAL '2 hours', '1234567890123', 'compute', 'cpuutilization', 45.2, 'Percent'),
    (NOW() - INTERVAL '1.5 hours', '1234567890123', 'compute', 'cpuutilization', 38.7, 'Percent'),
    (NOW() - INTERVAL '1 hour', '1234567890123', 'compute', 'cpuutilization', 12.1, 'Percent'),
    (NOW() - INTERVAL '30 minutes', '1234567890123', 'compute', 'cpuutilization', 3.2, 'Percent'),
    (NOW() - INTERVAL '25 minutes', '1234567890123', 'compute', 'cpuutilization', 2.8, 'Percent'),
    (NOW() - INTERVAL '20 minutes', '1234567890123', 'compute', 'cpuutilization', 1.9, 'Percent'),
    (NOW() - INTERVAL '15 minutes', '1234567890123', 'compute', 'cpuutilization', 2.1, 'Percent'),
    (NOW() - INTERVAL '10 minutes', '1234567890123', 'compute', 'cpuutilization', 1.5, 'Percent'),
    (NOW() - INTERVAL '5 minutes', '1234567890123', 'compute', 'cpuutilization', 1.2, 'Percent');

-- This will show a clear pattern: CPU drops from 45% to 1.2% — idle VM

-- Seed a Cloud Function spike
INSERT INTO metrics (time, resource_id, resource_type, metric_name, value, unit) VALUES
    (NOW() - INTERVAL '2 hours', 'cost-intel-demo-function', 'cloud_function', 'invocations', 10, 'Count'),
    (NOW() - INTERVAL '1.5 hours', 'cost-intel-demo-function', 'cloud_function', 'invocations', 12, 'Count'),
    (NOW() - INTERVAL '1 hour', 'cost-intel-demo-function', 'cloud_function', 'invocations', 8, 'Count'),
    (NOW() - INTERVAL '30 minutes', 'cost-intel-demo-function', 'cloud_function', 'invocations', 150, 'Count'),
    (NOW() - INTERVAL '25 minutes', 'cost-intel-demo-function', 'cloud_function', 'invocations', 200, 'Count'),
    (NOW() - INTERVAL '20 minutes', 'cost-intel-demo-function', 'cloud_function', 'invocations', 180, 'Count');

-- This will show a clear spike: 10 → 200 invocations
```
