import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeatmapCell {
  day: string;
  day_index: number;
  hour: number;
  count: number;
  types: string[];
}

interface Props {
  cells: HeatmapCell[];
  maxCount: number;
}

// ─── Colour scale ─────────────────────────────────────────────────────────────

function cellColor(count: number, maxCount: number): string {
  if (count === 0) return "bg-slate-100 border-slate-200";
  const intensity = Math.min(count / maxCount, 1);
  if (intensity < 0.25) return "bg-amber-100/80 border-amber-200";
  if (intensity < 0.50) return "bg-orange-200/90 border-orange-300";
  if (intensity < 0.75) return "bg-red-300/90 border-red-400";
  return "bg-red-500/90 border-red-600";
}

function cellTextColor(count: number, maxCount: number): string {
  if (count === 0) return "text-slate-400";
  const intensity = count / maxCount;
  if (intensity < 0.25) return "text-amber-800";
  if (intensity < 0.75) return "text-orange-900";
  return "text-white";
}

// ─── Component ────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AnomalyHeatmap({ cells, maxCount }: Props) {
  const [tooltip, setTooltip] = useState<{
    cell: HeatmapCell;
    x: number;
    y: number;
  } | null>(null);

  const getCellsByDay = useCallback(
    (day: string) => {
      const dayCells = cells.filter((c) => c.day === day);
      const byHour: Record<number, HeatmapCell> = {};
      dayCells.forEach((c) => (byHour[c.hour] = c));
      return HOURS.map((h) => byHour[h] || { day, day_index: 0, hour: h, count: 0, types: [] });
    },
    [cells]
  );

  if (!cells || cells.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
        No anomaly data for the past 7 days
      </div>
    );
  }

  return (
    <div className="relative select-none">
      {/* Hour labels */}
      <div className="flex items-center mb-1 ml-10">
        {HOURS.filter((h) => h % 4 === 0).map((h) => (
          <div
            key={h}
            className="text-[9px] text-slate-600 font-mono"
            style={{ width: `${(4 / 24) * 100}%` }}
          >
            {h.toString().padStart(2, "0")}:00
          </div>
        ))}
      </div>

      {/* Grid */}
      {DAYS_ORDER.map((day) => {
        const dayCells = getCellsByDay(day);
        return (
          <div key={day} className="flex items-center gap-0.5 mb-0.5">
            {/* Day label */}
            <div className="w-9 text-right text-[10px] text-slate-500 font-medium pr-1.5 shrink-0">
              {day}
            </div>

            {/* Hour cells */}
            <div className="flex gap-0.5 flex-1">
              {dayCells.map((cell) => (
                <div
                  key={cell.hour}
                  className={`flex-1 h-6 rounded-sm border cursor-pointer transition-all ${cellColor(
                    cell.count,
                    maxCount
                  )} hover:scale-110 hover:z-10 hover:shadow-lg`}
                  onMouseEnter={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setTooltip({ cell, x: rect.left, y: rect.top });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {cell.count > 0 && (
                    <span
                      className={`flex items-center justify-center h-full text-[8px] font-bold ${cellTextColor(
                        cell.count,
                        maxCount
                      )}`}
                    >
                      {cell.count > 9 ? "9+" : cell.count}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 ml-10">
        <span className="text-[9px] text-slate-500">Less</span>
        {[0, 0.2, 0.4, 0.6, 0.85, 1].map((intensity, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-sm border ${
              intensity === 0
                ? "bg-slate-100 border-slate-200"
                : intensity < 0.25
                ? "bg-amber-100/80 border-amber-200"
                : intensity < 0.5
                ? "bg-orange-200/90 border-orange-300"
                : intensity < 0.75
                ? "bg-red-300/90 border-red-400"
                : "bg-red-500/90 border-red-600"
            }`}
          />
        ))}
        <span className="text-[9px] text-slate-500">More</span>
      </div>

      {/* Tooltip (fixed, portal-like) */}
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 rounded-lg bg-slate-200 border border-slate-200 shadow-2xl text-xs pointer-events-none"
          style={{ left: tooltip.x + 8, top: tooltip.y - 60 }}
        >
          <div className="font-semibold text-slate-800 mb-0.5">
            {tooltip.cell.day} {tooltip.cell.hour.toString().padStart(2, "0")}:00
          </div>
          <div className="text-slate-600">
            {tooltip.cell.count === 0
              ? "No anomalies"
              : `${tooltip.cell.count} anomal${tooltip.cell.count === 1 ? "y" : "ies"}`}
          </div>
          {tooltip.cell.types.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tooltip.cell.types.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] text-slate-600"
                >
                  {t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
