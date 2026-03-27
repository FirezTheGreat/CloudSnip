import type { Anomaly, WebSocketMessage } from "../types";

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: "text-red-400", bg: "bg-red-950/60", border: "border-red-900/50" },
  high: { color: "text-orange-400", bg: "bg-orange-950/60", border: "border-orange-900/50" },
  medium: { color: "text-amber-400", bg: "bg-amber-950/60", border: "border-amber-900/50" },
  low: { color: "text-slate-400", bg: "bg-slate-800/60", border: "border-slate-700/50" },
};

const ANOMALY_ICONS: Record<string, string> = {
  idle_instance: "ZZZ",
  runaway_function: "FN!",
  cost_spike: "$$$",
  unused_disk: "HDD",
  usage_anomaly: "(!)",
};

interface Props {
  anomalies: Anomaly[];
  wsMessages: WebSocketMessage[];
}

export function AnomalyFeed({ anomalies, wsMessages }: Props) {
  const recentWsAnomalies = wsMessages
    .filter((m) => m.type === "anomalies_detected")
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-2">
      {recentWsAnomalies.length > 0 && (
        <div className="mb-1">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse-live" />
            <span className="text-[10px] font-bold text-danger tracking-widest uppercase">Live</span>
          </div>
          {recentWsAnomalies.map((msg, i) => (
            <div key={`ws-${i}`} className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-900/30 text-red-300 text-xs font-medium animate-fade-in-up">
              {msg.data.count} new anomalies detected
            </div>
          ))}
        </div>
      )}

      {anomalies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm font-medium">No anomalies detected</p>
          <p className="text-xs mt-0.5 opacity-60">System is monitoring your resources</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
          {anomalies.map((a) => {
            const sev = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.low;
            return (
              <div key={a.id} className={`p-3 rounded-lg ${sev.bg} border ${sev.border} animate-fade-in-up`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${sev.color}`}>
                    {a.severity}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {ANOMALY_ICONS[a.anomaly_type] || "?"}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {a.anomaly_type.replace(/_/g, " ")}
                  </span>
                  <span className="ml-auto text-[11px] font-semibold text-slate-500">
                    {(a.anomaly_score * 100).toFixed(0)}%
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed mb-2">
                  {a.description}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="font-mono">{a.resource_id}</span>
                  <span>{new Date(a.detected_at).toLocaleTimeString()}</span>
                </div>

                {a.action_type && (
                  <div className={`mt-2 px-2 py-1 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                    a.action_status === "success"
                      ? "bg-emerald-950/50 text-success border border-emerald-800/40"
                      : "bg-red-950/50 text-danger border border-red-800/40"
                  }`}>
                    <span>{a.action_status === "success" ? "RESOLVED" : "FAILED"}</span>
                    <span className="font-normal text-slate-400">
                      {a.action_type.replace(/_/g, " ")}
                      {a.savings_monthly_projected
                        ? ` · $${a.savings_monthly_projected.toFixed(2)}/mo`
                        : ""}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
