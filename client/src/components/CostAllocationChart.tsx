import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CostByLabel } from "../types";

interface Props {
  data: CostByLabel[];
}

const COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

export function CostAllocationChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[280px] text-slate-500">
        <p className="text-sm font-medium">No label data available</p>
        <p className="text-xs mt-1 opacity-60">Resources will be grouped by GCP labels</p>
      </div>
    );
  }

  const top8 = data.slice(0, 8);
  const rest = data.slice(8);
  const chartData = [...top8];
  if (rest.length > 0) {
    chartData.push({
      label: `Other (${rest.length})`,
      monthly_cost: rest.reduce((s, r) => s + r.monthly_cost, 0),
      count: rest.reduce((s, r) => s + r.count, 0),
    });
  }

  return (
    <div className="flex gap-4 items-center">
      <ResponsiveContainer width="50%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="monthly_cost"
            nameKey="label"
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              color: "#334155",
              fontSize: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
            formatter={(value) =>
              typeof value === "number" ? [`$${value.toFixed(2)}/mo`, "Cost"] : ["", "Cost"]
            }
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex-1 flex flex-col gap-1.5">
        {chartData.map((item, i) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-slate-600 truncate flex-1">{item.label}</span>
            <span className="font-mono text-slate-700 whitespace-nowrap">${item.monthly_cost.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
