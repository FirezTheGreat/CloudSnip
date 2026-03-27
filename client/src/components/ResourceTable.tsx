import React from "react";
import type { Resource } from "../types";

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "#10b981",
  active: "#10b981",
  STOPPED: "#ef4444",
  STOPPING: "#f59e0b",
  TERMINATED: "#6b7280",
  attached: "#3b82f6",
  unattached: "#f97316",
  READY: "#eab308",
};

const TYPE_ICONS: Record<string, string> = {
  compute: "VM",
  cloud_function: "FN",
  gcs: "BUCKET",
  disk: "DISK",
  cloud_sql: "DB",
};

interface Props {
  resources: Resource[];
}

export function ResourceTable({ resources }: Props) {
  if (resources.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No resources discovered yet</p>
      </div>
    );
  }

  return (
    <div style={styles.tableContainer}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Type</th>
            <th style={styles.th}>Resource ID</th>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Cost/hr</th>
            <th style={styles.th}>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <tr key={r.resource_id} style={styles.tr}>
              <td style={styles.td}>
                <span style={styles.typeTag}>
                  {TYPE_ICONS[r.resource_type] || r.resource_type}
                </span>
              </td>
              <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 12 }}>
                {r.resource_id}
              </td>
              <td style={styles.td}>{r.name || "-"}</td>
              <td style={styles.td}>
                <span
                  style={{
                    ...styles.statusDot,
                    backgroundColor: STATUS_COLORS[r.status] || "#6b7280",
                  }}
                />
                {r.status}
              </td>
              <td style={styles.td}>
                {r.hourly_cost > 0 ? `$${r.hourly_cost.toFixed(4)}` : "-"}
              </td>
              <td style={{ ...styles.td, color: "#6b7280" }}>
                {new Date(r.last_seen).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: { textAlign: "center", padding: 40, color: "#9ca3af" },
  tableContainer: { overflowX: "auto" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    borderBottom: "2px solid #374151",
    color: "#9ca3af",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tr: { borderBottom: "1px solid #1f2937" },
  td: {
    padding: "10px 12px",
    color: "#e5e7eb",
  },
  typeTag: {
    padding: "2px 8px",
    backgroundColor: "#374151",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: "#d1d5db",
  },
  statusDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    marginRight: 6,
  },
};
