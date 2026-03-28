export interface DashboardSummary {
  total_resources: number;
  active_resources: number;
  open_anomalies: number;
  anomalies_24h: number;
  total_monthly_savings: number;
  total_hourly_savings: number;
  actions_taken: number;
  current_hourly_cost: number;
  /** Project id from server env when inventory runs — one connected account per deployment. */
  connected_gcp_project?: string | null;
}

export interface AnomalyTimelinePoint {
  bucket: string;
  detected: number;
  resolved: number;
}

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

export interface Anomaly {
  id: string;
  detected_at: string;
  resource_id: string;
  resource_type: string;
  anomaly_type: string;
  severity: "low" | "medium" | "high" | "critical";
  anomaly_score: number;
  metric_snapshot: Record<string, number>;
  description: string;
  explanation: AnomalyExplanation | null;
  resolved: boolean;
  resolved_at: string | null;
  action_type: string | null;
  action_status: string | null;
  savings_monthly_projected: number | null;
}

export interface Action {
  id: string;
  executed_at: string;
  anomaly_id: string | null;
  resource_id: string;
  resource_type: string;
  action_type: string;
  status: string;
  cost_before_hourly: number;
  cost_after_hourly: number;
  savings_hourly: number;
  savings_monthly_projected: number;
  details: Record<string, any>;
  dry_run: boolean;
  can_rollback?: boolean;
  can_approve?: boolean;
}

export interface SavingsSummary {
  summary: {
    total_hourly: number;
    total_monthly: number;
    total_actions: number;
    successful: number;
    failed: number;
    pending?: number;
    rolled_back?: number;
  };
  byType: Array<{
    action_type: string;
    count: number;
    savings: number;
  }>;
}

export interface Resource {
  resource_id: string;
  resource_type: string;
  name: string;
  status: string;
  region: string;
  hourly_cost: number;
  last_seen: string;
  metadata: Record<string, any>;
}

export interface CostTrend {
  hour: string;
  resource_type: string;
  avg_value: number;
  total_value: number;
}

export interface WebSocketMessage {
  type: string;
  data?: unknown;
  message?: string;
}

export interface Budget {
  id: string;
  name: string;
  resource_type: string;
  monthly_limit: number;
  current_spend: number;
  percent_used: number;
  alert_thresholds: number[];
  alerts_sent: number[];
  last_checked: string;
  created_at: string;
}

export interface Recommendation {
  id: string;
  type: string;
  resource_id: string;
  resource_name: string;
  resource_type: string;
  current_config: string;
  recommended_config: string;
  reason: string;
  estimated_monthly_savings: number;
  confidence: "low" | "medium" | "high";
}

export interface ForecastPoint {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface CostByLabel {
  label: string;
  monthly_cost: number;
  count: number;
}

export interface SimulationHistory {
  _id: string;
  triggered_at: string;
  scenario: string;
  resource_id: string;
  resource_name?: string;
  injected_points: number;
  gcp_action_taken: boolean;
  description: string;
  triggered_by: "auto" | "manual";
}

export interface HeatmapCell {
  day: string;
  day_index: number;
  hour: number;
  count: number;
  types: string[];
}

export interface HeatmapData {
  cells: HeatmapCell[];
  max_count: number;
  period_days: number;
}

export interface RiskItem {
  type: string;
  severity: string;
  resource_id: string;
  resource_name?: string;
  resource_type: string;
  issue: string;
  monthly_cost: number;
}

export interface ActionAudit {
  executed_at: string;
  resource_id: string;
  resource_type: string;
  action_type: string;
  status: string;
  savings_monthly?: number;
  dry_run: boolean;
}

export interface ActionByType {
  action_type: string;
  count: number;
  total_monthly_savings: number;
}

export interface ComplianceData {
  generated_at: string;
  monitoring_period_days: number;
  compliance_score: number;
  summary: {
    total_resources: number;
    compliant_resources: number;
    risk_items: number;
    total_risk_monthly_cost: number;
    total_saved_30d: number;
    actions_taken_30d: number;
    open_anomalies: number;
  };
  risk_items: RiskItem[];
  actions_audit: ActionAudit[];
  actions_by_type: ActionByType[];
}
