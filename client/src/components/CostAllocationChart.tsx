import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CostByLabel } from "../types";
import { PieChart as PieChartIcon } from "lucide-react";

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
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <PieChartIcon className="w-12 h-12 mb-3 opacity-30 text-indigo-400" />
        <p className="text-sm font-medium text-white/80">No label data available</p>
        <p className="text-[11px] mt-1 text-slate-500">Resources will be grouped by GCP labels when available.</p>
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

  const totalCost = chartData.reduce((s, d) => s + d.monthly_cost, 0);

  return (
    <div className="flex gap-6 items-center flex-col md:flex-row h-full w-full">
      <div className="w-full md:w-1/2 min-h-[260px] relative flex items-center justify-center">
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Total</span>
          <span className="text-2xl font-black text-white">${totalCost.toFixed(0)}</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={75}
              outerRadius={110}
              paddingAngle={4}
              dataKey="monthly_cost"
              nameKey="label"
              stroke="none"
              cornerRadius={6}
              isAnimationActive={false}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} className="drop-shadow-md hover:opacity-80 transition-opacity outline-none cursor-pointer" />
              ))}
            </Pie>
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
              itemStyle={{ color: "#e2e8f0", fontWeight: "bold" }}
              labelStyle={{ color: "#94a3b8", display: "none" }}
              formatter={(value) =>
                typeof value === "number" ? [`$${value.toFixed(2)}/mo`, "Cost"] : ["", "Cost"]
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="w-full md:w-1/2 flex flex-col gap-2 max-h-[260px] overflow-y-auto custom-scrollbar pr-2">
        {chartData.map((item, i) => {
          const percentage = ((item.monthly_cost / totalCost) * 100).toFixed(1);
          return (
            <div key={item.label} className="flex items-center gap-3 p-2 rounded-lg bg-black/20 border border-white/5 hover:bg-black/40 transition-colors">
              <span
                className="w-3 h-3 rounded-full shrink-0 shadow-[0_0_8px_currentColor]"
                style={{ backgroundColor: COLORS[i % COLORS.length], color: COLORS[i % COLORS.length] }}
              />
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-[11px] font-bold text-white truncate tracking-wide">{item.label}</span>
                <span className="text-[9px] text-slate-500 font-mono">{item.count} resources</span>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="font-mono text-xs font-bold text-slate-300 whitespace-nowrap">${item.monthly_cost.toFixed(2)}</span>
                <span className="text-[9px] text-slate-500 font-bold">{percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
