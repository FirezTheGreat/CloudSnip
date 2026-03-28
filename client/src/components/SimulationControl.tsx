import { useState } from "react";
import type { SimulationHistory } from "../types";
import { Zap, HardDrive, Activity, Moon, DollarSign, RefreshCw, Layers } from "lucide-react";

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
    icon: <Moon className="w-5 h-5 text-indigo-400" />,
    color: "text-indigo-400 border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/20 hover:border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.1)]",
    tag: "stop_instance",
  },
  {
    id: "runaway_function",
    label: "Function Spike",
    description: "30× invocation burst on Cloud Function. Triggers cap to max 5 instances.",
    icon: <Zap className="w-5 h-5 text-amber-400" />,
    color: "text-amber-400 border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
    tag: "cap_instances",
  },
  {
    id: "orphan_disk",
    label: "Orphan Disk",
    description: "Unattached persistent disk detected. Triggers disk-cleanup action.",
    icon: <HardDrive className="w-5 h-5 text-slate-400" />,
    color: "text-slate-400 border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]",
    tag: "delete_disk",
  },
  {
    id: "traffic_spike",
    label: "Traffic Spike",
    description: "25× network surge on a VM. Resource labelled for review.",
    icon: <Activity className="w-5 h-5 text-cyan-400" />,
    color: "text-cyan-400 border-cyan-500/20 bg-cyan-500/10 hover:bg-cyan-500/20 hover:border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.1)]",
    tag: "label_resource",
  },
  {
    id: "cost_spike",
    label: "Cost Spike",
    description: "Hourly cost inflated 4.5×. Triggers cost-spike detection + alert.",
    icon: <DollarSign className="w-5 h-5 text-red-400" />,
    color: "text-red-400 border-red-500/20 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.1)]",
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse shadow-[0_0_8px_currentColor]" />
            Live Demo Mode
          </span>
        </div>
        <button
          onClick={handleAutoRun}
          disabled={loading !== null}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group"
        >
          {loading === "auto" ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Layers className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
          )}
          Random Scenario
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => handleTrigger(s.id)}
            disabled={loading !== null}
            className={`flex flex-col gap-2 p-4 rounded-xl border text-left transition-all duration-300
              disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group ${s.color}`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/40 border border-white/5 shrink-0">
                  {loading === s.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-current" />
                  ) : (
                    s.icon
                  )}
                </div>
                <span className="text-sm font-bold tracking-wide">{s.label}</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/40 border border-white/5">
                {s.tag}
              </span>
            </div>
            <p className="text-[11px] opacity-80 leading-relaxed font-mono">{s.description}</p>
          </button>
        ))}
      </div>

      {lastResult && (
        <div
          className={`text-xs px-4 py-3 rounded-xl mb-4 font-bold border ${
            lastResult.startsWith("✓")
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          } animate-fade-in-up flex items-center gap-2`}
        >
          {lastResult}
        </div>
      )}

      {simulationHistory.length > 0 && (
        <div className="mt-auto pt-4 border-t border-white/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 pl-1">
            Recent Injections
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
            {simulationHistory.slice(0, 8).map((ev) => (
              <div key={String(ev._id)} className="flex items-center gap-3 text-xs bg-black/40 p-2 rounded-lg border border-white/5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor] ${
                    ev.triggered_by === "manual" ? "bg-violet-400 text-violet-400" : "bg-emerald-400 text-emerald-400"
                  }`}
                />
                <span className="font-bold text-white min-w-[120px]">{ev.scenario}</span>
                <span className="text-slate-400 font-mono text-[10px]">
                  {new Date(ev.triggered_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })}
                </span>
                {ev.triggered_by === "auto" && (
                  <span className="ml-auto px-1.5 py-0.5 bg-white/5 text-slate-400 rounded text-[9px] uppercase font-bold border border-white/10">auto</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
