import type { Resource } from "../types";

const STATUS_CONFIG: Record<string, { dot: string; text: string }> = {
  RUNNING: { dot: "bg-success", text: "text-success" },
  active: { dot: "bg-success", text: "text-success" },
  STOPPED: { dot: "bg-danger", text: "text-danger" },
  STOPPING: { dot: "bg-warning", text: "text-warning" },
  TERMINATED: { dot: "bg-slate-600", text: "text-slate-500" },
  attached: { dot: "bg-accent", text: "text-accent" },
  unattached: { dot: "bg-orange-500", text: "text-orange-400" },
  READY: { dot: "bg-warning", text: "text-warning" },
};

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  compute: { label: "VM", color: "bg-blue-900/50 text-blue-400 border-blue-800/50" },
  cloud_function: { label: "FN", color: "bg-violet-900/50 text-violet-400 border-violet-800/50" },
  gcs: { label: "GCS", color: "bg-emerald-900/50 text-emerald-400 border-emerald-800/50" },
  disk: { label: "DISK", color: "bg-amber-900/50 text-amber-400 border-amber-800/50" },
  cloud_sql: { label: "SQL", color: "bg-red-900/50 text-red-400 border-red-800/50" },
};

interface Props {
  resources: Resource[];
}

export function ResourceTable({ resources }: Props) {
  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
        </svg>
        <p className="text-sm font-medium">No resources discovered yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Resource ID</th>
            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Name</th>
            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cost/hr</th>
            <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last Seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {resources.map((r) => {
            const typeConf = TYPE_CONFIG[r.resource_type] || { label: r.resource_type, color: "bg-slate-800 text-slate-400" };
            const statusConf = STATUS_CONFIG[r.status] || { dot: "bg-slate-600", text: "text-slate-500" };

            return (
              <tr key={r.resource_id} className="hover:bg-surface-overlay/30 transition-colors">
                <td className="py-2.5 px-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border ${typeConf.color}`}>
                    {typeConf.label}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-mono text-xs text-slate-400">
                  {r.resource_id}
                </td>
                <td className="py-2.5 px-3 text-slate-300 text-xs">
                  {r.name || "—"}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                    <span className={`text-xs font-medium ${statusConf.text}`}>
                      {r.status}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-xs font-mono text-slate-400">
                  {r.hourly_cost > 0 ? `$${r.hourly_cost.toFixed(4)}` : "—"}
                </td>
                <td className="py-2.5 px-3 text-xs text-slate-500">
                  {new Date(r.last_seen).toLocaleTimeString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
