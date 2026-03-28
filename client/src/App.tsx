import { useState } from "react";
import { useCostData } from "./hooks/useCostData";
import { useWebSocket } from "./hooks/useWebSocket";
import { useCountUp } from "./hooks/useCountUp";
import { CostTrendChart } from "./components/CostTrendChart";
import { AnomalyTimelineChart } from "./components/AnomalyTimelineChart";
import { AnomalyFeed } from "./components/AnomalyFeed";
import { SavingsTracker } from "./components/SavingsTracker";
import { ResourceTable } from "./components/ResourceTable";
import { ActionLog } from "./components/ActionLog";
import { BudgetWidget } from "./components/BudgetWidget";
import { Recommendations } from "./components/Recommendations";
import { CostAllocationChart } from "./components/CostAllocationChart";
import { ResourceDrawer } from "./components/ResourceDrawer";
import { ToastContainer } from "./components/ToastContainer";
import { SimulationControl } from "./components/SimulationControl";
import { AnomalyHeatmap } from "./components/AnomalyHeatmap";
import { WhatIfSimulator } from "./components/WhatIfSimulator";
import { ComplianceReport } from "./components/ComplianceReport";
import { PipelineHealthIndicator } from "./components/PipelineHealthIndicator";
import { PanelErrorBoundary } from "./components/PanelErrorBoundary";
import {
  SkeletonStatCard,
  SkeletonChart,
  SkeletonAnomalyCard,
  SkeletonTable,
  SkeletonHeatmap,
  SkeletonSimulationPanel,
} from "./components/SkeletonLoader";
import type { Resource } from "./types";

export default function App() {
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [showForecast, setShowForecast] = useState(false);

  const {
    summary,
    anomalies,
    actions,
    savings,
    resources,
    costTrend,
    budgets,
    recommendations,
    forecast,
    costByLabel,
    anomalyTimeline,
    simulationHistory,
    heatmap,
    compliance,
    loading,
    trendHours,
    setTrendHours,
    triggerScan,
    approveAction,
    rejectAction,
    rollbackAction,
    createBudget,
    deleteBudget,
    triggerSimulation,
    runAutoSimulation,
  } = useCostData();
  const { connected, messages } = useWebSocket();

  // Track when data was last refreshed for the "X min ago" footer
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  // Increment a counter when loading transitions false→true to restart countUp
  const pendingCount = (actions ?? []).filter((a) => a.status === "pending_approval").length;

  // Refresh timestamp update: when loading transitions false, mark now
  const [prevLoading, setPrevLoading] = useState(true);
  if (!loading && prevLoading) {
    setLastRefreshed(new Date());
    setPrevLoading(false);
  } else if (loading && !prevLoading) {
    setPrevLoading(true);
  }

  return (
    <div className="min-h-screen bg-surface text-slate-800">
      <div className="fixed left-0 top-0 bottom-0 w-0.5 bg-linear-to-b from-accent via-info to-success" />

      <ToastContainer wsMessages={messages} />

      <div className="px-6 py-8 max-w-[1600px] mx-auto space-y-6">
        <header className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-linear-to-br from-accent to-success flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                CloudSnip
              </h1>
            </div>
            <p className="text-sm text-slate-500 ml-11">
              Real-time cost intelligence &middot; ML anomaly detection &middot; Auto-optimization
            </p>
            {summary?.connected_gcp_project && (
              <p className="text-xs text-slate-600 ml-11 mt-1 font-mono">
                Connected GCP project: {summary.connected_gcp_project}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Pipeline health — shows ML status, last scan, countdown */}
            <PipelineHealthIndicator />

            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 animate-pulse-live">
                <span className="w-2 h-2 rounded-full bg-info" />
                <span className="text-xs font-bold text-info">{pendingCount} pending</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-raised border border-border">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-success animate-pulse-live" : "bg-danger"}`} />
              <span className="text-xs font-medium text-slate-600">
                {connected ? "Live" : "Offline"}
              </span>
            </div>
            <button
              onClick={triggerScan}
              className="px-4 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-muted rounded-lg transition-colors cursor-pointer"
            >
              Trigger Scan
            </button>
          </div>
        </header>

        {/* Stat Cards - skeletons while loading */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 ">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonStatCard key={i} />)}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 ">
            <StatCard label="Resources"     value={summary.active_resources}                                  icon={<IconServer />} />
            <StatCard label="Open Anomalies" value={summary.open_anomalies} variant={summary.open_anomalies > 0 ? "danger" : "default"} icon={<IconAlert />} />
            <StatCard label="Current Cost"  value={`$${Number(summary.current_hourly_cost).toFixed(4)}/hr`}  icon={<IconDollar />} />
            <StatCard label="Monthly Savings" value={`$${Number(summary.total_monthly_savings).toFixed(2)}`} variant="success" icon={<IconTrendUp />} />
            <StatCard label="Actions Taken" value={summary.actions_taken}                                    icon={<IconCheck />} />
            <StatCard label="Est. Monthly"  value={`$${(Number(summary.current_hourly_cost) * 730).toFixed(2)}`} icon={<IconCalendar />} />
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-4 ">
          <Panel title="Cost Trends" subtitle={`Last ${trendHours}h · estimated $/hr by type + fleet total`} className="col-span-2">
            <PanelErrorBoundary label="Cost Trends">
              {loading ? <SkeletonChart /> : <CostTrendChart data={costTrend} forecast={forecast} hours={trendHours} onHoursChange={setTrendHours} showForecast={showForecast} onToggleForecast={() => setShowForecast(!showForecast)} />}
            </PanelErrorBoundary>
          </Panel>
          <Panel title="Anomaly Feed" subtitle="Live detections">
            <PanelErrorBoundary label="Anomaly Feed">
              {loading
                ? <div className="flex flex-col gap-2">{Array.from({length: 3}).map((_, i) => <SkeletonAnomalyCard key={i} />)}</div>
                : <AnomalyFeed anomalies={anomalies} wsMessages={messages} />}
            </PanelErrorBoundary>
          </Panel>
        </div>

        <div className="grid grid-cols-2 gap-4 ">
          <Panel title="Simulation Control" subtitle="Trigger anomalies to demo the full pipeline">
            <PanelErrorBoundary label="Simulation Control">
              {loading ? <SkeletonSimulationPanel /> : <SimulationControl simulationHistory={simulationHistory} onTrigger={triggerSimulation} onAutoRun={runAutoSimulation} />}
            </PanelErrorBoundary>
          </Panel>
          <Panel title="Anomaly Timeline" subtitle={`Detected vs resolved · ${trendHours}h window`}>
            <PanelErrorBoundary label="Anomaly Timeline">
              {loading ? <SkeletonChart height={200} lines={2} /> : <AnomalyTimelineChart data={anomalyTimeline} hours={trendHours} />}
            </PanelErrorBoundary>
          </Panel>
        </div>

        <div className="grid grid-cols-3 gap-4 ">
          <Panel title="Savings Tracker" subtitle="Optimization impact" className="col-span-2">
            <PanelErrorBoundary label="Savings Tracker">
              {loading ? <SkeletonChart height={200} lines={3} /> : <SavingsTracker savings={savings} actions={actions} />}
            </PanelErrorBoundary>
          </Panel>
          <Panel title="Action Log" subtitle="Audit trail">
            <PanelErrorBoundary label="Action Log">
              {loading ? <SkeletonTable rows={5} /> : <ActionLog actions={actions} onApprove={approveAction} onReject={rejectAction} onRollback={rollbackAction} />}
            </PanelErrorBoundary>
          </Panel>
        </div>

        {/* Row 4: Heatmap + What-If Simulator */}
        <div className="grid grid-cols-5 gap-4 ">
          <Panel title="Anomaly Heatmap" subtitle="Anomaly frequency by day × hour (last 7 days)" className="col-span-3">
            <PanelErrorBoundary label="Anomaly Heatmap">
              {loading || !heatmap ? <SkeletonHeatmap /> : <AnomalyHeatmap cells={heatmap.cells} maxCount={heatmap.max_count} />}
            </PanelErrorBoundary>
          </Panel>
          <Panel title="What-If Simulator" subtitle="Project cost impact of configuration changes" className="col-span-2">
            <PanelErrorBoundary label="What-If Simulator">
              <WhatIfSimulator resources={resources} />
            </PanelErrorBoundary>
          </Panel>
        </div>

        {/* Row 5: Compliance + Cost Allocation */}
        <div className="grid grid-cols-3 gap-4 ">
          <Panel title="Compliance Report" subtitle="Governance snapshot · 30-day audit" className="col-span-2">
            <PanelErrorBoundary label="Compliance Report">
              <ComplianceReport data={compliance} loading={loading} />
            </PanelErrorBoundary>
          </Panel>
          <Panel title="Cost Allocation" subtitle="By GCP labels">
            <PanelErrorBoundary label="Cost Allocation">
              {loading ? <SkeletonChart height={200} lines={1} /> : <CostAllocationChart data={costByLabel} />}
            </PanelErrorBoundary>
          </Panel>
        </div>

        <div className="grid grid-cols-2 gap-4 ">
          <Panel title="Budget Alerts" subtitle="Spending guardrails">
            <PanelErrorBoundary label="Budget Alerts">
              {loading ? <SkeletonTable rows={3} cols={3} /> : <BudgetWidget budgets={budgets} onCreateBudget={createBudget} onDeleteBudget={deleteBudget} />}
            </PanelErrorBoundary>
          </Panel>
          <Panel title="Recommendations" subtitle="AI-powered savings">
            <PanelErrorBoundary label="Recommendations">
              {loading ? <SkeletonTable rows={4} /> : <Recommendations recommendations={recommendations} />}
            </PanelErrorBoundary>
          </Panel>
        </div>

        <Panel title="Resource Inventory" subtitle="Click a resource for details">
          <PanelErrorBoundary label="Resource Inventory">
            {loading ? <SkeletonTable rows={6} cols={6} /> : <ResourceTable resources={resources} onSelectResource={setSelectedResource} />}
          </PanelErrorBoundary>
        </Panel>

        {/* Last refreshed footer */}
        <div className="text-center py-4">
          <p className="text-[10px] text-slate-700">
            {loading
              ? "Loading data…"
              : `Data refreshed at ${lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · CloudSnip Cloud Cost Intelligence`}
          </p>
        </div>
      </div>

      {selectedResource && (
        <ResourceDrawer
          resource={selectedResource}
          anomalies={anomalies}
          actions={actions}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
}

function IconServer() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  );
}
function IconDollar() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
    </svg>
  );
}
function IconTrendUp() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  variant = "default",
  icon,
}: {
  label: string;
  value: string | number;
  variant?: "default" | "success" | "danger";
  icon?: React.ReactNode;
}) {
  const valueColors = {
    default: "text-slate-900",
    success: "text-success",
    danger: "text-danger",
  };
  const iconBgColors = {
    default: "bg-slate-100",
    success: "bg-emerald-50",
    danger: "bg-red-50",
  };
  const iconTextColors = {
    default: "text-slate-600",
    success: "text-success",
    danger: "text-danger",
  };

  // Animate numeric values; pass string values through unchanged
  const numericTarget = typeof value === "number" ? value : null;
  const animated = useCountUp(numericTarget ?? 0, 600);

  return (
    <div className="flex items-center gap-4 p-5 bg-surface-raised rounded-2xl shadow-sm border border-border hover:shadow-md hover:border-border-subtle transition-all duration-300">
      <div className={`w-9 h-9 rounded-lg ${iconBgColors[variant]} ${iconTextColors[variant]} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-lg font-bold ${valueColors[variant]} truncate tabular-nums`}>
          {numericTarget !== null ? animated : value}
        </p>
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface-raised rounded-2xl shadow-sm border border-border p-6 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-6 pb-4 border-b border-border-subtle">
        <h3 className="text-base font-bold text-slate-800 tracking-tight">{title}</h3>
        {subtitle && <span className="text-sm text-slate-500">{subtitle}</span>}
      </div>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
