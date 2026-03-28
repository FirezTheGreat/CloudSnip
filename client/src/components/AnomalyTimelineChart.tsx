import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { AnomalyTimelinePoint } from "../types";

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
        <p>No anomaly history in this window yet.</p>
        <p className="text-xs mt-2 opacity-70 text-center max-w-md">
          Detections and resolutions are stored in MongoDB when the ML service runs and the optimizer settles actions.
          Use seed data, <strong>DEMO_SIMULATION</strong>, or real GCP load to produce signals faster.
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
        <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            color: "#334155",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="detected" name="Detected" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="resolved" name="Resolved" fill="#22c55e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
