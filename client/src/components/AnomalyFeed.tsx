import { useState } from "react";
import type { Anomaly, WebSocketMessage, AnomalyExplanation } from "../types";

// ─── Config ────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { bar: "bg-red-500",    badge: "bg-red-50 text-red-600 border-red-200",    card: "border-red-200 bg-red-50" },
  high:     { bar: "bg-orange-500", badge: "bg-orange-50 text-orange-600 border-orange-200", card: "border-orange-200 bg-orange-50" },
  medium:   { bar: "bg-amber-500",  badge: "bg-amber-50 text-amber-400 border-amber-200",   card: "border-amber-200 bg-amber-50" },
  low:      { bar: "bg-slate-500",  badge: "bg-slate-100/60 text-slate-600 border-slate-200/50",   card: "border-slate-200/40 bg-slate-100/20" },
} as const;

const TYPE_EMOJI: Record<string, string> = {
  idle_instance:    "😴",
  runaway_function: "⚡",
  cost_spike:       "💸",
  unused_volume:    "💽",
  orphan_disk:      "💽",
  traffic_spike:    "📈",
  usage_anomaly:    "⚠️",
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

// ─── Explanation Card ─────────────────────────────────────────────────────────

function ExplanationCard({ explanation }: { explanation: AnomalyExplanation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 rounded-lg bg-black/20 border border-white/5 overflow-hidden">
      {/* Always visible: what happened */}
      <div className="px-3 py-2">
        <p className="text-[11px] text-slate-700 leading-relaxed">
          {explanation.what_happened}
        </p>
      </div>

      {/* Expandable: full NLP analysis */}
      {expanded && (
        <div className="border-t border-white/5 px-3 py-2 space-y-2 animate-fade-in-up">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">WHY IT MATTERS</p>
            <p className="text-[11px] text-slate-600 leading-relaxed">{explanation.why_it_matters}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">WHAT WE DID</p>
            <p className="text-[11px] text-slate-600 leading-relaxed">{explanation.what_we_did}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">IMPACT</p>
            <p className="text-[11px] text-emerald-600 font-medium leading-relaxed">{explanation.impact}</p>
          </div>
          <div className="pt-1 border-t border-white/5">
            <p className="text-[9px] text-slate-600 leading-relaxed">{explanation.confidence_statement}</p>
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-600 transition-colors cursor-pointer border-t border-white/5"
      >
        {expanded ? "▲ less" : "▼ full analysis"}
      </button>
    </div>
  );
}

// ─── Anomaly Card ──────────────────────────────────────────────────────────────

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const sev = SEVERITY_CONFIG[anomaly.severity] ?? SEVERITY_CONFIG.low;
  const emoji = TYPE_EMOJI[anomaly.anomaly_type] ?? "⚠️";
  const typeLabel = TYPE_LABEL[anomaly.anomaly_type] ?? anomaly.anomaly_type.replace(/_/g, " ");
  const scoreWidth = `${(anomaly.anomaly_score * 100).toFixed(0)}%`;

  return (
    <div className={`rounded-xl border ${sev.card} overflow-hidden animate-fade-in-up`}>
      {/* Severity bar */}
      <div className={`h-0.5 ${sev.bar}`} style={{ width: scoreWidth }} />

      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl leading-none">{emoji}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${sev.badge}`}>
                  {anomaly.severity}
                </span>
                <span className="text-[11px] font-semibold text-slate-800">{typeLabel}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                {anomaly.resource_id.split("/").pop()}
              </p>
            </div>
          </div>

          {/* Score gauge */}
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[13px] font-bold text-slate-800">
              {(anomaly.anomaly_score * 100).toFixed(0)}
              <span className="text-[9px] font-normal text-slate-500">%</span>
            </span>
            <span className="text-[9px] text-slate-600">confidence</span>
          </div>
        </div>

        {/* NLP Explanation (or plain description fallback) */}
        {anomaly.explanation ? (
          <ExplanationCard explanation={anomaly.explanation} />
        ) : (
          <p className="text-[11px] text-slate-600 leading-relaxed bg-black/20 rounded-lg px-3 py-2">
            {anomaly.description}
          </p>
        )}

        {/* Action badge + timestamp */}
        <div className="flex items-center justify-between mt-2 flex-wrap gap-1">
          {anomaly.action_type ? (
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border inline-flex items-center gap-1 ${
              anomaly.action_status === "success"
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : anomaly.action_status === "pending_approval"
                ? "bg-violet-50 text-violet-600 border-violet-200"
                : "bg-red-50 text-red-600 border-red-200"
            }`}>
              {anomaly.action_status === "success" ? "✓ resolved" :
               anomaly.action_status === "pending_approval" ? "⏳ pending" : "✗ failed"}
              <span className="font-normal text-current opacity-70">
                {" · "}{anomaly.action_type.replace(/_/g, " ")}
                {anomaly.savings_monthly_projected
                  ? ` · $${anomaly.savings_monthly_projected.toFixed(2)}/mo`
                  : ""}
              </span>
            </span>
          ) : (
            <span />
          )}
          <span className="text-[9px] text-slate-600">
            {new Date(anomaly.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Feed ─────────────────────────────────────────────────────────────────

interface Props {
  anomalies: Anomaly[];
  wsMessages: WebSocketMessage[];
}

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";

export function AnomalyFeed({ anomalies, wsMessages }: Props) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showResolved, setShowResolved] = useState(false);

  const liveMessages = wsMessages
    .filter((m) => m.type === "anomalies_detected" || m.type === "action_completed")
    .slice(0, 2);

  const types = [...new Set(anomalies.map((a) => a.anomaly_type))];

  const filtered = anomalies.filter((a) => {
    if (!showResolved && a.resolved) return false;
    if (severityFilter !== "all" && a.severity !== severityFilter) return false;
    if (typeFilter !== "all" && a.anomaly_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-2">
      {/* Live WebSocket pulse */}
      {liveMessages.length > 0 && (
        <div className="flex flex-col gap-1 mb-1">
          {liveMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border animate-fade-in-up ${
                msg.type === "action_completed"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                msg.type === "action_completed" ? "bg-emerald-400" : "bg-red-400"
              }`} />
              {msg.type === "action_completed"
                ? `Action completed on ${(msg.data as any)?.resourceId?.split("/").pop() ?? "resource"}`
                : `${(msg.data as any)?.count ?? "New"} anomalies detected`}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      {anomalies.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            className="px-2 py-1 text-[10px] bg-surface border border-border rounded-md text-slate-600 focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2 py-1 text-[10px] bg-surface border border-border rounded-md text-slate-600 focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="all">All Types</option>
            {types.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t] ?? t.replace(/_/g, " ")}</option>
            ))}
          </select>

          <button
            onClick={() => setShowResolved(!showResolved)}
            className={`px-2 py-1 text-[10px] rounded-md border transition-colors cursor-pointer ${
              showResolved
                ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                : "bg-surface border-border text-slate-500 hover:text-slate-700"
            }`}
          >
            {showResolved ? "✓ Resolved" : "Resolved"}
          </button>

          {(severityFilter !== "all" || typeFilter !== "all") && (
            <span className="text-[10px] text-slate-600">{filtered.length} of {anomalies.length}</span>
          )}
        </div>
      )}

      {/* Cards list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-500">
          <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm font-medium">No anomalies</p>
          <p className="text-xs mt-0.5 opacity-60">
            {anomalies.length > 0 ? "Try adjusting the filters" : "System monitoring your resources"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((a) => <AnomalyCard key={a.id} anomaly={a} />)}
        </div>
      )}
    </div>
  );
}
