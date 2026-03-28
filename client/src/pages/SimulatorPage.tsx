import { useGlobalData } from "../context/CostDataContext";
import { Panel } from "../components/Panel";
import { SimulationControl } from "../components/SimulationControl";
import { WhatIfSimulator } from "../components/WhatIfSimulator";

export function SimulatorPage() {
  const { data } = useGlobalData();

  return (
    <div className="space-y-6 animate-fade-in fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Simulation Engine</h1>
          <p className="text-slate-400 mt-1">Test anomaly rules and project hypothetical costs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Anomaly Injection" subtitle="Trigger synthetic metrics for the ML pipeline">
          <SimulationControl 
            simulationHistory={data.simulationHistory} 
            onTrigger={data.triggerSimulation} 
            onAutoRun={data.runAutoSimulation} 
          />
        </Panel>

        <Panel title="What-If Scenarios" subtitle="Calculate the ROI of machine resizing or disk changes">
          <WhatIfSimulator resources={data.resources} />
        </Panel>
      </div>
    </div>
  );
}
