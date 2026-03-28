import { useState } from "react";
import type { SimulationHistory } from "../types";

interface ScenarioConfig {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  tag: string;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: "idle_instance",
    label: "Idle VM",
    description: "Inject near-zero CPU metrics. Triggers idle detection → VM is stopped.",
    icon: <IconSleep />,
    color: "text-amber-400 border-amber-800/40 bg-amber-50 hover:bg-amber-50",
    tag: "stop_instance",
  },
  {
    id: "runaway_function",
    label: "Function Spike",
    description: "30× invocation burst on Cloud Function. Triggers cap to max 5 instances.",
    icon: <IconBolt />,
    color: "text-red-600 border-red-200 bg-red-50 hover:bg-red-50",
    tag: "cap_instances",
  },
  {
    id: "orphan_disk",
    label: "Orphan Disk",
    description: "Unattached persistent disk detected. Triggers disk-cleanup action.",
    icon: <IconDisk />,
    color: "text-orange-600 border-orange-200 bg-orange-50 hover:bg-orange-50",
    tag: "delete_disk",
  },
  {
    id: "traffic_spike",
    label: "Traffic Spike",
    description: "25× network surge on a VM. Resource labelled for review.",
    icon: <IconWave />,
    color: "text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-50",
    tag: "label_resource",
  },
  {
    id: "cost_spike",
    label: "Cost Spike",
    description: "Hourly cost inflated 4.5×. Triggers cost-spike detection + alert.",
    icon: <IconCost />,
    color: "text-purple-600 border-purple-200 bg-purple-50 hover:bg-purple-50",
    tag: "label_resource",
  },
];

interface SimulationControlProps {
  simulationHistory: SimulationHistory[];
  onTrigger: (scenario: string) => Promise<void>;
  onAutoRun: () => Promise<void>;
}

export function SimulationControl({ simulationHistory, onTrigger, onAutoRun }: SimulationControlProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function handleTrigger(scenarioId: string) {
    setLoading(scenarioId);
    setLastResult(null);
    try {
      await onTrigger(scenarioId);
      setLastResult(`✓ ${SCENARIOS.find((s) => s.id === scenarioId)?.label} triggered — watch the anomaly feed`);
    } catch {
      setLastResult("✗ Trigger failed — check server logs");
    } finally {
      setLoading(null);
    }
  }

  async function handleAutoRun() {
    setLoading("auto");
    setLastResult(null);
    try {
      await onAutoRun();
      setLastResult("✓ Auto-simulation cycle fired");
    } catch {
      setLastResult("✗ Auto-run failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-violet-900/40 border border-violet-700/40 text-violet-700">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Live Demo Mode
          </span>
        </div>
        <button
          onClick={handleAutoRun}
          disabled={loading !== null}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-700/30 hover:bg-violet-700/50 border border-violet-600/40 text-violet-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading === "auto" ? (
            <span className="w-3.5 h-3.5 border border-violet-300 border-t-transparent rounded-full animate-spin" />
          ) : (
            <IconDice />
          )}
          Random Scenario
        </button>
      </div>

      {/* Scenario cards grid */}
      <div className="grid grid-cols-1 gap-2 mb-4">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => handleTrigger(s.id)}
            disabled={loading !== null}
            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all
              disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group ${s.color}`}
          >
            <div className="mt-0.5 w-7 h-7 flex items-center justify-center shrink-0">
              {loading === s.id ? (
                <span className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                s.icon
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold">{s.label}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/20">
                  {s.tag}
                </span>
              </div>
              <p className="text-[10px] opacity-70 leading-relaxed">{s.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Result toast */}
      {lastResult && (
        <div
          className={`text-xs px-3 py-2 rounded-lg mb-3 font-medium ${
            lastResult.startsWith("✓")
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {lastResult}
        </div>
      )}

      {/* Simulation history mini-list */}
      {simulationHistory.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Recent Simulations
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {simulationHistory.slice(0, 8).map((ev) => (
              <div key={String(ev._id)} className="flex items-start gap-2 text-[10px]">
                <span
                  className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    ev.triggered_by === "manual" ? "bg-violet-400" : "bg-slate-500"
                  }`}
                />
                <div className="min-w-0">
                  <span className="font-medium text-slate-700">{ev.scenario}</span>
                  <span className="text-slate-500 ml-1.5">
                    {new Date(ev.triggered_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {ev.triggered_by === "auto" && (
                    <span className="ml-1 text-slate-600">(auto)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconSleep() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function IconDisk() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  );
}

function IconWave() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function IconCost() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
    </svg>
  );
}

function IconDice() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}
