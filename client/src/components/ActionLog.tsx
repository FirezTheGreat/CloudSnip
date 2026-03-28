import type { Action } from "../types";
import { PlayCircle, ShieldCheck, XCircle, RotateCcw } from "lucide-react";

const STATUS_CONFIG: Record<string, { badge: string; dot: string; text: string }> = {
  success: { badge: "bg-emerald-500/10 border-emerald-500/30", dot: "bg-emerald-400", text: "text-emerald-400" },
  failed: { badge: "bg-red-500/10 border-red-500/30", dot: "bg-red-400", text: "text-red-400" },
  pending: { badge: "bg-amber-500/10 border-amber-500/30", dot: "bg-amber-400", text: "text-amber-400" },
  pending_approval: { badge: "bg-violet-500/10 border-violet-500/30", dot: "bg-violet-400", text: "text-violet-400" },
  rejected: { badge: "bg-slate-500/10 border-white/10", dot: "bg-slate-500", text: "text-slate-400" },
  rolled_back: { badge: "bg-cyan-500/10 border-cyan-500/30", dot: "bg-cyan-400", text: "text-cyan-400" },
  executing: { badge: "bg-blue-500/10 border-blue-500/30", dot: "bg-blue-400", text: "text-blue-400" },
  dry_run: { badge: "bg-orange-500/10 border-orange-500/30", dot: "bg-orange-400", text: "text-orange-400" },
};

interface Props {
  actions: Action[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onRollback?: (id: string) => void;
}

export function ActionLog({ actions, onApprove, onReject, onRollback }: Props) {
  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <PlayCircle className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">No actions executed yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
      {actions.map((a) => {
        const statusConf = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;

        return (
          <div key={a.id} className="p-4 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 hover:bg-black/60 transition-all duration-300 animate-slide-in-up group">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 ${statusConf.badge} ${statusConf.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot} shadow-[0_0_8px_currentColor]`} />
                {a.status === "pending_approval" ? "NEEDS APPROVAL" : a.status.replace(/_/g, " ")}
              </div>
              <span className="text-sm font-bold text-white tracking-wide">
                {a.action_type.replace(/_/g, " ")}
              </span>
              <span className="ml-auto text-[10px] text-slate-500 uppercase tracking-widest font-medium">
                {new Date(a.executed_at).toLocaleString()}
              </span>
              {a.dry_run && (
                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-orange-500/20 text-orange-400 border border-orange-500/30 ml-2">
                  DRY RUN
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs mb-2">
              <span className="font-mono text-slate-400 bg-white/5 px-2 py-1 rounded border border-white/5 truncate max-w-[250px]">
                {a.resource_id.split("/").pop()}
              </span>
              {a.savings_hourly > 0 && (
                <span className="ml-auto text-emerald-400 font-bold whitespace-nowrap bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                  saves ${a.savings_monthly_projected?.toFixed(2)}/mo
                </span>
              )}
            </div>

            {a.details?.message && (
              <p className="text-xs text-slate-400 leading-relaxed border-l-2 border-slate-700 pl-3 py-1 my-2">
                {a.details.message}
              </p>
            )}

            {(a.can_approve || a.can_rollback) && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
                {a.can_approve && onApprove && onReject && (
                  <>
                    <button
                      onClick={() => onApprove(a.id)}
                      className="px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all cursor-pointer shadow-[0_4px_10px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_15px_rgba(16,185,129,0.5)]"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => onReject(a.id)}
                      className="px-3 py-1.5 text-[10px] flex items-center gap-1.5 font-bold uppercase tracking-widest bg-red-600/20 hover:bg-red-600 text-red-200 border border-red-600/50 rounded-lg transition-all cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </>
                )}
                {a.can_rollback && onRollback && (
                  <button
                    onClick={() => onRollback(a.id)}
                    className="px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 border border-cyan-600/50 rounded-lg transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Rollback
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
