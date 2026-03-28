import { useGlobalData } from "../context/CostDataContext";
import { Panel } from "../components/Panel";
import { Recommendations } from "../components/Recommendations";

export function RecommendationsPage() {
  const { data } = useGlobalData();

  return (
    <div className="space-y-6 animate-fade-in fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Recommendations</h1>
          <p className="text-slate-400 mt-1">AI-powered rightsizing and cleanup suggestions.</p>
        </div>
      </div>

      <Panel title="Savings Opportunities" subtitle="Review potential cost reductions">
        <Recommendations recommendations={data.recommendations} />
      </Panel>
    </div>
  );
}
