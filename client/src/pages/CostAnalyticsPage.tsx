import { useState } from "react";
import { useGlobalData } from "../context/CostDataContext";
import { Panel } from "../components/Panel";
import { CostTrendChart } from "../components/CostTrendChart";
import { CostAllocationChart } from "../components/CostAllocationChart";
import { SavingsTracker } from "../components/SavingsTracker";

export function CostAnalyticsPage() {
  const { data } = useGlobalData();
  const [showForecast, setShowForecast] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Cost Analytics</h1>
          <p className="text-slate-400 mt-1">Deep dive into your cloud spending and forecasts.</p>
        </div>
      </div>

      <Panel title="Cost Trend & Forecast" subtitle={`Last ${data.trendHours}h + 7-day ML projection`}>
        <CostTrendChart 
          data={data.costTrend} 
          forecast={data.forecast} 
          hours={data.trendHours} 
          onHoursChange={data.setTrendHours} 
          showForecast={showForecast} 
          onToggleForecast={() => setShowForecast(!showForecast)} 
        />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Cost Allocation" subtitle="By GCP labels">
          <CostAllocationChart data={data.costByLabel} />
        </Panel>
        
        <Panel title="Total Savings" subtitle="Impact of optimizations over time">
          <SavingsTracker savings={data.savings} actions={data.actions} />
        </Panel>
      </div>
    </div>
  );
}
