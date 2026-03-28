import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Mini gauge ───────────────────────────────────────────────────────────────

function CostBar({ before, after, max }: { before: number; after: number; max: number }) {
  return (
    <div className="space-y-1.5">
      <div>
        <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
          <span>Current</span>
          <span>${before.toFixed(2)}/mo</span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-red-500/70 transition-all duration-500"
            style={{ width: `${Math.min((before / max) * 100, 100)}%` }}
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
          <span>Projected</span>
          <span>${after.toFixed(2)}/mo</span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
            style={{ width: `${Math.min((after / max) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
    <div className="space-y-4">
      {/* Change type tabs */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { id: "machine_type",  label: "Machine Type",  emoji: "🖥️" },
          { id: "vm_count",      label: "VM Count",      emoji: "🔢" },
          { id: "max_instances", label: "Max Instances", emoji: "⚡" },
          { id: "disk_size",     label: "Disk Size",     emoji: "💽" },
          { id: "disk_type",     label: "Disk Type",     emoji: "🗄️" },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => { setChangeType(opt.id); setResult(null); }}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
              changeType === opt.id
                ? "bg-violet-900/50 border-violet-700/60 text-violet-200"
                : "bg-surface border-border text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {opt.emoji} {opt.label}
          </button>
        ))}
      </div>

      {/* Optional: resource selector */}
      {resources.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Resource (optional — for exact current cost)
          </label>
          <select
            value={selectedResource}
            onChange={(e) => setSelectedResource(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-xs bg-surface border border-border rounded-lg text-slate-700 focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="">— use pricing table defaults —</option>
            {resources
              .filter((r) => {
                if (changeType === "max_instances") return r.resource_type === "cloud_function";
                if (changeType === "disk_size" || changeType === "disk_type") return r.resource_type === "disk";
                return r.resource_type === "compute";
              })
              .map((r) => (
                <option key={r.resource_id} value={r.resource_id}>
                  {r.name || r.resource_id} · ${((r.hourly_cost || 0) * 730).toFixed(2)}/mo
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Change-specific controls */}
      <div className="space-y-3">
        {changeType === "machine_type" && (
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              New Machine Type
            </label>
            <select
              value={newMachineType}
              onChange={(e) => setNewMachineType(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-xs bg-surface border border-border rounded-lg text-slate-700 focus:outline-none focus:border-accent cursor-pointer"
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
            <div className="flex justify-between mb-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Number of VMs
              </label>
              <span className="text-[11px] font-bold text-slate-800">{vmCount}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={vmCount}
              onChange={(e) => setVmCount(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
              <span>1</span><span>20</span>
            </div>
          </div>
        )}

        {changeType === "max_instances" && (
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Max Function Instances
              </label>
              <span className="text-[11px] font-bold text-slate-800">{maxInstances}</span>
            </div>
            <input
              type="range"
              min={1}
              max={200}
              value={maxInstances}
              onChange={(e) => setMaxInstances(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
              <span>1</span><span>200</span>
            </div>
          </div>
        )}

        {changeType === "disk_size" && (
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Disk Size (GB)
              </label>
              <span className="text-[11px] font-bold text-slate-800">{diskSizeGb} GB</span>
            </div>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={diskSizeGb}
              onChange={(e) => setDiskSizeGb(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
          </div>
        )}

        {(changeType === "disk_size" || changeType === "disk_type") && (
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Disk Type
            </label>
            <div className="flex gap-2 mt-1">
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
                  className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition-all cursor-pointer ${
                    diskType === d.type
                      ? "bg-violet-900/50 border-violet-700/60 text-violet-200"
                      : "bg-surface border-border text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {d.type.replace("pd-", "")}
                  <br />
                  <span className="text-[9px] font-normal opacity-70">
                    ${d.cost_per_gb_month}/GB/mo
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Simulate button */}
      <button
        onClick={simulate}
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-violet-700/40 hover:bg-violet-700/60 border border-violet-600/40 text-violet-200 text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border border-violet-300 border-t-transparent rounded-full animate-spin" />
            Calculating…
          </span>
        ) : (
          "⚡ Run Simulation"
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3 animate-fade-in-up">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">
              Scenario
            </p>
            <p className="text-xs text-slate-700 font-medium">{result.label}</p>
          </div>

          <CostBar
            before={result.current_cost_monthly}
            after={result.projected_cost_monthly}
            max={maxMonthly}
          />

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">Monthly Δ</p>
              <p className={`text-sm font-bold mt-0.5 ${result.savings_monthly >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {result.savings_monthly >= 0 ? "-" : "+"}{Math.abs(result.savings_monthly).toFixed(2)}
                <span className="text-[9px] font-normal text-slate-500"> /mo</span>
              </p>
            </div>
            <div className="text-center border-x border-border">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">Yearly Δ</p>
              <p className={`text-sm font-bold mt-0.5 ${result.savings_yearly >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {result.savings_yearly >= 0 ? "-" : "+"}{Math.abs(result.savings_yearly).toFixed(0)}
                <span className="text-[9px] font-normal text-slate-500"> /yr</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">Change</p>
              <p className={`text-sm font-bold mt-0.5 ${result.percent_change <= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {result.percent_change > 0 ? "+" : ""}{result.percent_change}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
