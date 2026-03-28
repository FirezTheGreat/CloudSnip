import { useGlobalData } from "../context/CostDataContext";
import { Panel } from "../components/Panel";
import { ComplianceReport } from "../components/ComplianceReport";

export function CompliancePage() {
  const { data } = useGlobalData();

  return (
    <div className="space-y-6 animate-fade-in fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Governance & Compliance</h1>
          <p className="text-slate-400 mt-1">30-day audit of infrastructure risks and missing labels.</p>
        </div>
      </div>

      <Panel title="Compliance Report" subtitle="Identify untagged resources and unapproved regions">
        <ComplianceReport data={data.compliance} loading={data.loading} />
      </Panel>
    </div>
  );
}
