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
    if (sameCalendarDay) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  if (hours <= 24) {
    return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
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
        <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
          />
        </svg>
        <p className="text-sm font-medium">No cost data yet</p>
        <p className="text-xs mt-1 opacity-60 text-center max-w-sm">
          Run <strong>Trigger Scan</strong> with GCP configured, or <code className="text-slate-600">npm run db:seed</code> for
          sample metrics. The chart uses <strong>estimated_cost</strong> from inventory.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4 flex-wrap">
          {resourceTypes.map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[type] || "#6b7280" }} />
              <span className="text-xs text-slate-600 font-medium">{LABELS[type] || type}</span>
            </div>
          ))}
          {showForecast && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span className="text-xs text-cyan-600 font-medium">Forecast</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onToggleForecast && forecast.length > 0 && (
            <button
              type="button"
              onClick={onToggleForecast}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-md border transition-colors cursor-pointer ${
                showForecast
                  ? "bg-cyan-50 text-cyan-600 border-cyan-200"
                  : "bg-surface text-slate-500 border-border hover:text-slate-700"
              }`}
            >
              Forecast
            </button>
          )}
          {onHoursChange && (
            <div className="flex bg-surface rounded-lg border border-border overflow-hidden">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => onHoursChange(opt.value)}
                  className={`px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
                    hours === opt.value ? "bg-accent text-white" : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              color: "#334155",
              fontSize: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          />
          {resourceTypes.map((type) => (
            <Line
              key={type}
              type="monotone"
              dataKey={type}
              stroke={COLORS[type] || "#6b7280"}
              strokeWidth={2}
              dot={false}
              connectNulls
              activeDot={{ r: 4, strokeWidth: 0 }}
              name={LABELS[type] || type}
            />
          ))}
          {showForecast && (
            <>
              <Area
                type="monotone"
                dataKey="forecast_upper"
                stroke="none"
                fill="#06b6d4"
                fillOpacity={0.08}
                name="Upper Bound"
              />
              <Area
                type="monotone"
                dataKey="forecast_lower"
                stroke="none"
                fill="#06b6d4"
                fillOpacity={0.08}
                name="Lower Bound"
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="#06b6d4"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls
                name="Forecast"
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
