import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { CostTrend } from "../types";

const COLORS: Record<string, string> = {
  ec2: "#3b82f6",
  lambda: "#8b5cf6",
  s3: "#10b981",
  ebs: "#f59e0b",
  rds: "#ef4444",
};

interface Props {
  data: CostTrend[];
}

export function CostTrendChart({ data }: Props) {
  const resourceTypes = [...new Set(data.map((d) => d.resource_type))];

  const grouped: Record<string, Record<string, number>> = {};
  for (const point of data) {
    const hour = new Date(point.hour).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (!grouped[hour]) grouped[hour] = { hour };
    grouped[hour][point.resource_type] = point.avg_value;
  }

  const chartData = Object.values(grouped);

  if (chartData.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={styles.emptyText}>No cost data yet</p>
        <p style={styles.emptySubtext}>Data will appear after the first collection cycle</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="hour" stroke="#9ca3af" fontSize={12} />
        <YAxis stroke="#9ca3af" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "8px",
            color: "#f3f4f6",
          }}
        />
        <Legend />
        {resourceTypes.map((type) => (
          <Line
            key={type}
            type="monotone"
            dataKey={type}
            stroke={COLORS[type] || "#6b7280"}
            strokeWidth={2}
            dot={{ r: 3 }}
            name={type.toUpperCase()}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

const styles = {
  empty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: 300,
    color: "#9ca3af",
  },
  emptyText: { fontSize: 18, margin: 0 },
  emptySubtext: { fontSize: 14, marginTop: 8, opacity: 0.7 },
};
