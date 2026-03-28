import { useGlobalData } from "../context/CostDataContext";
import { Panel } from "../components/Panel";
import { BudgetWidget } from "../components/BudgetWidget";

export function BudgetsPage() {
  const { data } = useGlobalData();

  return (
    <div className="space-y-6 animate-fade-in fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Budgets</h1>
          <p className="text-slate-400 mt-1">Track spend against limits with proactive alerts.</p>
        </div>
      </div>

      <Panel title="Active Budgets" subtitle="Manage your spending guardrails">
        <BudgetWidget 
          budgets={data.budgets} 
          onCreateBudget={data.createBudget} 
          onDeleteBudget={data.deleteBudget} 
        />
      </Panel>
    </div>
  );
}
