import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SavingsSummary, Action } from "../types";
import { TrendingDown, ArrowRight } from "lucide-react";

interface Props {
  savings: SavingsSummary | null;
  actions: Action[];
}

const ACTION_LABELS: Record<string, string> = {
  stop_instance: "Stop VM",
  cap_instances: "Cap Function",
  delete_disk: "Del Disk",
  label_resource: "Label",
};

const BAR_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"];

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
    <div className="flex flex-col gap-6 h-full">
      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-3xl font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)] tracking-tighter">${totalMonthly.toFixed(2)}</p>
          <p className="text-[10px] font-bold text-emerald-600 mt-2 uppercase tracking-widest">Monthly Savings</p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-3xl font-black text-indigo-400 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)] tracking-tighter">${totalHourly.toFixed(4)}</p>
          <p className="text-[10px] font-bold text-indigo-600 mt-2 uppercase tracking-widest">Hourly Savings</p>
        </div>
        <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-transparent border border-violet-500/20 text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-3xl font-black text-violet-400 drop-shadow-[0_0_10px_rgba(139,92,246,0.5)] tracking-tighter">{successCount}</p>
          <p className="text-[10px] font-bold text-violet-600 mt-2 uppercase tracking-widest">Successful Actions</p>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 bg-black/20 rounded-xl p-4 border border-white/5 min-h-[220px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} dy={8} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
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
                itemStyle={{ color: "#10b981", fontWeight: "bold" }}
                labelStyle={{ color: "#94a3b8", display: "none" }}
                formatter={(value) =>
                  typeof value === "number"
                    ? [`$${value.toFixed(2)}`, "Monthly Savings"]
                    : ["", "Monthly Savings"]
                }
              />
              <Bar dataKey="savings" radius={[6, 6, 0, 0]} maxBarSize={50} isAnimationActive={false}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <TrendingDown className="w-8 h-8 opacity-30 mb-2 text-emerald-400" />
            <p className="text-sm">No savings recorded yet</p>
          </div>
        )}
      </div>

      {/* Recent actions */}
      {recentActions.length > 0 && (
        <div className="bg-black/20 rounded-xl border border-white/5 p-4">
          <h4 className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1 border-l-2 border-emerald-500">
            Recent Optimizations
          </h4>
          <div className="flex flex-col space-y-2">
            {recentActions.map((a) => (
              <div key={a.id} className="flex items-center gap-4 py-2 px-3 rounded-lg bg-white/5 border border-white/5 text-xs">
                <span className="font-bold text-white w-24 shrink-0 uppercase tracking-wider text-[10px]">
                  {ACTION_LABELS[a.action_type] || a.action_type.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-[10px] text-slate-400 truncate flex-1 bg-black/40 px-2 py-1 rounded">
                  {a.resource_id.split("/").pop()}
                </span>
                <div className="flex items-center gap-1.5 font-mono bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                  <span className="text-red-400">${a.cost_before_hourly?.toFixed(4)}</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-emerald-400 font-bold">${a.cost_after_hourly?.toFixed(4)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
