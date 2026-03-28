import { useEffect, useState } from "react";

interface PipelineStatus {
  lastRunAt: string | null;
  nextRunIn: number | null; // seconds
  mlOnline: boolean;
  cyclesCompleted: number;
  lastRunDurationMs: number | null;
}

/**
 * PipelineHealthIndicator
 *
 * Shows judges (and developers) that the system is continuously working:
 * - When the last telemetry scan ran
 * - Countdown to the next scan
 * - Whether the ML service is reachable
 * - How many pipeline cycles have completed this session
 */
export function PipelineHealthIndicator() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [secondsSince, setSecondsSince] = useState(0);
  const [nextIn, setNextIn] = useState<number | null>(null);

  // Poll the /api/dashboard/pipeline-status endpoint every 10s
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/dashboard/pipeline-status");
        if (!res.ok) return;
        const data: PipelineStatus = await res.json();
        setStatus(data);
        setNextIn(data.nextRunIn);
        setSecondsSince(0);
      } catch {
        // silent — don't crash if server isn't up yet
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Local second-by-second tick so the "X seconds ago" and countdown update
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsSince((s) => s + 1);
      setNextIn((n) => (n !== null && n > 0 ? n - 1 : n));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const totalElapsed = (status ? secondsSince : null);

  function humanAgo(secs: number): string {
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s ago`;
  }

  function humanCountdown(secs: number | null): string {
    if (secs === null) return "—";
    if (secs <= 0) return "running…";
    if (secs < 60) return `in ${secs}s`;
    return `in ${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  if (!status) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-raised border border-border">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
        <span className="text-[10px] text-slate-600">Pipeline connecting…</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-surface-raised border border-border text-[10px]">
      {/* ML service health */}
      <div className="flex items-center gap-1">
        <span
          className={`w-1.5 h-1.5 rounded-full ${status.mlOnline ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`}
        />
        <span className={status.mlOnline ? "text-emerald-500" : "text-red-600"}>
          ML {status.mlOnline ? "online" : "offline"}
        </span>
      </div>

      <span className="text-slate-700">|</span>

      {/* Last run */}
      <div className="flex items-center gap-1 text-slate-500">
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Last scan: {totalElapsed !== null ? humanAgo(totalElapsed) : "never"}</span>
      </div>

      <span className="text-slate-700">|</span>

      {/* Next run */}
      <span className="text-slate-500">
        Next: <span className="text-slate-600 font-medium">{humanCountdown(nextIn)}</span>
      </span>

      {/* Cycles */}
      {status.cyclesCompleted > 0 && (
        <>
          <span className="text-slate-700">|</span>
          <span className="text-slate-600">
            {status.cyclesCompleted} cycle{status.cyclesCompleted !== 1 ? "s" : ""}
          </span>
        </>
      )}

      {/* Duration */}
      {status.lastRunDurationMs !== null && (
        <span className="text-slate-700 hidden xl:block">
          · {(status.lastRunDurationMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}
