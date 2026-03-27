import { useCostData } from "./hooks/useCostData";
import { useWebSocket } from "./hooks/useWebSocket";
import { CostTrendChart } from "./components/CostTrendChart";
import { AnomalyFeed } from "./components/AnomalyFeed";
import { SavingsTracker } from "./components/SavingsTracker";
import { ResourceTable } from "./components/ResourceTable";
import { ActionLog } from "./components/ActionLog";

export default function App() {
  const {
    summary,
    anomalies,
    actions,
    savings,
    resources,
    costTrend,
    loading,
    triggerScan,
  } = useCostData();
  const { connected, messages } = useWebSocket();

  return (
    <div className="min-h-screen bg-surface text-slate-200">
      {/* Sidebar accent line */}
      <div className="fixed left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-accent via-info to-success" />

      <div className="pl-6 pr-6 py-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-success flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                CloudSnip
              </h1>
            </div>
            <p className="text-sm text-slate-500 ml-11">
              Real-time cost intelligence &middot; Anomaly detection &middot; Auto-optimization
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-raised border border-border">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? "bg-success animate-pulse-live" : "bg-danger"
                }`}
              />
              <span className="text-xs font-medium text-slate-400">
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

        {/* Stat Cards */}
        {summary && (
          <div className="grid grid-cols-5 gap-3 mb-6">
            <StatCard
              label="Resources"
              value={summary.active_resources}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
              }
            />
            <StatCard
              label="Open Anomalies"
              value={summary.open_anomalies}
              variant={summary.open_anomalies > 0 ? "danger" : "default"}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              }
            />
            <StatCard
              label="Current Cost"
              value={`$${Number(summary.current_hourly_cost).toFixed(4)}/hr`}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              }
            />
            <StatCard
              label="Monthly Savings"
              value={`$${Number(summary.total_monthly_savings).toFixed(2)}`}
              variant="success"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              }
            />
            <StatCard
              label="Actions Taken"
              value={summary.actions_taken}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Panel title="Cost Trends" subtitle="Last 24 hours" className="col-span-2">
            <CostTrendChart data={costTrend} />
          </Panel>

          <Panel title="Anomaly Feed" subtitle="Live detections">
            <AnomalyFeed anomalies={anomalies} wsMessages={messages} />
          </Panel>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <Panel title="Savings Tracker" subtitle="Optimization impact" className="col-span-2">
            <SavingsTracker savings={savings} actions={actions} />
          </Panel>

          <Panel title="Action Log" subtitle="Audit trail">
            <ActionLog actions={actions} />
          </Panel>
        </div>

        <Panel title="Resource Inventory" subtitle="All monitored GCP resources">
          <ResourceTable resources={resources} />
        </Panel>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading dashboard...</p>
          </div>
        </div>
      )}
    </div>
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
    default: "text-white",
    success: "text-success",
    danger: "text-danger",
  };

  const iconBgColors = {
    default: "bg-slate-800",
    success: "bg-emerald-950",
    danger: "bg-red-950",
  };

  const iconTextColors = {
    default: "text-slate-400",
    success: "text-success",
    danger: "text-danger",
  };

  return (
    <div className="flex items-center gap-3 p-4 bg-surface-raised rounded-xl border border-border hover:border-border-subtle transition-colors">
      <div className={`w-9 h-9 rounded-lg ${iconBgColors[variant]} ${iconTextColors[variant]} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-lg font-bold ${valueColors[variant]} truncate`}>
          {value}
        </p>
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
          {label}
        </p>
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
    <div className={`bg-surface-raised rounded-xl border border-border p-5 ${className}`}>
      <div className="flex items-baseline gap-2 mb-4">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {subtitle && (
          <span className="text-xs text-slate-500">{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}
