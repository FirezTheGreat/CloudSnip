export interface DashboardSummary {
  total_resources: number;
  active_resources: number;
  open_anomalies: number;
  anomalies_24h: number;
  total_monthly_savings: number;
  total_hourly_savings: number;
  actions_taken: number;
  current_hourly_cost: number;
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
  resolved: boolean;
  resolved_at: string | null;
  action_type: string | null;
  action_status: string | null;
  savings_monthly_projected: number | null;
}

export interface Action {
  id: string;
  executed_at: string;
  anomaly_id: string;
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
}

export interface SavingsSummary {
  summary: {
    total_hourly: number;
    total_monthly: number;
    total_actions: number;
    successful: number;
    failed: number;
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
  data: any;
}
