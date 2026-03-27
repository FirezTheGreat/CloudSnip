import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CostTrend } from "../types";

const COLORS: Record<string, string> = {
  compute: "#3b82f6",
  cloud_function: "#8b5cf6",
  gcs: "#10b981",
  disk: "#f59e0b",
  cloud_sql: "#ef4444",
};

const LABELS: Record<string, string> = {
  compute: "Compute",
  cloud_function: "Functions",
  gcs: "Storage",
  disk: "Disks",
  cloud_sql: "Cloud SQL",
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
      <div className="flex flex-col items-center justify-center h-[300px] text-slate-500">
        <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        <p className="text-sm font-medium">No cost data yet</p>
        <p className="text-xs mt-1 opacity-60">Data will appear after the first collection cycle</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        {resourceTypes.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLORS[type] || "#6b7280" }}
            />
            <span className="text-xs text-slate-400 font-medium">
              {LABELS[type] || type}
            </span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="hour" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a2332",
              border: "1px solid #1e293b",
              borderRadius: "10px",
              color: "#e2e8f0",
              fontSize: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          />
          {resourceTypes.map((type) => (
            <Line
              key={type}
              type="monotone"
              dataKey={type}
              stroke={COLORS[type] || "#6b7280"}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              name={LABELS[type] || type}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
