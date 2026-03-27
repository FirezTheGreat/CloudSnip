import type { Action } from "../types";

const ACTION_LABELS: Record<string, string> = {
  stop_instance: "Stop VM",
  cap_instances: "Cap Function",
  delete_disk: "Del Disk",
  label_resource: "Label",
};

const STATUS_CONFIG: Record<string, { badge: string }> = {
  success: { badge: "bg-emerald-950/60 text-success border-emerald-800/40" },
  failed: { badge: "bg-red-950/60 text-danger border-red-800/40" },
  pending: { badge: "bg-amber-950/60 text-warning border-amber-800/40" },
  executing: { badge: "bg-blue-950/60 text-accent border-blue-800/40" },
};

interface Props {
  actions: Action[];
}

export function ActionLog({ actions }: Props) {
  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-sm font-medium">No actions executed yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
      {actions.map((a) => {
        const statusConf = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;

        return (
          <div key={a.id} className="p-3 rounded-lg bg-surface-overlay/40 border border-border-subtle animate-fade-in-up">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${statusConf.badge}`}>
                {a.status}
              </span>
              <span className="text-[11px] text-slate-400 font-medium capitalize">
                {a.action_type.replace(/_/g, " ")}
              </span>
              <span className="ml-auto text-[10px] text-slate-600">
                {new Date(a.executed_at).toLocaleString()}
              </span>
              {a.dry_run && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-950/50 text-amber-400 border border-amber-800/40">
                  DRY RUN
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-slate-500 truncate">{a.resource_id}</span>
              {a.savings_hourly > 0 && (
                <span className="ml-auto text-success font-semibold whitespace-nowrap text-[11px]">
                  saves ${a.savings_monthly_projected?.toFixed(2)}/mo
                </span>
              )}
            </div>

            {a.details?.message && (
              <p className="mt-1.5 text-[11px] text-slate-500 italic leading-relaxed">
                {a.details.message}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
