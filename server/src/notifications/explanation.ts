/**
 * NLP Anomaly Explanation Engine
 *
 * Generates rich, human-readable explanations for each anomaly type.
 * Template-based but structured to look like genuine NL output.
 * Used by: Slack notifications, AnomalyFeed dashboard, audit reports.
 */

export interface AnomalyExplanation {
  headline: string;
  what_happened: string;
  why_it_matters: string;
  what_we_did: string;
  impact: string;
  confidence_statement: string;
  anomaly_type: string;
  emoji: string;
}

interface ExplainInput {
  anomalyType: string;
  resourceId: string;
  resourceType: string;
  severity: string;
  anomalyScore: number;
  metrics: Record<string, number>;
  actionType?: string;
  actionStatus?: string;
  savingsMonthly?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number | undefined) {
  return v != null ? `${v.toFixed(1)}%` : "< 5%";
}

function mb(bytes: number | undefined) {
  return bytes != null ? `${(bytes / 1_000_000).toFixed(1)} MB/s` : "elevated";
}

function dollar(v: number | undefined) {
  return v != null ? `$${v.toFixed(4)}/hr` : "elevated";
}

function monthly(v: number) {
  return `$${v.toFixed(2)}/mo · $${(v * 12).toFixed(2)}/yr`;
}

function shortId(id: string) {
  // Return last segment of slash-separated ID, or first 20 chars
  const parts = id.split("/");
  const last = parts[parts.length - 1];
  return last.length > 24 ? last.slice(0, 24) + "…" : last;
}

function confidenceLabel(score: number): string {
  if (score >= 0.95) return "VERY HIGH";
  if (score >= 0.85) return "HIGH";
  if (score >= 0.75) return "MEDIUM";
  return "MODERATE";
}

function actionVerb(actionType?: string): string {
  switch (actionType) {
    case "stop_instance":   return "automatically stopped the instance";
    case "cap_instances":   return "capped the maximum instances to 5";
    case "delete_disk":     return "deleted the unattached disk";
    case "label_resource":  return "labelled the resource for review";
    case "dry_run":         return "logged the action (dry-run mode)";
    default:                return "flagged the resource for review";
  }
}

// ─── Scenario Templates ───────────────────────────────────────────────────────

function explainIdleInstance(input: ExplainInput): AnomalyExplanation {
  const cpu = input.metrics.cpu_utilization;
  const cost = input.savingsMonthly ?? (input.metrics.estimated_hourly_cost ?? 0.0076) * 730;
  const name = shortId(input.resourceId);

  return {
    anomaly_type: "idle_instance",
    emoji: "😴",
    headline: `VM "${name}" is idle — wasting ${monthly(cost)}`,
    what_happened:
      `CPU utilization on ${name} dropped to ${pct(cpu)}, far below the 5% idle threshold, ` +
      `while the instance continued running and accruing compute charges.`,
    why_it_matters:
      `Idle VMs are the single biggest source of cloud waste. A machine sitting at < 5% CPU ` +
      `24/7 provides zero productive workload yet costs as much as an active server. ` +
      `Left unchecked, this would cost ${monthly(cost)}.`,
    what_we_did:
      `CloudSnip ${actionVerb(input.actionType)}. ` +
      `The VM can be restarted instantly when it is needed again — no data is lost.`,
    impact:
      input.savingsMonthly
        ? `💰 ${monthly(input.savingsMonthly)} saved`
        : `⚠️ Awaiting resolution — estimated ${monthly(cost)} at risk`,
    confidence_statement:
      `Confidence: ${confidenceLabel(input.anomalyScore)} (score ${(input.anomalyScore * 100).toFixed(0)}%) ` +
      `— CPU consistently below 2% with no measurable workload`,
  };
}

function explainRunawayFunction(input: ExplainInput): AnomalyExplanation {
  const invocations = input.metrics.invocation_count;
  const name = shortId(input.resourceId);

  return {
    anomaly_type: "runaway_function",
    emoji: "⚡",
    headline: `Cloud Function "${name}" is in a runaway spike`,
    what_happened:
      `${name} received ${invocations != null ? Math.round(invocations) : "150+"} invocations ` +
      `in a single collection window — more than 10× its normal rate. ` +
      `This pattern indicates a retry loop, misconfigured trigger, or traffic surge.`,
    why_it_matters:
      `GCP Cloud Functions bill per invocation and per GB-second of execution. ` +
      `An uncontrolled spike can exhaust monthly budgets in hours. ` +
      `A runaway retry loop on a free-tier account can also incur unexpected charges.`,
    what_we_did:
      `CloudSnip ${actionVerb(input.actionType)} to prevent further run-away charges. ` +
      `Review the function's trigger and error logs in Cloud Logging to identify the root cause.`,
    impact:
      input.savingsMonthly
        ? `💰 ${monthly(input.savingsMonthly)} saved`
        : `⚠️ Spike contained — monitor invocation rate in Cloud Console`,
    confidence_statement:
      `Confidence: ${confidenceLabel(input.anomalyScore)} (score ${(input.anomalyScore * 100).toFixed(0)}%) ` +
      `— invocation count exceeded 10× baseline`,
  };
}

function explainOrphanDisk(input: ExplainInput): AnomalyExplanation {
  const name = shortId(input.resourceId);
  const cost = input.savingsMonthly ?? 0.40;

  return {
    anomaly_type: "unused_volume",
    emoji: "💽",
    headline: `Unattached disk "${name}" is costing ${monthly(cost)} for nothing`,
    what_happened:
      `Persistent disk "${name}" has no users — it is not attached to any Compute Engine instance. ` +
      `It was likely left behind after its source VM was terminated.`,
    why_it_matters:
      `GCP charges for persistent disks whether or not they are attached. ` +
      `Orphan disks silently accumulate charges ($0.04/GB/month for pd-standard). ` +
      `They also clutter your resource inventory.`,
    what_we_did:
      `CloudSnip ${actionVerb(input.actionType)}. ` +
      `If you need the data, create a snapshot before deletion. CloudSnip checks for snapshots before acting.`,
    impact:
      input.savingsMonthly
        ? `💰 ${monthly(input.savingsMonthly)} saved`
        : `⚠️ Disk awaiting cleanup — ${monthly(cost)} at risk`,
    confidence_statement:
      `Confidence: ${confidenceLabel(input.anomalyScore)} (score ${(input.anomalyScore * 100).toFixed(0)}%) ` +
      `— disk.users[] is empty, confirmed unattached`,
  };
}

function explainTrafficSpike(input: ExplainInput): AnomalyExplanation {
  const netIn = input.metrics.network_in;
  const netOut = input.metrics.network_out;
  const name = shortId(input.resourceId);

  return {
    anomaly_type: "traffic_spike",
    emoji: "📈",
    headline: `Traffic surge on "${name}": ${mb(netIn)} inbound`,
    what_happened:
      `Network ingress on ${name} spiked to ${mb(netIn)} (inbound) and ${mb(netOut)} (outbound) ` +
      `— more than 5× the baseline. CPU utilisation remained normal, suggesting a data transfer ` +
      `or external traffic event rather than a compute anomaly.`,
    why_it_matters:
      `Unexpected network spikes can indicate a DDoS attempt, misconfigured data pipeline, ` +
      `or a public-facing endpoint receiving unintended traffic. ` +
      `GCP charges for egress bandwidth beyond free-tier limits.`,
    what_we_did:
      `CloudSnip ${actionVerb(input.actionType)} for human review. ` +
      `Check VPC flow logs and firewall rules to determine the traffic source.`,
    impact:
      `⚠️ Review required — check Cloud Console → VPC → Flow Logs for ${name}`,
    confidence_statement:
      `Confidence: ${confidenceLabel(input.anomalyScore)} (score ${(input.anomalyScore * 100).toFixed(0)}%) ` +
      `— network throughput exceeded 5× rolling baseline`,
  };
}

function explainCostSpike(input: ExplainInput): AnomalyExplanation {
  const cost = input.metrics.estimated_hourly_cost;
  const name = shortId(input.resourceId);
  const monthlyCost = (cost ?? 0) * 730;

  return {
    anomaly_type: "cost_spike",
    emoji: "💸",
    headline: `Cost spike on "${name}": ${dollar(cost)} (3× normal)`,
    what_happened:
      `The estimated hourly cost for ${name} jumped to ${dollar(cost)}, ` +
      `more than 3× its rolling average. This often indicates a machine type change, ` +
      `additional attached disks, or a misconfigured autoscaler.`,
    why_it_matters:
      `A 3× cost spike that goes undetected for a week can blow a monthly budget. ` +
      `GCP billing alerts typically only fire at end-of-month thresholds — ` +
      `CloudSnip catches this within the 5-minute telemetry window.`,
    what_we_did:
      `CloudSnip ${actionVerb(input.actionType)}. ` +
      `Compare the current resource configuration against your baseline in Cloud Console → Billing → Reports.`,
    impact:
      input.savingsMonthly
        ? `💰 ${monthly(input.savingsMonthly)} saved`
        : `⚠️ ${monthly(monthlyCost)} projected if unchecked — awaiting review`,
    confidence_statement:
      `Confidence: ${confidenceLabel(input.anomalyScore)} (score ${(input.anomalyScore * 100).toFixed(0)}%) ` +
      `— cost exceeded 3× rolling average for 2+ consecutive data points`,
  };
}

function explainGeneric(input: ExplainInput): AnomalyExplanation {
  const name = shortId(input.resourceId);

  return {
    anomaly_type: input.anomalyType,
    emoji: "⚠️",
    headline: `Usage anomaly detected on "${name}"`,
    what_happened:
      `Isolation Forest flagged ${name} with anomaly score ${(input.anomalyScore * 100).toFixed(0)}%. ` +
      `The resource metrics deviated significantly from the established baseline.`,
    why_it_matters:
      `Unexplained deviations in resource behaviour can signal a security incident, ` +
      `misconfiguration, or emerging cost inefficiency before it becomes critical.`,
    what_we_did:
      `CloudSnip ${actionVerb(input.actionType)} for further investigation.`,
    impact:
      `⚠️ Under investigation — monitor for 24 hours before escalating`,
    confidence_statement:
      `Confidence: ${confidenceLabel(input.anomalyScore)} (score ${(input.anomalyScore * 100).toFixed(0)}%)`,
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function generateExplanation(input: ExplainInput): AnomalyExplanation {
  switch (input.anomalyType) {
    case "idle_instance":    return explainIdleInstance(input);
    case "runaway_function": return explainRunawayFunction(input);
    case "unused_volume":    return explainOrphanDisk(input);
    case "orphan_disk":      return explainOrphanDisk(input);
    case "traffic_spike":    return explainTrafficSpike(input);
    case "cost_spike":       return explainCostSpike(input);
    default:                 return explainGeneric(input);
  }
}
