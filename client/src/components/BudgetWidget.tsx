import { useState } from "react";
import type { Budget } from "../types";
import { PlusCircle, Wallet, Trash2 } from "lucide-react";

interface Props {
  budgets: Budget[];
  onCreateBudget: (name: string, limit: number, type: string) => void;
  onDeleteBudget: (id: string) => void;
}

export function BudgetWidget({ budgets, onCreateBudget, onDeleteBudget }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [resType, setResType] = useState("all");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && limit) {
      onCreateBudget(name, Number(limit), resType);
      setName("");
      setLimit("");
      setShowForm(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {budgets.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-10 text-slate-500">
          <Wallet className="w-12 h-12 mb-3 opacity-30 text-indigo-400" />
          <p className="text-sm font-medium text-white/80">No budgets configured</p>
          <p className="text-[11px] text-slate-500 mt-1 mb-4">Set up guardrails to prevent unexpected spikes.</p>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all shadow-[0_4px_15px_rgba(79,70,229,0.3)] cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Create Budget
          </button>
        </div>
      )}

      {budgets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgets.map((b) => {
            const pct = Math.min(b.percent_used, 100);
            const isDanger = pct >= 100;
            const isWarning = pct >= 80 && pct < 100;
            
            const color = isDanger ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" 
                        : isWarning ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" 
                        : "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]";
                        
            const textColor = isDanger ? "text-red-400" : isWarning ? "text-amber-400" : "text-emerald-400";
            const cardBorder = isDanger ? "border-red-500/30 bg-red-500/5" 
                             : isWarning ? "border-amber-500/30 bg-amber-500/5"
                             : "border-white/5 bg-black/20";

            return (
              <div key={b.id} className={`p-4 rounded-xl ${cardBorder} hover:border-white/20 transition-all duration-300 relative group`}>
                <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white tracking-wide">{b.name}</span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{b.resource_type}</span>
                  </div>
                  <button
                    onClick={() => onDeleteBudget(b.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    title="Delete budget"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="mt-4 mb-2 flex items-baseline justify-between text-xs">
                  <span className={`text-[10px] uppercase font-bold tracking-wider text-slate-400`}>Utilization</span>
                  <span className={`font-black text-lg ${textColor}`}>{b.percent_used.toFixed(0)}%</span>
                </div>
                
                <div className="w-full bg-black/40 rounded-full h-2 mb-3 border border-white/5 overflow-hidden">
                  <div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${pct}%` }} />
                </div>
                
                <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
                  <span className="text-slate-400 font-mono">
                    <span className="text-white">${b.current_spend.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span> spent
                  </span>
                  <span className="text-slate-500 font-mono">
                    <span className="text-slate-300">${b.monthly_limit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span> limit
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {budgets.length > 0 && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mt-2 self-start flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-white cursor-pointer transition-colors bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg border border-indigo-500/20"
        >
          <PlusCircle className="w-3.5 h-3.5" /> Add Budget
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 mt-2 rounded-xl bg-indigo-900/10 border border-indigo-500/20 space-y-4 animate-slide-in-up md:w-1/2">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-300">New Budget Rule</h4>
          </div>
          
          <input
            type="text"
            placeholder="E.g., Production Fleet Limit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            required
          />
          
          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input
                type="number"
                placeholder="Monthly limit"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full pl-7 pr-4 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                required
                min="1"
              />
            </div>
            <select
              value={resType}
              onChange={(e) => setResType(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
            >
              <option value="all">All Resources</option>
              <option value="compute">Compute VMs</option>
              <option value="cloud_function">Functions</option>
              <option value="disk">Disks</option>
              <option value="gcs">Storage</option>
            </select>
          </div>
          
          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 px-4 py-2 text-xs font-bold uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer shadow-[0_4px_10px_rgba(79,70,229,0.3)] transition-all relative overflow-hidden group">
              <span className="relative z-10">Create Rule</span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer rounded-lg transition-colors border border-transparent hover:border-white/10">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
