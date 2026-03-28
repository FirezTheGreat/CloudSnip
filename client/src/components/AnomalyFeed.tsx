import { useState } from "react";
import type { Anomaly, WebSocketMessage, AnomalyExplanation } from "../types";
import { AlertTriangle, Clock, Server, Zap, HardDrive, Activity, HelpCircle } from "lucide-react";

const SEVERITY_CONFIG = {
  critical: { bar: "bg-red-500",    badge: "bg-red-500/10 text-red-400 border-red-500/20",    card: "border-red-500/20 bg-red-500/5 hover:border-red-500/30" },
  high:     { bar: "bg-orange-500", badge: "bg-orange-500/10 text-orange-400 border-orange-500/20", card: "border-orange-500/20 bg-orange-500/5 hover:border-orange-500/30" },
  medium:   { bar: "bg-amber-500",  badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",   card: "border-amber-500/20 bg-amber-500/5 hover:border-amber-500/30" },
  low:      { bar: "bg-blue-500",  badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",   card: "border-blue-500/20 bg-blue-500/5 hover:border-blue-500/30" },
} as const;

const TYPE_ICONS: Record<string, React.ReactNode> = {
  idle_instance:    <Clock className="w-5 h-5 text-indigo-400" />,
  runaway_function: <Zap className="w-5 h-5 text-amber-400" />,
  cost_spike:       <Activity className="w-5 h-5 text-red-400" />,
  unused_volume:    <HardDrive className="w-5 h-5 text-slate-400" />,
  orphan_disk:      <HardDrive className="w-5 h-5 text-slate-400" />,
  traffic_spike:    <Activity className="w-5 h-5 text-cyan-400" />,
  usage_anomaly:    <AlertTriangle className="w-5 h-5 text-yellow-400" />,
};

const TYPE_LABEL: Record<string, string> = {
  idle_instance:    "Idle Instance",
  runaway_function: "Runaway Function",
  cost_spike:       "Cost Spike",
  unused_volume:    "Orphan Disk",
  orphan_disk:      "Orphan Disk",
  traffic_spike:    "Traffic Spike",
  usage_anomaly:    "Usage Anomaly",
};

function ExplanationCard({ explanation }: { explanation: AnomalyExplanation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3 rounded-lg bg-black/40 border border-white/5 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/5">
        <p className="text-xs text-slate-300 leading-relaxed">
          {explanation.what_happened}
        </p>
      </div>

      {expanded && (
        <div className="px-3 py-3 space-y-3 bg-black/20 animate-slide-in-up">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">WHY IT MATTERS</p>
            <p className="text-xs text-slate-300 leading-relaxed">{explanation.why_it_matters}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">WHAT WE DID</p>
            <p className="text-xs text-slate-300 leading-relaxed">{explanation.what_we_did}</p>
          </div>
          <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
            <span className="text-emerald-400 font-bold text-xs uppercase tracking-wider">IMPACT</span>
            <span className="text-emerald-300 text-xs">{explanation.impact}</span>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 italic">{explanation.confidence_statement}</p>
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors cursor-pointer bg-white/[0.02] hover:bg-white/[0.05]"
      >
        {expanded ? "Collapse Details" : "View Full Analysis"}
      </button>
    </div>
  );
}

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const sev = SEVERITY_CONFIG[anomaly.severity] ?? SEVERITY_CONFIG.low;
  const icon = TYPE_ICONS[anomaly.anomaly_type] ?? <HelpCircle className="w-5 h-5 text-slate-400" />;
  const typeLabel = TYPE_LABEL[anomaly.anomaly_type] ?? anomaly.anomaly_type.replace(/_/g, " ");
  const scorePct = (anomaly.anomaly_score * 100).toFixed(0);

  return (
    <div className={`rounded-xl border ${sev.card} overflow-hidden transition-all duration-300 animate-slide-in-up mb-3 flex flex-col backdrop-blur-sm`}>
      <div className={`h-1 w-full bg-black/20`}>
        <div className={`h-full ${sev.bar} shadow-[0_0_10px_currentColor]`} style={{ width: `${scorePct}%` }} />
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 p-2 bg-white/5 rounded-lg border border-white/10 shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${sev.badge}`}>
                  {anomaly.severity}
                </span>
                <span className="text-sm font-semibold text-white">{typeLabel}</span>
              </div>
              <p className="text-xs text-slate-400 font-mono truncate flex items-center gap-1">
                <Server className="w-3 h-3 inline" />
                {anomaly.resource_id.split("/").pop()}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
            <span className="text-lg font-bold text-white leading-none">
              {scorePct}<span className="text-xs font-medium text-slate-400">%</span>
            </span>
            <span className="text-[9px] uppercase tracking-widest text-slate-500 mt-1">confidence</span>
          </div>
        </div>

        {anomaly.explanation ? (
          <ExplanationCard explanation={anomaly.explanation} />
        ) : (
          <p className="text-xs text-slate-300 leading-relaxed bg-black/40 rounded-lg px-3 py-2 border border-white/5">
            {anomaly.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-3 flex-wrap gap-2 pt-3 border-t border-white/5">
          {anomaly.action_type ? (
            <span className={`px-2 py-1 rounded border inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
              anomaly.action_status === "success"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : anomaly.action_status === "pending_approval"
                ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${anomaly.action_status === "success" ? "bg-emerald-400" : anomaly.action_status === "pending_approval" ? "bg-violet-400" : "bg-red-400"}`} />
              {anomaly.action_status === "success" ? "Resolved" : anomaly.action_status === "pending_approval" ? "Pending" : "Failed"}
              <span className="font-medium text-current/70">
                · {anomaly.action_type.replace(/_/g, " ")}
              </span>
            </span>
          ) : <span />}
          <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 bg-black/30 px-2 py-1 rounded">
            <Clock className="w-3 h-3" />
            {new Date(anomaly.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  anomalies: Anomaly[];
  wsMessages: WebSocketMessage[];
}
type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";

export function AnomalyFeed({ anomalies, wsMessages }: Props) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [showResolved, setShowResolved] = useState(false);

  const filtered = anomalies.filter((a) => {
    if (!showResolved && a.resolved) return false;
    if (severityFilter !== "all" && a.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
          className="px-3 py-1.5 text-xs bg-black/40 border border-white/10 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer hover:bg-black/60 transition-colors"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <button
          onClick={() => setShowResolved(!showResolved)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 ${
            showResolved
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-black/40 border-white/10 text-slate-400 hover:text-slate-200"
          }`}
        >
          {showResolved && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          Resolved
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <AlertTriangle className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium text-white/60">No anomalies detected</p>
            <p className="text-xs mt-1 text-slate-500">
              {anomalies.length > 0 ? "Adjust filters to see results" : "All resources are operating nominally"}
            </p>
          </div>
        ) : (
          filtered.map((a) => <AnomalyCard key={a.id} anomaly={a} />)
        )}
      </div>
    </div>
  );
}
