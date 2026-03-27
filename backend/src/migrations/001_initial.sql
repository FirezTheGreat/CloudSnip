CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS metrics (
    time            TIMESTAMPTZ      NOT NULL,
    resource_id     TEXT             NOT NULL,
    resource_type   TEXT             NOT NULL,
    metric_name     TEXT             NOT NULL,
    value           DOUBLE PRECISION NOT NULL,
    unit            TEXT,
    region          TEXT             DEFAULT 'us-east-1'
);

SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_metrics_resource_time
    ON metrics (resource_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_type_name_time
    ON metrics (resource_type, metric_name, time DESC);

CREATE TABLE IF NOT EXISTS anomalies (
    id              UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
    detected_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    resource_id     TEXT             NOT NULL,
    resource_type   TEXT             NOT NULL,
    anomaly_type    TEXT             NOT NULL,
    severity        TEXT             NOT NULL DEFAULT 'medium',
    anomaly_score   DOUBLE PRECISION NOT NULL,
    metric_snapshot JSONB,
    description     TEXT,
    resolved        BOOLEAN          DEFAULT FALSE,
    resolved_at     TIMESTAMPTZ,
    resolved_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_anomalies_detected ON anomalies (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_resource ON anomalies (resource_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved ON anomalies (resolved) WHERE resolved = FALSE;

CREATE TABLE IF NOT EXISTS actions (
    id                        UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
    executed_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    anomaly_id                UUID             REFERENCES anomalies(id),
    resource_id               TEXT             NOT NULL,
    resource_type             TEXT             NOT NULL,
    action_type               TEXT             NOT NULL,
    status                    TEXT             NOT NULL DEFAULT 'pending',
    cost_before_hourly        DOUBLE PRECISION,
    cost_after_hourly         DOUBLE PRECISION,
    savings_hourly            DOUBLE PRECISION,
    savings_monthly_projected DOUBLE PRECISION,
    details                   JSONB,
    dry_run                   BOOLEAN          DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_actions_executed ON actions (executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_actions_resource ON actions (resource_id);

CREATE TABLE IF NOT EXISTS cost_summaries (
    time            TIMESTAMPTZ      NOT NULL,
    service         TEXT             NOT NULL,
    total_cost      DOUBLE PRECISION NOT NULL,
    currency        TEXT             DEFAULT 'USD',
    resource_count  INT              DEFAULT 0
);

SELECT create_hypertable('cost_summaries', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_cost_summaries_service_time
    ON cost_summaries (service, time DESC);

CREATE TABLE IF NOT EXISTS resources (
    resource_id     TEXT             PRIMARY KEY,
    resource_type   TEXT             NOT NULL,
    name            TEXT,
    status          TEXT,
    region          TEXT             DEFAULT 'us-east-1',
    tags            JSONB,
    hourly_cost     DOUBLE PRECISION DEFAULT 0,
    first_seen      TIMESTAMPTZ      DEFAULT NOW(),
    last_seen       TIMESTAMPTZ      DEFAULT NOW(),
    metadata        JSONB
);

CREATE INDEX IF NOT EXISTS idx_resources_type ON resources (resource_type);
