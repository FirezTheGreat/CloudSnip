import { useState, useEffect, useCallback } from "react";
import type {
  DashboardSummary,
  Anomaly,
  Action,
  SavingsSummary,
  Resource,
  CostTrend,
} from "../types";

const API = "/api";

async function fetchJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function useCostData(refreshInterval = 30000) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [costTrend, setCostTrend] = useState<CostTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [sumRes, anomRes, actRes, savRes, resRes, costRes] = await Promise.all([
      fetchJSON<DashboardSummary>("/dashboard/summary"),
      fetchJSON<{ data: Anomaly[] }>("/anomalies?limit=20"),
      fetchJSON<{ data: Action[] }>("/actions?limit=20"),
      fetchJSON<SavingsSummary>("/actions/savings"),
      fetchJSON<{ data: Resource[] }>("/dashboard/resources"),
      fetchJSON<{ data: CostTrend[] }>("/costs/trend"),
    ]);

    if (sumRes) setSummary(sumRes);
    if (anomRes) setAnomalies(anomRes.data);
    if (actRes) setActions(actRes.data);
    if (savRes) setSavings(savRes);
    if (resRes) setResources(resRes.data);
    if (costRes) setCostTrend(costRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  const triggerScan = async () => {
    await fetch(`${API}/dashboard/trigger-scan`, { method: "POST" });
    setTimeout(refresh, 5000);
  };

  return {
    summary,
    anomalies,
    actions,
    savings,
    resources,
    costTrend,
    loading,
    refresh,
    triggerScan,
  };
}
