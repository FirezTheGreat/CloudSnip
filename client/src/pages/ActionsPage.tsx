import { useGlobalData } from "../context/CostDataContext";
import { Panel } from "../components/Panel";
import { ActionLog } from "../components/ActionLog";

export function ActionsPage() {
  const { data } = useGlobalData();

  return (
    <div className="space-y-6 animate-fade-in fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Automation Actions</h1>
          <p className="text-slate-400 mt-1">Manage infrastructure changes and approvals.</p>
        </div>
      </div>

      <Panel title="Action Log" subtitle="History of all automated and manual actions executed">
        <ActionLog 
          actions={data.actions} 
          onApprove={data.approveAction} 
          onReject={data.rejectAction} 
          onRollback={data.rollbackAction} 
        />
      </Panel>
    </div>
  );
}
