import { useRef } from "react";
import type { ComplianceData } from "../types";

// ─── Severity badge ───────────────────────────────────────────────────────────

const SEV: Record<string, string> = {
  critical: "bg-red-50 text-red-600 border-red-200",
  high:     "bg-orange-50 text-orange-600 border-orange-200",
  medium:   "bg-amber-50 text-amber-400 border-amber-200",
  low:      "bg-slate-100/60 text-slate-600 border-slate-200/50",
};

const RISK_LABEL: Record<string, string> = {
  untagged_resource: "Missing Labels",
  orphan_disk:       "Orphan Disk",
  public_bucket:     "Public Bucket",
  unapproved_region: "Wrong Region",
  idle_not_stopped:  "Idle Unresolved",
};

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
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
          className="transition-all duration-1000"
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
      </svg>
      <div className="text-center z-10">
        <div className="text-2xl font-bold" style={{ color }}>{score}</div>
        <div className="text-[9px] text-slate-500 uppercase tracking-wide">score</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
      <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
        {loading ? "Generating report…" : "No compliance data available"}
      </div>
    );
  }

  const { summary, compliance_score, risk_items, actions_audit, actions_by_type } = data;

  return (
    <div ref={printRef} className="space-y-4">
      {/* Header row: score + summary stats */}
      <div className="flex items-center gap-6">
        <ScoreRing score={compliance_score} />

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1">
          {[
            { label: "Total Resources",   value: summary.total_resources },
            { label: "Compliant",         value: summary.compliant_resources },
            { label: "Risk Items",        value: summary.risk_items,            color: summary.risk_items > 0 ? "text-orange-600" : "text-emerald-600" },
            { label: "Open Anomalies",    value: summary.open_anomalies,        color: summary.open_anomalies > 0 ? "text-red-600" : "text-emerald-600" },
            { label: "Saved (30d)",       value: `$${summary.total_saved_30d.toFixed(2)}`, color: "text-emerald-600" },
            { label: "Actions (30d)",     value: summary.actions_taken_30d },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-[9px] text-slate-600 uppercase tracking-wider">{label}</p>
              <p className={`text-sm font-bold ${color ?? "text-slate-800"}`}>{value}</p>
            </div>
          ))}
        </div>

        <button
          onClick={handlePrint}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold border border-border text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-colors cursor-pointer bg-surface"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>

      {/* Risk Items */}
      {risk_items.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Risk Items ({risk_items.length})
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {risk_items.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface/60 border border-border/60">
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${SEV[item.severity] ?? SEV.medium}`}>
                  {item.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-700">
                      {RISK_LABEL[item.type] ?? item.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[9px] text-slate-600 font-mono truncate">
                      {(item.resource_name || item.resource_id).split("/").pop()}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{item.issue}</p>
                </div>
                {item.monthly_cost > 0 && (
                  <span className="shrink-0 text-[10px] font-semibold text-red-600">
                    ${item.monthly_cost.toFixed(2)}/mo
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions by type */}
      {actions_by_type.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Savings by Action Type (30 days)
          </p>
          <div className="space-y-1.5">
            {actions_by_type.map((a) => (
              <div key={a.action_type} className="flex items-center gap-3">
                <span className="text-[10px] text-slate-600 w-28 shrink-0">
                  {a.action_type.replace(/_/g, " ")}
                </span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500/70"
                    style={{
                      width: `${Math.min(
                        (a.total_monthly_savings /
                          Math.max(...actions_by_type.map((x) => x.total_monthly_savings), 1)) *
                          100,
                        100
                      )}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 w-16 text-right shrink-0">
                  ${a.total_monthly_savings.toFixed(2)}/mo
                </span>
                <span className="text-[9px] text-slate-600 w-8 text-right shrink-0">×{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit log */}
      {actions_audit.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Actions Audit Log (last 30 days)
          </p>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-border text-slate-500">
                  <th className="text-left py-1.5 pr-2 font-semibold">Time</th>
                  <th className="text-left py-1.5 pr-2 font-semibold">Resource</th>
                  <th className="text-left py-1.5 pr-2 font-semibold">Action</th>
                  <th className="text-right py-1.5 font-semibold">Savings</th>
                </tr>
              </thead>
              <tbody>
                {actions_audit.slice(0, 20).map((a, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-black/5">
                    <td className="py-1.5 pr-2 text-slate-500 font-mono">
                      {new Date(a.executed_at).toLocaleDateString([], {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="py-1.5 pr-2 text-slate-600 font-mono truncate max-w-[100px]">
                      {a.resource_id.split("/").pop()}
                    </td>
                    <td className="py-1.5 pr-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        a.status === "success"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {a.action_type.replace(/_/g, " ")}
                        {a.dry_run ? " (dry)" : ""}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-semibold text-emerald-600">
                      {a.savings_monthly ? `$${a.savings_monthly.toFixed(2)}/mo` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[9px] text-slate-700 text-right">
        Generated {new Date(data.generated_at).toLocaleString()} · CloudSnip Cloud Cost Intelligence
      </p>
    </div>
  );
}
