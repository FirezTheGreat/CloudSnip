import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SavingsSummary, Action } from "../types";

interface Props {
  savings: SavingsSummary | null;
  actions: Action[];
}

const ACTION_LABELS: Record<string, string> = {
  stop_instance: "Stop VM",
  cap_instances: "Cap Function",
  delete_disk: "Del Disk",
  label_resource: "Label Resource",
};

export function SavingsTracker({ savings, actions }: Props) {
  const totalMonthly = savings?.summary.total_monthly || 0;
  const totalHourly = savings?.summary.total_hourly || 0;
  const successCount = savings?.summary.successful || 0;

  const chartData =
    savings?.byType.map((b) => ({
      name: ACTION_LABELS[b.action_type] || b.action_type,
      savings: Number(b.savings.toFixed(2)),
      count: b.count,
    })) || [];

  const recentActions = actions.filter((a) => a.status === "success").slice(0, 5);

  return (
    <div style={styles.container}>
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statValue}>${totalMonthly.toFixed(2)}</span>
          <span style={styles.statLabel}>Monthly Savings</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statValue}>${totalHourly.toFixed(4)}</span>
          <span style={styles.statLabel}>Hourly Savings</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statValue}>{successCount}</span>
          <span style={styles.statLabel}>Actions Taken</span>
        </div>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
            <YAxis
              stroke="#9ca3af"
              fontSize={12}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: 8,
                color: "#f3f4f6",
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, "Monthly Savings"]}
            />
            <Bar dataKey="savings" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell
                  key={i}
                  fill={["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"][i % 4]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div style={styles.empty}>
          <p>No savings recorded yet</p>
        </div>
      )}

      {recentActions.length > 0 && (
        <div style={styles.actionList}>
          <h4 style={styles.actionListTitle}>Recent Actions</h4>
          {recentActions.map((a) => (
            <div key={a.id} style={styles.actionItem}>
              <span style={styles.actionType}>
                {ACTION_LABELS[a.action_type] || a.action_type}
              </span>
              <span style={styles.actionResource}>{a.resource_id}</span>
              <span style={styles.actionSavings}>
                ${a.cost_before_hourly?.toFixed(4)}/hr →
                ${a.cost_after_hourly?.toFixed(4)}/hr
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: 16 },
  statsRow: { display: "flex", gap: 12 },
  statCard: {
    flex: 1,
    padding: "16px",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    border: "1px solid #374151",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: "#10b981",
  },
  statLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
  },
  empty: {
    textAlign: "center",
    padding: 40,
    color: "#9ca3af",
    fontSize: 14,
  },
  actionList: { marginTop: 8 },
  actionListTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#d1d5db",
    margin: "0 0 8px",
  },
  actionItem: {
    display: "flex",
    gap: 12,
    padding: "6px 0",
    borderBottom: "1px solid #374151",
    fontSize: 12,
    color: "#9ca3af",
    alignItems: "center",
  },
  actionType: { fontWeight: 600, color: "#d1d5db", minWidth: 90 },
  actionResource: { fontFamily: "monospace", flex: 1 },
  actionSavings: { color: "#10b981" },
};
