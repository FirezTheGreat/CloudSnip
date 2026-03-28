import type { Recommendation } from "../types";

interface Props {
  recommendations: Recommendation[];
}

const CONFIDENCE_CONFIG: Record<string, { badge: string }> = {
  high: { badge: "bg-emerald-50 text-success border-emerald-200" },
  medium: { badge: "bg-amber-50 text-warning border-amber-800/40" },
  low: { badge: "bg-slate-100/60 text-slate-600 border-slate-200/40" },
};

const TYPE_LABELS: Record<string, string> = {
  rightsize: "Right-size",
  stop_idle: "Stop Idle",
  delete_unused: "Delete Unused",
};

export function Recommendations({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-500">
        <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p className="text-sm font-medium">No recommendations</p>
        <p className="text-xs mt-0.5 opacity-60">Resources look well-optimized</p>
      </div>
    );
  }

  const totalSavings = recommendations.reduce((s, r) => s + r.estimated_monthly_savings, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-slate-500">{recommendations.length} recommendation{recommendations.length !== 1 ? "s" : ""}</span>
        <span className="text-xs font-bold text-success">Potential: ${totalSavings.toFixed(2)}/mo</span>
      </div>

      <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
        {recommendations.map((r) => {
          const conf = CONFIDENCE_CONFIG[r.confidence] || CONFIDENCE_CONFIG.low;
          return (
            <div key={r.id} className="p-3 rounded-lg bg-surface-overlay/40 border border-border-subtle animate-fade-in-up">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${conf.badge}`}>
                  {r.confidence}
                </span>
                <span className="text-[11px] text-slate-600 font-medium">
                  {TYPE_LABELS[r.type] || r.type}
                </span>
                <span className="ml-auto text-[11px] font-bold text-success">
                  -${r.estimated_monthly_savings.toFixed(2)}/mo
                </span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed mb-1.5">{r.reason}</p>

              <div className="flex items-center gap-2 text-[10px]">
                <span className="font-mono text-slate-500 truncate">{r.resource_name || r.resource_id}</span>
                <span className="text-slate-600">
                  {r.current_config} &rarr; {r.recommended_config}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
