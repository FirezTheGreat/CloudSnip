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
    <div className="flex flex-col gap-5">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
          <p className="text-2xl font-bold text-success">${totalMonthly.toFixed(2)}</p>
          <p className="text-[11px] font-medium text-slate-500 mt-1 uppercase tracking-wider">Monthly Savings</p>
        </div>
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-center">
          <p className="text-2xl font-bold text-accent">${totalHourly.toFixed(4)}</p>
          <p className="text-[11px] font-medium text-slate-500 mt-1 uppercase tracking-wider">Hourly Savings</p>
        </div>
        <div className="p-4 rounded-lg bg-violet-50 border border-violet-200 text-center">
          <p className="text-2xl font-bold text-info">{successCount}</p>
          <p className="text-[11px] font-medium text-slate-500 mt-1 uppercase tracking-wider">Actions Taken</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
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
                typeof value === "number"
                  ? [`$${value.toFixed(2)}`, "Monthly Savings"]
                  : ["", "Monthly Savings"]
              }
            />
            <Bar dataKey="savings" radius={[6, 6, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center py-10 text-slate-500 text-sm">
          No savings recorded yet
        </div>
      )}

      {/* Recent actions */}
      {recentActions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
            Recent Optimizations
          </h4>
          <div className="flex flex-col divide-y divide-border">
            {recentActions.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2 text-xs">
                <span className="font-semibold text-slate-700 w-20 shrink-0">
                  {ACTION_LABELS[a.action_type] || a.action_type}
                </span>
                <span className="font-mono text-slate-500 truncate flex-1">
                  {a.resource_id}
                </span>
                <span className="text-success font-semibold whitespace-nowrap">
                  ${a.cost_before_hourly?.toFixed(4)} → ${a.cost_after_hourly?.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
