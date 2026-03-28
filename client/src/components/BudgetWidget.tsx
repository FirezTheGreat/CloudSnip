import { useState } from "react";
import type { Budget } from "../types";

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
    <div className="flex flex-col gap-3">
      {budgets.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium">No budgets configured</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-2 px-3 py-1.5 text-xs font-semibold bg-accent hover:bg-accent-muted text-white rounded-lg transition-colors cursor-pointer"
          >
            Create Budget
          </button>
        </div>
      )}

      {budgets.map((b) => {
        const pct = Math.min(b.percent_used, 100);
        const color =
          pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : pct >= 50 ? "bg-amber-500" : "bg-success";
        const textColor =
          pct >= 100 ? "text-danger" : pct >= 80 ? "text-warning" : "text-success";

        return (
          <div key={b.id} className="p-3 rounded-lg bg-surface-overlay/40 border border-border-subtle">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs font-semibold text-slate-700">{b.name}</span>
                <span className="ml-2 text-[10px] text-slate-500 uppercase">{b.resource_type}</span>
              </div>
              <button
                onClick={() => onDeleteBudget(b.id)}
                className="text-[10px] text-slate-600 hover:text-danger transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
            <div className="w-full bg-surface rounded-full h-2 mb-2">
              <div className={`h-2 rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className={`font-bold ${textColor}`}>{b.percent_used.toFixed(0)}%</span>
              <span className="text-slate-500">
                ${b.current_spend.toFixed(2)} / ${b.monthly_limit.toFixed(2)}
              </span>
            </div>
          </div>
        );
      })}

      {budgets.length > 0 && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="text-xs text-accent hover:text-accent-muted font-medium cursor-pointer transition-colors"
        >
          + Add Budget
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="p-3 rounded-lg bg-surface-overlay/60 border border-border-subtle space-y-2">
          <input
            type="text"
            placeholder="Budget name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-slate-700 placeholder-slate-600 focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Monthly limit ($)"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-slate-700 placeholder-slate-600 focus:outline-none focus:border-accent"
            />
            <select
              value={resType}
              onChange={(e) => setResType(e.target.value)}
              className="px-2 py-1.5 text-xs bg-surface border border-border rounded-lg text-slate-700 focus:outline-none focus:border-accent"
            >
              <option value="all">All</option>
              <option value="compute">Compute</option>
              <option value="cloud_function">Functions</option>
              <option value="disk">Disks</option>
              <option value="gcs">Storage</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-lg cursor-pointer hover:bg-accent-muted transition-colors">
              Create
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
