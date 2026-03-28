import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { AnomalyTimelinePoint } from "../types";
import { Activity } from "lucide-react";

function formatLabel(iso: string, hours: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (hours <= 48) {
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface Props {
  data: AnomalyTimelinePoint[];
  hours: number;
}

export function AnomalyTimelineChart({ data, hours }: Props) {
  const chartData = data.map((row) => ({
    label: formatLabel(row.bucket, hours),
    detected: row.detected,
    resolved: row.resolved,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[220px] text-slate-500 text-sm">
        <Activity className="w-8 h-8 opacity-30 mb-2" />
        <p>No anomaly history in this window yet.</p>
        <p className="text-[10px] mt-2 opacity-60 text-center max-w-sm">
          Detections and resolutions will appear here over time.
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} dy={10} />
        <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(17, 24, 39, 0.9)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            color: "#f8fafc",
            fontSize: 12,
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          }}
          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          itemStyle={{ color: "#e2e8f0" }}
          labelStyle={{ color: "#94a3b8", marginBottom: "8px", fontWeight: "bold" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#cbd5e1", paddingTop: "10px" }} />
        <Bar dataKey="detected" name="Detected" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        <Bar dataKey="resolved" name="Resolved" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
