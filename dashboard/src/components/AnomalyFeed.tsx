import React from "react";
import type { Anomaly, WebSocketMessage } from "../types";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#6b7280",
};

const ANOMALY_ICONS: Record<string, string> = {
  idle_instance: "IDLE",
  runaway_function: "SPIKE",
  cost_spike: "COST",
  unused_disk: "DISK",
  usage_anomaly: "WARN",
};

interface Props {
  anomalies: Anomaly[];
  wsMessages: WebSocketMessage[];
}

export function AnomalyFeed({ anomalies, wsMessages }: Props) {
  const recentWsAnomalies = wsMessages
    .filter((m) => m.type === "anomalies_detected")
    .slice(0, 5);

  return (
    <div style={styles.container}>
      {recentWsAnomalies.length > 0 && (
        <div style={styles.liveSection}>
          <div style={styles.liveIndicator}>
            <span style={styles.liveDot} />
            LIVE
          </div>
          {recentWsAnomalies.map((msg, i) => (
            <div key={`ws-${i}`} style={styles.liveCard}>
              {msg.data.count} new anomalies detected
            </div>
          ))}
        </div>
      )}

      {anomalies.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>No anomalies detected</p>
          <p style={styles.emptySubtext}>System is monitoring your resources</p>
        </div>
      ) : (
        <div style={styles.list}>
          {anomalies.map((a) => (
            <div key={a.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <span
                  style={{
                    ...styles.severityBadge,
                    backgroundColor: SEVERITY_COLORS[a.severity] || "#6b7280",
                  }}
                >
                  {a.severity.toUpperCase()}
                </span>
                <span style={styles.typeBadge}>
                  {ANOMALY_ICONS[a.anomaly_type] || "?"}{" "}
                  {a.anomaly_type.replace(/_/g, " ")}
                </span>
                <span style={styles.score}>
                  {(a.anomaly_score * 100).toFixed(0)}%
                </span>
              </div>

              <p style={styles.description}>{a.description}</p>

              <div style={styles.cardFooter}>
                <span style={styles.resourceId}>{a.resource_id}</span>
                <span style={styles.time}>
                  {new Date(a.detected_at).toLocaleTimeString()}
                </span>
              </div>

              {a.action_type && (
                <div
                  style={{
                    ...styles.actionTag,
                    borderColor:
                      a.action_status === "success" ? "#10b981" : "#ef4444",
                  }}
                >
                  {a.action_status === "success" ? "FIXED" : "FAILED"}:{" "}
                  {a.action_type.replace(/_/g, " ")}
                  {a.savings_monthly_projected
                    ? ` — $${a.savings_monthly_projected.toFixed(2)}/mo saved`
                    : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: 8 },
  liveSection: { marginBottom: 8 },
  liveIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "#ef4444",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#ef4444",
    display: "inline-block",
    animation: "pulse 1.5s infinite",
  },
  liveCard: {
    padding: "8px 12px",
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 6,
    color: "#fca5a5",
    fontSize: 13,
  },
  empty: {
    textAlign: "center",
    padding: 40,
    color: "#9ca3af",
  },
  emptyText: { fontSize: 16, margin: 0 },
  emptySubtext: { fontSize: 13, marginTop: 8, opacity: 0.7 },
  list: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" },
  card: {
    padding: "12px 14px",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    border: "1px solid #374151",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  severityBadge: {
    padding: "2px 8px",
    borderRadius: 4,
    color: "#fff",
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  typeBadge: {
    fontSize: 12,
    color: "#d1d5db",
    fontWeight: 500,
  },
  score: {
    marginLeft: "auto",
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: 600,
  },
  description: {
    margin: "4px 0 8px",
    fontSize: 13,
    color: "#e5e7eb",
    lineHeight: 1.4,
  },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: "#6b7280",
  },
  resourceId: { fontFamily: "monospace" },
  time: {},
  actionTag: {
    marginTop: 8,
    padding: "4px 8px",
    borderRadius: 4,
    border: "1px solid",
    fontSize: 11,
    fontWeight: 600,
    color: "#d1d5db",
  },
};
