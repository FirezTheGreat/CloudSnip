import { useRef } from "react";
import type { ComplianceData } from "../types";
import { ShieldAlert, Printer, ShieldCheck } from "lucide-react";

const SEV: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low:      "bg-slate-500/10 text-slate-400 border-white/10",
};

const RISK_LABEL: Record<string, string> = {
  untagged_resource: "Missing Labels",
  orphan_disk:       "Orphan Disk",
  public_bucket:     "Public Bucket",
  unapproved_region: "Wrong Region",
  idle_not_stopped:  "Idle Unresolved",
};

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center w-28 h-28 bg-black/40 rounded-2xl border border-white/5 shadow-inner">
      <svg className="absolute w-24 h-24 -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
        />
      </svg>
      <div className="text-center z-10 flex flex-col items-center">
        <div className="text-3xl font-black tracking-tighter" style={{ color }}>{score}</div>
        <div className="text-[9px] text-slate-400 uppercase tracking-widest mt-0.5">score</div>
      </div>
    </div>
  );
}

interface Props {
  data: ComplianceData | null;
  loading?: boolean;
}

export function ComplianceReport({ data, loading }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    window.print();
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <ShieldCheck className="w-12 h-12 mb-3 opacity-30 text-emerald-400 animate-pulse" />
        <p className="text-sm font-medium">{loading ? "Generating audit report..." : "No compliance data available"}</p>
      </div>
    );
  }

  const { summary, compliance_score, risk_items, actions_audit, actions_by_type } = data;

  return (
    <div ref={printRef} className="space-y-6">
      <div className="flex items-center gap-6 p-4 rounded-xl bg-gradient-to-br from-black/40 to-transparent border border-white/5">
        <ScoreRing score={compliance_score} />

        <div className="grid grid-cols-3 gap-x-8 gap-y-4 flex-1">
          {[
            { label: "Total Resources",   value: summary.total_resources },
            { label: "Compliant",         value: summary.compliant_resources },
            { label: "Risk Items",        value: summary.risk_items,            color: summary.risk_items > 0 ? "text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" : "text-emerald-400" },
            { label: "Open Anomalies",    value: summary.open_anomalies,        color: summary.open_anomalies > 0 ? "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]" : "text-emerald-400" },
            { label: "Saved (30d)",       value: `$${summary.total_saved_30d.toFixed(2)}`, color: "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" },
            { label: "Actions (30d)",     value: summary.actions_taken_30d },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">{label}</p>
              <p className={`text-xl font-bold ${color ?? "text-white"}`}>{value}</p>
            </div>
          ))}
        </div>

        <button
          onClick={handlePrint}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer self-start"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>

      {risk_items.length > 0 && (
        <div>
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white mb-3 pl-1 border-l-2 border-orange-500">
            <ShieldAlert className="w-4 h-4 text-orange-400" /> Discovered Risk Items
            <span className="bg-white/10 text-slate-300 px-2 py-0.5 rounded-full text-[10px]">{risk_items.length}</span>
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
            {risk_items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
                <span className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${SEV[item.severity] ?? SEV.medium}`}>
                  {item.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 border-b border-white/5 pb-1">
                    <span className="text-sm font-semibold text-white">
                      {RISK_LABEL[item.type] ?? item.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono truncate bg-white/5 px-1.5 py-0.5 rounded">
                      {(item.resource_name || item.resource_id).split("/").pop()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-mono">{item.issue}</p>
                </div>
                {item.monthly_cost > 0 && (
                  <span className="shrink-0 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20">
                    ${item.monthly_cost.toFixed(2)}/mo
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {actions_by_type.length > 0 && (
        <div className="pt-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 pl-1">
            Savings by Action Type (30 days)
          </h4>
          <div className="space-y-3 bg-black/40 p-4 rounded-xl border border-white/5">
            {actions_by_type.map((a) => (
              <div key={a.action_type} className="flex items-center gap-4">
                <span className="text-xs text-slate-300 font-medium w-32 shrink-0 capitalize truncate" title={a.action_type}>
                  {a.action_type.replace(/_/g, " ")}
                </span>
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 relative"
                    style={{
                      width: `${Math.min(
                        (a.total_monthly_savings /
                          Math.max(...actions_by_type.map((x) => x.total_monthly_savings), 1)) *
                          100,
                        100
                      )}%`,
                    }}
                  >
                    <div className="absolute inset-0 bg-white/20 blur-[2px]" />
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-400 w-20 text-right shrink-0">
                  ${a.total_monthly_savings.toFixed(2)}/mo
                </span>
                <span className="text-[10px] text-slate-500 font-mono w-8 text-right shrink-0">×{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {actions_audit.length > 0 && (
        <div className="pt-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 pl-1">
            Actions Audit Log (last 30 days)
          </h4>
          <div className="max-h-64 overflow-y-auto custom-scrollbar rounded-xl border border-white/5 bg-black/40 p-1">
            <table className="w-full text-[11px] whitespace-nowrap">
              <thead className="sticky top-0 bg-black/80 backdrop-blur-md z-10 border-b border-white/10">
                <tr className="text-slate-400 uppercase tracking-widest">
                  <th className="text-left py-3 px-3 font-semibold w-1/4">Time</th>
                  <th className="text-left py-3 px-3 font-semibold w-2/4">Resource ID</th>
                  <th className="text-left py-3 px-3 font-semibold w-1/4">Action</th>
                  <th className="text-right py-3 px-3 font-semibold">Savings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {actions_audit.slice(0, 30).map((a, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-3 text-slate-400 font-mono text-[10px]">
                      {new Date(a.executed_at).toLocaleDateString([], {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono truncate max-w-[200px]" title={a.resource_id}>
                      {a.resource_id.split("/").pop()}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[9px] border inline-block ${
                        a.status === "success"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-white/5 text-slate-300 border-white/10"
                      }`}>
                        {a.action_type.replace(/_/g, " ")}
                        {a.dry_run ? " (dry)" : ""}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                      {a.savings_monthly ? `$${a.savings_monthly.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-500 text-center font-mono pt-4 opacity-50">
        Generated {new Date(data.generated_at).toLocaleString()} · CloudSnip Enterprise Audit
      </p>
    </div>
  );
}
