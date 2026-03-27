# Database Schema — MongoDB + Mongoose

## Why MongoDB

- **Schema-flexible** — no migrations needed. Define schemas in code with Mongoose, MongoDB creates collections automatically.
- **Aggregation pipeline** — powerful enough for time-bucketed queries, grouping, and joins via `$lookup`
- **Fast writes** — metric data is insert-heavy, MongoDB handles this natively
- **JSON-native** — your metric snapshots and resource metadata are objects, not JSONB columns
- **You know it** — zero learning curve

## Setup

MongoDB runs in Docker via `docker-compose.yml`. No installation needed.

```bash
docker-compose up -d mongodb
```

Connection string:
```
mongodb://localhost:27017/costintel
```

No migrations needed. Mongoose creates collections and indexes automatically on first connection.

---

## Collections & Schemas

### `metrics` — raw telemetry from GCP Cloud Monitoring

```typescript
{
  time:           Date,        // When the metric was collected
  resource_id:    String,      // GCP resource ID (instance ID, function name)
  resource_type:  String,      // compute, cloud_function, gcs, disk, cloud_sql
  metric_name:    String,      // cpuutilization, invocations, networkin, etc.
  value:          Number,      // The metric value
  unit:           String,      // Percent, Count, Bytes, USD
  region:         String       // us-central1 (default)
}

// Indexes:
// { time: -1, resource_id: 1 }
// { resource_type: 1, metric_name: 1, time: -1 }
```

### `anomalies` — detected anomalies from the ML service

```typescript
{
  detected_at:     Date,        // When detected (default: now)
  resource_id:     String,      // Which resource
  resource_type:   String,      // compute, cloud_function, etc.
  anomaly_type:    String,      // idle_instance, cost_spike, runaway_function, unused_disk
  severity:        String,      // low | medium | high | critical
  anomaly_score:   Number,      // 0.0 to 1.0 from Isolation Forest
  metric_snapshot: Object,      // The metrics that triggered detection
  description:     String,      // Human-readable explanation
  resolved:        Boolean,     // Has it been acted on? (default: false)
  resolved_at:     Date,        // When was it resolved?
  resolved_by:     String       // action type or "manual"
}

// Indexes:
// { detected_at: -1 }
// { resource_id: 1 }
// { resolved: 1 }
```

### `actions` — optimization audit trail

```typescript
{
  executed_at:              Date,       // When the action ran (default: now)
  anomaly_id:              ObjectId,   // Reference to anomalies collection
  resource_id:             String,     // Which resource
  resource_type:           String,     // compute, cloud_function, disk
  action_type:             String,     // stop_instance, cap_instances, delete_disk, label_resource
  status:                  String,     // pending, executing, success, failed, rolled_back
  cost_before_hourly:      Number,     // $/hr before action
  cost_after_hourly:       Number,     // $/hr after action
  savings_hourly:          Number,     // Delta
  savings_monthly_projected: Number,   // Delta × 730 hours
  details:                 Object,     // API response, error messages, etc.
  dry_run:                 Boolean     // Was this a dry run?
}

// Indexes:
// { executed_at: -1 }
// { resource_id: 1 }
```

### `costsummaries` — daily cost rollups per service

```typescript
{
  time:            Date,       // Day
  service:         String,     // Compute Engine, Cloud Functions, Cloud Storage, etc.
  total_cost:      Number,     // Total spend for the day
  currency:        String,     // USD (default)
  resource_count:  Number      // Number of resources
}

// Indexes:
// { service: 1, time: -1 }
```

### `resources` — current inventory of monitored GCP resources

```typescript
{
  resource_id:   String,       // GCP resource ID (unique)
  resource_type: String,       // compute, cloud_function, gcs, disk, cloud_sql
  name:          String,       // Human-readable name
  status:        String,       // RUNNING, STOPPED, active, attached, unattached
  region:        String,       // us-central1 (default)
  tags:          Object,       // GCP labels
  hourly_cost:   Number,       // Estimated $/hr
  first_seen:    Date,
  last_seen:     Date,
  metadata:      Object        // Machine type, disk size, function runtime, etc.
}

// Indexes:
// { resource_id: 1 } (unique)
// { resource_type: 1 }
```

---

## Useful Queries (Mongoose)

### Get hourly cost trend (last 24 hours)

```typescript
const data = await Metric.aggregate([
  { $match: { time: { $gt: twentyFourHoursAgo }, metric_name: "cpuutilization" } },
  {
    $group: {
      _id: {
        hour: { $dateTrunc: { date: "$time", unit: "hour" } },
        resource_type: "$resource_type",
      },
      avg_value: { $avg: "$value" },
    },
  },
  { $sort: { "_id.hour": 1 } },
]);
```

### Get resources with low CPU (idle detection candidates)

```typescript
const idle = await Metric.aggregate([
  {
    $match: {
      metric_name: "cpuutilization",
      resource_type: "compute",
      time: { $gt: thirtyMinutesAgo },
    },
  },
  {
    $group: {
      _id: "$resource_id",
      avg_cpu: { $avg: "$value" },
      last_seen: { $max: "$time" },
    },
  },
  { $match: { avg_cpu: { $lt: 5.0 } } },
]);
```

### Get total savings from all actions

```typescript
const savings = await Action.aggregate([
  {
    $group: {
      _id: null,
      total_hourly: { $sum: "$savings_hourly" },
      total_monthly: { $sum: "$savings_monthly_projected" },
      total_actions: { $sum: 1 },
      successful: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
    },
  },
]);
```

### Dashboard summary

```typescript
const [total, active, openAnomalies, savingsAgg] = await Promise.all([
  Resource.countDocuments(),
  Resource.countDocuments({ status: { $in: ["RUNNING", "active"] } }),
  Anomaly.countDocuments({ resolved: false }),
  Action.aggregate([
    { $match: { status: "success" } },
    { $group: { _id: null, total: { $sum: "$savings_monthly_projected" } } },
  ]),
]);
```

---

## Seed Data for Testing

Run the seed script to populate test data:

```bash
cd server && npm run db:seed
```

This creates:
- 3 resources (VM, Cloud Function, orphan disk)
- 15 metric data points showing a VM going idle and a function spiking
- Clear patterns the ML service will detect as anomalies
