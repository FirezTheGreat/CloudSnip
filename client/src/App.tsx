import React from "react";
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
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Cloud Cost Intelligence</h1>
          <p style={styles.subtitle}>
            Real-time monitoring, anomaly detection & auto-optimization
          </p>
        </div>
        <div style={styles.headerRight}>
          <span
            style={{
              ...styles.statusDot,
              backgroundColor: connected ? "#10b981" : "#ef4444",
            }}
          />
          <span style={styles.statusText}>
            {connected ? "Live" : "Disconnected"}
          </span>
          <button style={styles.scanButton} onClick={triggerScan}>
            Trigger Scan
          </button>
        </div>
      </header>

      {summary && (
        <div style={styles.statsBar}>
          <StatCard label="Resources" value={summary.active_resources} />
          <StatCard
            label="Open Anomalies"
            value={summary.open_anomalies}
            color={summary.open_anomalies > 0 ? "#ef4444" : undefined}
          />
          <StatCard
            label="Current Cost"
            value={`$${Number(summary.current_hourly_cost).toFixed(4)}/hr`}
          />
          <StatCard
            label="Monthly Savings"
            value={`$${Number(summary.total_monthly_savings).toFixed(2)}`}
            color="#10b981"
          />
          <StatCard label="Actions Taken" value={summary.actions_taken} />
        </div>
      )}

      <div style={styles.grid}>
        <Panel title="Cost Trends (24h)" span={2}>
          <CostTrendChart data={costTrend} />
        </Panel>

        <Panel title="Anomaly Feed">
          <AnomalyFeed anomalies={anomalies} wsMessages={messages} />
        </Panel>
      </div>

      <div style={styles.grid}>
        <Panel title="Savings Tracker" span={2}>
          <SavingsTracker savings={savings} actions={actions} />
        </Panel>

        <Panel title="Action Log">
          <ActionLog actions={actions} />
        </Panel>
      </div>

      <Panel title="Resource Inventory">
        <ResourceTable resources={resources} />
      </Panel>

      {loading && (
        <div style={styles.loadingOverlay}>
          <p style={styles.loadingText}>Loading dashboard...</p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div style={styles.statCard}>
      <span style={{ ...styles.statValue, color: color || "#f3f4f6" }}>
        {value}
      </span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function Panel({
  title,
  children,
  span,
}: {
  title: string;
  children: React.ReactNode;
  span?: number;
}) {
  return (
    <div style={{ ...styles.panel, gridColumn: span ? `span ${span}` : undefined }}>
      <h3 style={styles.panelTitle}>{title}</h3>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: "100vh",
    backgroundColor: "#111827",
    color: "#f3f4f6",
    fontFamily: "'Inter', -apple-system, sans-serif",
    padding: "24px 32px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: "1px solid #1f2937",
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    background: "linear-gradient(135deg, #3b82f6, #10b981)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 14,
    color: "#6b7280",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
  },
  statusText: { fontSize: 13, color: "#9ca3af" },
  scanButton: {
    padding: "8px 16px",
    backgroundColor: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  statsBar: {
    display: "flex",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    padding: "16px 20px",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    border: "1px solid #374151",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
  },
  statLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 16,
    marginBottom: 16,
  },
  panel: {
    padding: "20px",
    backgroundColor: "#111827",
    borderRadius: 10,
    border: "1px solid #1f2937",
  },
  panelTitle: {
    margin: "0 0 16px",
    fontSize: 16,
    fontWeight: 600,
    color: "#d1d5db",
  },
  loadingOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(17,24,39,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  loadingText: {
    fontSize: 18,
    color: "#9ca3af",
  },
};
