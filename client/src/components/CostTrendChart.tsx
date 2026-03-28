import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Line,
} from "recharts";
import type { CostTrend, ForecastPoint } from "../types";
import { format } from "date-fns";

const COLORS: Record<string, string> = {
  compute: "#3b82f6",
  cloud_function: "#8b5cf6",
  gcs: "#10b981",
  disk: "#f59e0b",
  cloud_sql: "#ef4444",
  fleet: "#e2e8f0",
  aggregate: "#94a3b8",
};

const LABELS: Record<string, string> = {
  compute: "Compute",
  cloud_function: "Functions",
  gcs: "Storage",
  disk: "Disks",
  cloud_sql: "Cloud SQL",
  fleet: "Fleet total ($/hr)",
  aggregate: "Aggregate",
};

const RANGE_OPTIONS = [
  { label: "1h", value: 1 },
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "7d", value: 168 },
];

interface Props {
  data: CostTrend[];
  forecast?: ForecastPoint[];
  hours?: number;
  onHoursChange?: (h: number) => void;
  showForecast?: boolean;
  onToggleForecast?: () => void;
}

type ChartRow = Record<string, string | number | undefined | null>;

function bucketBoundsMs(data: CostTrend[], hours: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const d of data) {
    const t = new Date(d.hour).getTime();
    if (Number.isFinite(t)) {
      min = Math.min(min, t);
      max = Math.max(max, t);
    }
  }
  const now = Date.now();
  if (!Number.isFinite(min)) {
    max = now;
    min = now - hours * 3600000;
  }
  if (!Number.isFinite(max)) max = now;
  return { min, max };
}

function formatAxisLabel(iso: string, hours: number, sameCalendarDay: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  if (hours <= 6) {
    return format(d, sameCalendarDay ? "HH:mm" : "MMM d, HH:mm");
  }
  if (hours <= 24) {
    return format(d, "EEE HH:mm");
  }
  return format(d, "MMM d");
}

export function CostTrendChart({
  data,
  forecast = [],
  hours = 24,
  onHoursChange,
  showForecast = false,
  onToggleForecast,
}: Props) {
  const { min: rangeMin, max: rangeMax } = bucketBoundsMs(data, hours);
  const sameDay =
    Number.isFinite(rangeMin) &&
    Number.isFinite(rangeMax) &&
    new Date(rangeMin).toDateString() === new Date(rangeMax).toDateString();

  const byBucket: Record<string, ChartRow> = {};
  for (const point of data) {
    const d = new Date(point.hour);
    if (Number.isNaN(d.getTime())) continue;
    const bucketKey = d.toISOString();
    if (!byBucket[bucketKey]) {
      byBucket[bucketKey] = {
        bucketKey,
        label: formatAxisLabel(bucketKey, hours, sameDay),
      };
    }
    byBucket[bucketKey][point.resource_type] = point.avg_value;
  }

  let chartData = Object.values(byBucket).sort((a, b) =>
    String(a.bucketKey).localeCompare(String(b.bucketKey))
  );

  const resourceTypes = [...new Set(data.map((d) => d.resource_type))].filter(
    (t) => chartData.some((row) => row[t] != null && row[t] !== "")
  );

  if (showForecast && forecast.length > 0) {
    const forecastSlice = forecast.slice(0, 48);
    for (const fp of forecastSlice) {
      const bucketKey = new Date(fp.ds).toISOString();
      chartData.push({
        bucketKey,
        label: formatAxisLabel(bucketKey, hours, sameDay),
        forecast: fp.yhat,
        forecast_upper: fp.yhat_upper,
        forecast_lower: fp.yhat_lower,
      });
    }
    chartData = chartData.sort((a, b) => String(a.bucketKey).localeCompare(String(b.bucketKey)));
  }

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-slate-500">
        <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        <p className="text-sm font-medium">No cost data yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          {resourceTypes.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: COLORS[type] || "#64748b", color: COLORS[type] || "#64748b" }} />
              <span className="text-xs text-slate-300 font-medium">{LABELS[type] || type}</span>
            </div>
          ))}
          {showForecast && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_currentColor] text-cyan-400" />
              <span className="text-xs text-cyan-400 font-medium tracking-wide">Forecast</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleForecast && forecast.length > 0 && (
            <button
              type="button"
              onClick={onToggleForecast}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all cursor-pointer ${
                showForecast
                  ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                  : "bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10"
              }`}
            >
              Forecast
            </button>
          )}
          {onHoursChange && (
            <div className="flex bg-black/40 rounded-lg border border-white/10 overflow-hidden p-0.5">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => onHoursChange(opt.value)}
                  className={`px-3 py-1 text-[10px] font-bold tracking-wider rounded-md transition-colors cursor-pointer ${
                    hours === opt.value ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[300px] min-w-0 w-full relative">
        <ResponsiveContainer width="99%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value.toFixed(3)}`} />
            <Tooltip
              isAnimationActive={false}
              contentStyle={{
                backgroundColor: "rgba(17, 24, 39, 0.9)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "12px",
                color: "#f8fafc",
                fontSize: 12,
                boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
              }}
              itemStyle={{ color: "#e2e8f0" }}
              labelStyle={{ color: "#94a3b8", marginBottom: "8px", fontWeight: "bold" }}
            />
            {resourceTypes.map((type) => (
              <Line
                key={type}
                type="monotone"
                dataKey={type}
                stroke={COLORS[type] || "#64748b"}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: COLORS[type] || "#64748b" }}
                name={LABELS[type] || type}
              />
            ))}
            {showForecast && (
              <>
                <Area
                  type="monotone"
                  dataKey="forecast_upper"
                  stroke="none"
                  fill="#22d3ee"
                  fillOpacity={0.1}
                  isAnimationActive={false}
                  name="Upper Bound"
                />
                <Area
                  type="monotone"
                  dataKey="forecast_lower"
                  stroke="none"
                  fill="#0B0F17"
                  fillOpacity={1}
                  isAnimationActive={false}
                  name="Lower Bound"
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  name="Forecast"
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
