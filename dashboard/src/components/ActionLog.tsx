import React from "react";
import type { Action } from "../types";

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  success: { color: "#10b981", fontWeight: 700 },
  failed: { color: "#ef4444", fontWeight: 700 },
  pending: { color: "#eab308", fontWeight: 700 },
  executing: { color: "#3b82f6", fontWeight: 700 },
};

interface Props {
  actions: Action[];
}

export function ActionLog({ actions }: Props) {
  if (actions.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No actions executed yet</p>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {actions.map((a) => (
        <div key={a.id} style={styles.card}>
          <div style={styles.header}>
            <span style={STATUS_STYLES[a.status] || { color: "#9ca3af" }}>
              {a.status.toUpperCase()}
            </span>
            <span style={styles.actionType}>
              {a.action_type.replace(/_/g, " ")}
            </span>
            <span style={styles.time}>
              {new Date(a.executed_at).toLocaleString()}
            </span>
            {a.dry_run && <span style={styles.dryRun}>DRY RUN</span>}
          </div>

          <div style={styles.details}>
            <span style={styles.resource}>{a.resource_id}</span>
            {a.savings_hourly > 0 && (
              <span style={styles.savings}>
                ${a.cost_before_hourly?.toFixed(4)}/hr → ${a.cost_after_hourly?.toFixed(4)}/hr
                <strong style={{ color: "#10b981", marginLeft: 8 }}>
                  saves ${a.savings_monthly_projected?.toFixed(2)}/mo
                </strong>
              </span>
            )}
          </div>

          {a.details?.message && (
            <p style={styles.message}>{a.details.message}</p>
          )}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: { textAlign: "center", padding: 40, color: "#9ca3af" },
  list: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" },
  card: {
    padding: "12px 14px",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    border: "1px solid #374151",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
    fontSize: 12,
  },
  actionType: {
    color: "#d1d5db",
    fontWeight: 500,
    textTransform: "capitalize",
  },
  time: { marginLeft: "auto", color: "#6b7280", fontSize: 11 },
  dryRun: {
    padding: "1px 6px",
    backgroundColor: "#854d0e",
    color: "#fef08a",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
  },
  details: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 12,
    color: "#9ca3af",
    flexWrap: "wrap",
  },
  resource: { fontFamily: "monospace" },
  savings: { fontSize: 12 },
  message: {
    margin: "6px 0 0",
    fontSize: 12,
    color: "#9ca3af",
    fontStyle: "italic",
  },
};
