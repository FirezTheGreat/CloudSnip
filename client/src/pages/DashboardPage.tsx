import { useGlobalData } from "../context/CostDataContext";
import { CostTrendChart } from "../components/CostTrendChart";
import { AnomalyTimelineChart } from "../components/AnomalyTimelineChart";
import { AnomalyFeed } from "../components/AnomalyFeed";
import { Panel } from "../components/Panel";
import { StatCard } from "../components/StatCard";
import { PanelErrorBoundary } from "../components/PanelErrorBoundary";
import {
  SkeletonStatCard,
  SkeletonChart,
  SkeletonAnomalyCard,
} from "../components/SkeletonLoader";
import { Server, AlertTriangle, DollarSign, TrendingUp, CheckCircle, Calendar } from "lucide-react";
import { useState } from "react";

export function DashboardPage() {
  const { data, ws } = useGlobalData();
  const [showForecast, setShowForecast] = useState(false);

  if (data.loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonStatCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in fade-in-up">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight leading-tight">Dashboard Overview</h1>
          <p className="text-slate-400 mt-1">Real-time resource and cost intelligence.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Resources" value={data.summary?.active_resources ?? 0} icon={<Server className="w-4 h-4" />} />
        <StatCard 
          label="Open Anomalies" 
          value={data.summary?.open_anomalies ?? 0} 
          variant={(data.summary?.open_anomalies ?? 0) > 0 ? "danger" : "default"} 
          icon={<AlertTriangle className="w-4 h-4" />} 
        />
        <StatCard label="Current Cost" value={`$${Number(data.summary?.current_hourly_cost ?? 0).toFixed(4)}/hr`} icon={<DollarSign className="w-4 h-4" />} />
        <StatCard label="Monthly Savings" value={`$${Number(data.summary?.total_monthly_savings ?? 0).toFixed(2)}`} variant="success" icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Actions Taken" value={data.summary?.actions_taken ?? 0} icon={<CheckCircle className="w-4 h-4" />} />
        <StatCard label="Est. Monthly" value={`$${(Number(data.summary?.current_hourly_cost ?? 0) * 730).toFixed(2)}`} icon={<Calendar className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Cost Trends" subtitle={`Last ${data.trendHours}h · Estimated $/hr`} className="col-span-2 min-h-[400px]">
          <PanelErrorBoundary label="Cost Trends">
            {data.loading ? <SkeletonChart /> : (
              <CostTrendChart 
                data={data.costTrend} 
                forecast={data.forecast} 
                hours={data.trendHours} 
                onHoursChange={data.setTrendHours} 
                showForecast={showForecast} 
                onToggleForecast={() => setShowForecast(!showForecast)} 
              />
            )}
          </PanelErrorBoundary>
        </Panel>
        
        <Panel title="Live Anomaly Feed" subtitle="Real-time ML detections" className="max-h-[500px] overflow-y-auto custom-scrollbar">
          <PanelErrorBoundary label="Anomaly Feed">
            {data.loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({length: 3}).map((_, i) => <SkeletonAnomalyCard key={i} />)}
              </div>
            ) : (
              <AnomalyFeed anomalies={data.anomalies} wsMessages={ws.messages} />
            )}
          </PanelErrorBoundary>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Anomaly Timeline" subtitle={`Detected vs Resolved · ${data.trendHours}h window`}>
          <PanelErrorBoundary label="Anomaly Timeline">
            {data.loading ? <SkeletonChart height={200} lines={2} /> : (
              <AnomalyTimelineChart data={data.anomalyTimeline} hours={data.trendHours} />
            )}
          </PanelErrorBoundary>
        </Panel>
      </div>
    </div>
  );
}
