import type { Resource } from "../types";

const STATUS_CONFIG: Record<string, { dot: string; text: string }> = {
  RUNNING: { dot: "bg-emerald-500", text: "text-emerald-400" },
  active: { dot: "bg-emerald-500", text: "text-emerald-400" },
  STOPPED: { dot: "bg-red-500", text: "text-red-400" },
  STOPPING: { dot: "bg-yellow-500", text: "text-yellow-400" },
  TERMINATED: { dot: "bg-slate-500", text: "text-slate-400" },
  attached: { dot: "bg-blue-500", text: "text-blue-400" },
  unattached: { dot: "bg-orange-500", text: "text-orange-400" },
  READY: { dot: "bg-yellow-500", text: "text-yellow-400" },
};

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  compute: { label: "VM", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  cloud_function: { label: "FN", color: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  gcs: { label: "GCS", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  disk: { label: "DISK", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  cloud_sql: { label: "SQL", color: "bg-red-500/10 text-red-400 border-red-500/20" },
};

interface Props {
  resources: Resource[];
  onSelectResource?: (r: Resource) => void;
}

export function ResourceTable({ resources, onSelectResource }: Props) {
  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
        </svg>
        <p className="text-sm font-medium">No resources discovered yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full text-sm whitespace-nowrap">
        <thead className="sticky top-0 bg-[#1A2234] z-10 border-b border-white/5 shadow-sm">
          <tr>
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Resource ID</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cost/hr</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cost/mo</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {resources.map((r) => {
            const typeConf = TYPE_CONFIG[r.resource_type] || { label: r.resource_type, color: "bg-slate-500/10 text-slate-400 border-white/10" };
            const statusConf = STATUS_CONFIG[r.status] || { dot: "bg-slate-500", text: "text-slate-400" };

            return (
              <tr
                key={r.resource_id}
                onClick={() => onSelectResource?.(r)}
                className={`hover:bg-white/[0.02] transition-colors duration-150 ${onSelectResource ? "cursor-pointer" : ""}`}
              >
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-bold tracking-wide border ${typeConf.color}`}>
                    {typeConf.label}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-xs text-slate-400 truncate max-w-[200px]" title={r.resource_id}>
                  {r.resource_id}
                </td>
                <td className="py-3 px-4 text-white text-xs font-medium truncate max-w-[150px]" title={r.name}>
                  {r.name || "—"}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusConf.dot} shadow-[0_0_8px_currentColor]`} />
                    <span className={`text-[11px] font-semibold tracking-wide uppercase ${statusConf.text}`}>
                      {r.status}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4 text-xs font-mono text-slate-300">
                  {r.hourly_cost > 0 ? `$${r.hourly_cost.toFixed(4)}` : "—"}
                </td>
                <td className="py-3 px-4 text-xs font-mono text-slate-300">
                  {r.hourly_cost > 0 ? `$${(r.hourly_cost * 730).toFixed(2)}` : "—"}
                </td>
                <td className="py-3 px-4 text-xs text-slate-500">
                  {new Date(r.last_seen).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
