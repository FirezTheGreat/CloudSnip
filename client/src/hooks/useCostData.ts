import { useState, useEffect, useCallback } from "react";
import type {
  DashboardSummary,
  Anomaly,
  Action,
  SavingsSummary,
  Resource,
  CostTrend,
  Budget,
  Recommendation,
  ForecastPoint,
  CostByLabel,
  AnomalyTimelinePoint,
  SimulationHistory,
  HeatmapData,
  ComplianceData,
} from "../types";

/** Single state blob so hook count stays fixed (avoids HMR “invalid hook call” when fields are added). */
interface DashboardBundle {
  summary: DashboardSummary | null;
  anomalies: Anomaly[];
  actions: Action[];
  savings: SavingsSummary | null;
  resources: Resource[];
  costTrend: CostTrend[];
  budgets: Budget[];
  recommendations: Recommendation[];
  forecast: ForecastPoint[];
  costByLabel: CostByLabel[];
  anomalyTimeline: AnomalyTimelinePoint[];
  simulationHistory: SimulationHistory[];
  heatmap: HeatmapData | null;
  compliance: ComplianceData | null;
}

const emptyBundle: DashboardBundle = {
  summary: null,
  anomalies: [],
  actions: [],
  savings: null,
  resources: [],
  costTrend: [],
  budgets: [],
  recommendations: [],
  forecast: [],
  costByLabel: [],
  anomalyTimeline: [],
  simulationHistory: [],
  heatmap: null,
  compliance: null,
};

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

async function postJSON<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function useCostData(refreshInterval = 30000) {
  const [dash, setDash] = useState<DashboardBundle>(emptyBundle);
  const [loading, setLoading] = useState(true);
  const [trendHours, setTrendHours] = useState(24);

  const refresh = useCallback(async () => {
    const [sumRes, anomRes, actRes, savRes, resRes, costRes, budRes, recRes, fcRes, lblRes, atRes, simRes, hmRes, compRes] =
      await Promise.all([
        fetchJSON<DashboardSummary>("/dashboard/summary"),
        fetchJSON<{ data: Anomaly[] }>("/anomalies?limit=20"),
        fetchJSON<{ data: Action[] }>("/actions?limit=20"),
        fetchJSON<SavingsSummary>("/actions/savings"),
        fetchJSON<{ data: Resource[] }>("/dashboard/resources"),
        fetchJSON<{ data: CostTrend[] }>(`/costs/trend?hours=${trendHours}`),
        fetchJSON<{ data: Budget[] }>("/budgets"),
        fetchJSON<{ data: Recommendation[]; total_potential_savings: number }>("/recommendations"),
        fetchJSON<{ forecast: ForecastPoint[] }>("/costs/forecast"),
        fetchJSON<{ data: CostByLabel[] }>("/costs/by-label"),
        fetchJSON<{ data: AnomalyTimelinePoint[] }>(`/dashboard/anomaly-timeline?hours=${trendHours}`),
        fetchJSON<{ data: SimulationHistory[] }>("/simulation/history?limit=20"),
        fetchJSON<HeatmapData>("/anomalies/heatmap"),
        fetchJSON<ComplianceData>("/dashboard/compliance"),
      ]);

    setDash((prev) => ({
      ...prev,
      ...(sumRes ? { summary: sumRes } : {}),
      ...(anomRes?.data ? { anomalies: anomRes.data } : {}),
      ...(actRes?.data ? { actions: actRes.data } : {}),
      ...(savRes ? { savings: savRes } : {}),
      ...(resRes?.data ? { resources: resRes.data } : {}),
      ...(costRes?.data ? { costTrend: costRes.data } : {}),
      ...(budRes?.data ? { budgets: budRes.data } : {}),
      ...(recRes?.data ? { recommendations: recRes.data } : {}),
      ...(fcRes?.forecast ? { forecast: fcRes.forecast } : {}),
      ...(lblRes?.data ? { costByLabel: lblRes.data } : {}),
      ...(atRes?.data ? { anomalyTimeline: atRes.data } : {}),
      ...(simRes?.data ? { simulationHistory: simRes.data } : {}),
      ...(hmRes ? { heatmap: hmRes } : {}),
      ...(compRes ? { compliance: compRes } : {}),
    }));
    setLoading(false);
  }, [trendHours]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  const triggerScan = async () => {
    await postJSON("/dashboard/trigger-scan");
    setTimeout(refresh, 5000);
  };

  const approveAction = async (actionId: string) => {
    await postJSON(`/actions/${actionId}/approve`);
    setTimeout(refresh, 1000);
  };

  const rejectAction = async (actionId: string) => {
    await postJSON(`/actions/${actionId}/reject`);
    setTimeout(refresh, 1000);
  };

  const rollbackAction = async (actionId: string) => {
    await postJSON(`/actions/${actionId}/rollback`);
    setTimeout(refresh, 1000);
  };

  const createBudget = async (name: string, monthly_limit: number, resource_type = "all") => {
    await postJSON("/budgets", { name, monthly_limit, resource_type });
    setTimeout(refresh, 500);
  };

  const deleteBudget = async (id: string) => {
    await fetch(`${API}/budgets/${id}`, { method: "DELETE" });
    setTimeout(refresh, 500);
  };

  const triggerSimulation = async (scenario: string) => {
    const result = await postJSON<{ success: boolean }>("/simulation/trigger", { scenario });
    setTimeout(refresh, 3000);
    if (!result?.success) throw new Error("Trigger failed");
  };

  const runAutoSimulation = async () => {
    await postJSON("/simulation/auto");
    setTimeout(refresh, 3000);
  };

  const safe = <T>(v: T[] | undefined, fallback: T[] = []): T[] =>
    Array.isArray(v) ? v : fallback;

  return {
    summary: dash.summary,
    anomalies: safe(dash.anomalies),
    actions: safe(dash.actions),
    savings: dash.savings,
    resources: safe(dash.resources),
    costTrend: safe(dash.costTrend),
    budgets: safe(dash.budgets),
    recommendations: safe(dash.recommendations),
    forecast: safe(dash.forecast),
    costByLabel: safe(dash.costByLabel),
    anomalyTimeline: safe(dash.anomalyTimeline),
    simulationHistory: safe(dash.simulationHistory),
    heatmap: dash.heatmap,
    compliance: dash.compliance,
    loading,
    trendHours,
    setTrendHours,
    refresh,
    triggerScan,
    approveAction,
    rejectAction,
    rollbackAction,
    createBudget,
    deleteBudget,
    triggerSimulation,
    runAutoSimulation,
  };
}
