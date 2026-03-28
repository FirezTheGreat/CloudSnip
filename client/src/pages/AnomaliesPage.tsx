import { useGlobalData } from "../context/CostDataContext";
import { Panel } from "../components/Panel";
import { AnomalyFeed } from "../components/AnomalyFeed";

export function AnomaliesPage() {
  const { data, ws } = useGlobalData();

  return (
    <div className="space-y-6 animate-fade-in fade-in-up h-[calc(100vh-6rem)] flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Anomaly Detections</h1>
          <p className="text-slate-400 mt-1">Review AI-detected cost and usage anomalies.</p>
        </div>
      </div>

      <Panel title="Anomaly Feed" subtitle="All detections" className="flex-1 overflow-hidden flex flex-col">
        <AnomalyFeed anomalies={data.anomalies} wsMessages={ws.messages} />
      </Panel>
    </div>
  );
}
