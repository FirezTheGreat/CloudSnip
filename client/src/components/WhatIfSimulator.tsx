import { useState, useEffect } from "react";
import { Server, Zap, HardDrive, Calculator, ChevronRight, RefreshCw } from "lucide-react";

interface MachineType  { type: string; hourly_cost: number; monthly_cost: number }
interface DiskType     { type: string; cost_per_gb_month: number }
interface SimResult {
  label: string;
  current_cost_monthly: number;
  projected_cost_monthly: number;
  savings_monthly: number;
  savings_yearly: number;
  percent_change: number;
  resource_name?: string;
}

interface Resource {
  resource_id: string;
  name: string;
  resource_type: string;
  hourly_cost: number;
  metadata?: Record<string, any>;
}

interface Props {
  resources: Resource[];
}

function CostBar({ before, after, max }: { before: number; after: number; max: number }) {
  return (
    <div className="space-y-3 bg-black/40 p-4 rounded-xl border border-white/5">
      <div>
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
          <span>Current Allocation</span>
          <span className="text-white">${before.toFixed(2)}/mo</span>
        </div>
        <div className="h-4 rounded-full bg-white/5 overflow-hidden border border-white/5">
          <div
            className="h-full rounded-full bg-slate-500 transition-all duration-1000 ease-out"
            style={{ width: `${Math.min((before / max) * 100, 100)}%` }}
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-1.5">
          <span>Projected Allocation</span>
          <span>${after.toFixed(2)}/mo</span>
        </div>
        <div className="h-4 rounded-full bg-white/5 overflow-hidden border border-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 ease-out"
            style={{ width: `${Math.min((after / max) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function WhatIfSimulator({ resources }: Props) {
  const [machineTypes, setMachineTypes] = useState<MachineType[]>([]);
  const [diskTypes, setDiskTypes] = useState<DiskType[]>([]);
  const [changeType, setChangeType] = useState("machine_type");
  const [selectedResource, setSelectedResource] = useState<string>("");
  const [newMachineType, setNewMachineType] = useState("e2-micro");
  const [vmCount, setVmCount] = useState(1);
  const [maxInstances, setMaxInstances] = useState(10);
  const [diskSizeGb, setDiskSizeGb] = useState(10);
  const [diskType, setDiskType] = useState("pd-standard");
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/costs/what-if/options")
      .then((r) => r.json())
      .then((d) => {
        setMachineTypes(d.machine_types || []);
        setDiskTypes(d.disk_types || []);
      })
      .catch(() => null);
  }, []);

  const selectedRes = resources.find((r) => r.resource_id === selectedResource);

  async function simulate() {
    setLoading(true);
    setError(null);

    const body: Record<string, any> = {
      resource_id: selectedResource || undefined,
      change_type: changeType,
    };

    switch (changeType) {
      case "machine_type":
        body.current_value = selectedRes?.metadata?.machineType || "e2-medium";
        body.new_value = newMachineType;
        break;
      case "vm_count":
        body.current_value = selectedRes?.metadata?.machineType || "e2-medium";
        body.new_value = vmCount;
        break;
      case "max_instances":
        body.current_value = selectedRes?.metadata?.maxInstanceCount || 100;
        body.new_value = maxInstances;
        break;
      case "disk_size":
        body.current_value = diskType;
        body.new_value = diskSizeGb;
        break;
      case "disk_type":
        body.current_value = selectedRes?.metadata?.sizeGb || 10;
        body.new_value = diskType;
        break;
    }

    try {
      const res = await fetch("/api/costs/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Simulation failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  const maxMonthly = result
    ? Math.max(result.current_cost_monthly, result.projected_cost_monthly, 1)
    : 1;

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-wrap gap-2 border-b border-white/5 pb-4">
        {[
          { id: "machine_type",  label: "VM Resize",  icon: <Server className="w-3.5 h-3.5" /> },
          { id: "vm_count",      label: "VM Count",   icon: <Calculator className="w-3.5 h-3.5" /> },
          { id: "max_instances", label: "Function Cap", icon: <Zap className="w-3.5 h-3.5" /> },
          { id: "disk_size",     label: "Disk Size",  icon: <HardDrive className="w-3.5 h-3.5" /> },
          { id: "disk_type",     label: "Disk Type",  icon: <HardDrive className="w-3.5 h-3.5" /> },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => { setChangeType(opt.id); setResult(null); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
              changeType === opt.id
                ? "bg-indigo-600 text-white border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.4)]"
                : "bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            }`}
          >
            {opt.icon} {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {resources.length > 0 && (
          <div className="bg-black/20 p-4 rounded-xl border border-white/5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
              Baseline Resource Context (Optional)
            </label>
            <select
              value={selectedResource}
              onChange={(e) => setSelectedResource(e.target.value)}
              className="w-full px-4 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">— Use generic pricing defaults —</option>
              {resources
                .filter((r) => {
                  if (changeType === "max_instances") return r.resource_type === "cloud_function";
                  if (changeType === "disk_size" || changeType === "disk_type") return r.resource_type === "disk";
                  return r.resource_type === "compute";
                })
                .map((r) => (
                  <option key={r.resource_id} value={r.resource_id}>
                    {r.name || r.resource_id.split("/").pop()} · ${((r.hourly_cost || 0) * 730).toFixed(2)}/mo
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-4">
          <h4 className="flex items-center gap-2 text-[10px] font-bold text-white uppercase tracking-widest mb-3 pl-1 border-l-2 border-indigo-500">
            Target Configuration
          </h4>
          
          {changeType === "machine_type" && (
            <div>
              <select
                value={newMachineType}
                onChange={(e) => setNewMachineType(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-black/40 border border-white/10 rounded-lg text-white appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {machineTypes.map((m) => (
                  <option key={m.type} value={m.type}>
                    {m.type} · ${m.monthly_cost}/mo
                  </option>
                ))}
              </select>
            </div>
          )}

          {changeType === "vm_count" && (
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Instance Count</span>
                <span className="text-sm font-black text-white">{vmCount}</span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                value={vmCount}
                onChange={(e) => setVmCount(Number(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          )}

          {changeType === "max_instances" && (
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Function Concurrency Cap</span>
                <span className="text-sm font-black text-white">{maxInstances}</span>
              </div>
              <input
                type="range"
                min={1}
                max={200}
                value={maxInstances}
                onChange={(e) => setMaxInstances(Number(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          )}

          {changeType === "disk_size" && (
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Capacity</span>
                <span className="text-sm font-black text-white">{diskSizeGb} GB</span>
              </div>
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={diskSizeGb}
                onChange={(e) => setDiskSizeGb(Number(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          )}

          {(changeType === "disk_size" || changeType === "disk_type") && (
            <div className="mt-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Storage Tier</span>
              <div className="grid grid-cols-3 gap-2">
                {(diskTypes.length > 0
                  ? diskTypes
                  : [
                      { type: "pd-standard", cost_per_gb_month: 0.04 },
                      { type: "pd-balanced",  cost_per_gb_month: 0.10 },
                      { type: "pd-ssd",       cost_per_gb_month: 0.17 },
                    ]
                ).map((d) => (
                  <button
                    key={d.type}
                    onClick={() => setDiskType(d.type)}
                    className={`p-2 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                      diskType === d.type
                        ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-[0_0_10px_rgba(79,70,229,0.2)]"
                        : "bg-black/40 border-white/5 text-slate-500 hover:border-white/20 hover:text-slate-300"
                    }`}
                  >
                    <span className="text-xs font-bold uppercase">{d.type.replace("pd-", "")}</span>
                    <span className="text-[9px] font-mono mt-1 opacity-80">${d.cost_per_gb_month}/GB</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={simulate}
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 shadow-[0_4px_20px_rgba(79,70,229,0.4)] text-white text-sm font-bold uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group flex items-center justify-center gap-2"
      >
        {loading ? (
          <RefreshCw className="w-5 h-5 animate-spin" />
        ) : (
          <>
            Calculate ROI <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </button>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium animate-fade-in-up">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5 animate-slide-in-up mt-auto shadow-[0_0_30px_rgba(79,70,229,0.1)]">
          <p className="text-xs font-mono text-indigo-400 mb-4 pb-2 border-b border-indigo-500/20">
            {result.label}
          </p>

          <CostBar
            before={result.current_cost_monthly}
            after={result.projected_cost_monthly}
            max={maxMonthly}
          />

          <div className="grid grid-cols-3 gap-4 pt-5 mt-4 border-t border-white/5">
            <div className="text-center p-3 rounded-lg bg-black/40 border border-white/5">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Monthly Impact</p>
              <p className={`text-xl font-black tracking-tighter mt-1 ${result.savings_monthly >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {result.savings_monthly >= 0 ? "-" : "+"}${Math.abs(result.savings_monthly).toFixed(2)}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-black/40 border border-white/5">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Yearly Impact</p>
              <p className={`text-xl font-black tracking-tighter mt-1 ${result.savings_yearly >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {result.savings_yearly >= 0 ? "-" : "+"}${Math.abs(result.savings_yearly).toFixed(0)}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-black/40 border border-white/5">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Δ</p>
              <p className={`text-xl font-black tracking-tighter mt-1 ${result.percent_change <= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {result.percent_change > 0 ? "+" : ""}{result.percent_change}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
