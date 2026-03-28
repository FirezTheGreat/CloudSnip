import type { Resource, Anomaly, Action } from "../types";

interface Props {
  resource: Resource | null;
  anomalies: Anomaly[];
  actions: Action[];
  onClose: () => void;
}

const STATUS_DOT: Record<string, string> = {
  RUNNING: "bg-success",
  active: "bg-success",
  STOPPED: "bg-danger",
  STOPPING: "bg-warning",
  TERMINATED: "bg-slate-600",
  attached: "bg-accent",
  unattached: "bg-orange-500",
  READY: "bg-warning",
};

export function ResourceDrawer({ resource, anomalies, actions, onClose }: Props) {
  if (!resource) return null;

  const relatedAnomalies = anomalies.filter((a) => a.resource_id === resource.resource_id);
  const relatedActions = actions.filter((a) => a.resource_id === resource.resource_id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-raised border-l border-border overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-surface-raised border-b border-border p-4 flex items-center justify-between z-10">
          <h2 className="text-sm font-bold text-slate-900">Resource Details</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-overlay text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div className="space-y-3">
            <div>
              <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Name</span>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">{resource.name || "—"}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Resource ID</span>
              <p className="text-xs font-mono text-slate-600 mt-0.5 break-all">{resource.resource_id}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Type</span>
                <p className="text-xs text-slate-700 mt-0.5">{resource.resource_type}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Status</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[resource.status] || "bg-slate-600"}`} />
                  <span className="text-xs text-slate-700">{resource.status}</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Hourly Cost</span>
                <p className="text-xs font-mono text-slate-700 mt-0.5">
                  {resource.hourly_cost > 0 ? `$${resource.hourly_cost.toFixed(4)}` : "—"}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Monthly Cost</span>
                <p className="text-xs font-mono text-slate-700 mt-0.5">
                  {resource.hourly_cost > 0 ? `$${(resource.hourly_cost * 730).toFixed(2)}` : "—"}
                </p>
              </div>
            </div>
          </div>

          {resource.metadata && Object.keys(resource.metadata).length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">Metadata</h3>
              <div className="bg-surface rounded-lg border border-border p-3 space-y-1.5">
                {Object.entries(resource.metadata).filter(([_, v]) => v != null && v !== "").slice(0, 10).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[11px]">
                    <span className="text-slate-600">{k}</span>
                    <span className="text-slate-700 font-mono text-right max-w-[200px] truncate">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">
              Anomalies ({relatedAnomalies.length})
            </h3>
            {relatedAnomalies.length === 0 ? (
              <p className="text-xs text-slate-600">No anomalies for this resource</p>
            ) : (
              <div className="space-y-2">
                {relatedAnomalies.slice(0, 5).map((a) => (
                  <div key={a.id} className="p-2 rounded-lg bg-surface border border-border-subtle text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-bold uppercase text-[10px] ${
                        a.severity === "critical" ? "text-red-700" :
                        a.severity === "high" ? "text-orange-700" :
                        a.severity === "medium" ? "text-amber-700" : "text-slate-600"
                      }`}>
                        {a.severity}
                      </span>
                      <span className="text-slate-600">{a.anomaly_type.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-slate-600 text-[11px]">{a.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">
              Actions ({relatedActions.length})
            </h3>
            {relatedActions.length === 0 ? (
              <p className="text-xs text-slate-600">No actions for this resource</p>
            ) : (
              <div className="space-y-2">
                {relatedActions.slice(0, 5).map((a) => (
                  <div key={a.id} className="p-2 rounded-lg bg-surface border border-border-subtle text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold uppercase text-[10px] ${
                        a.status === "success" ? "text-success" :
                        a.status === "failed" ? "text-danger" : "text-warning"
                      }`}>
                        {a.status}
                      </span>
                      <span className="text-slate-600">{a.action_type.replace(/_/g, " ")}</span>
                      {a.savings_monthly_projected > 0 && (
                        <span className="ml-auto text-success font-semibold text-[10px]">
                          ${a.savings_monthly_projected.toFixed(2)}/mo
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
