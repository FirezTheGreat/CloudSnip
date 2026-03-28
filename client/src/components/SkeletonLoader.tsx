// ─── Skeleton Loader Components ───────────────────────────────────────────────
// Used in place of real content while data is loading.
// Each variant matches the shape of its corresponding panel.

function Pulse({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`animate-pulse rounded bg-black/5 ${className}`} style={style} />
  );
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 animate-pulse">
      <Pulse className="h-3 w-20 mb-3" />
      <Pulse className="h-7 w-28 mb-2" />
      <Pulse className="h-2.5 w-16" />
    </div>
  );
}

export function SkeletonChart({ height = 280, lines = 3 }: { height?: number; lines?: number }) {
  return (
    <div className="animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Pulse className="h-2.5 w-2.5 rounded-full" />
            <Pulse className="h-2.5 w-12" />
          </div>
        ))}
      </div>
      <div className="relative" style={{ height }}>
        <Pulse className="absolute inset-0" />
        {/* Fake axis lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-4 px-2 pointer-events-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-t border-white/3" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonAnomalyCard() {
  return (
    <div className="rounded-xl border border-border bg-surface/50 p-3 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <Pulse className="h-7 w-7 rounded-lg" />
        <div className="flex-1">
          <Pulse className="h-3 w-24 mb-1.5" />
          <Pulse className="h-2.5 w-32" />
        </div>
        <Pulse className="h-6 w-10 rounded-full" />
      </div>
      <Pulse className="h-12 w-full rounded-lg mb-2" />
      <Pulse className="h-5 w-28 rounded-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      <div className="flex gap-4 mb-3 pb-2 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <Pulse key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2.5 border-b border-border/50">
          {Array.from({ length: cols }).map((_, j) => (
            <Pulse key={j} className="h-2.5 flex-1" style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonHeatmap() {
  return (
    <div className="animate-pulse">
      <div className="flex gap-1 mb-2">
        {Array.from({ length: 24 }).map((_, i) => (
          <Pulse key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: 7 }).map((_, row) => (
        <div key={row} className="flex gap-1 mb-1">
          <Pulse className="h-7 w-8 rounded" />
          {Array.from({ length: 24 }).map((_, col) => (
            <Pulse key={col} className="h-7 flex-1 rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonSimulationPanel() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
          <Pulse className="h-7 w-7 rounded-lg shrink-0" />
          <div className="flex-1">
            <Pulse className="h-3 w-24 mb-1.5" />
            <Pulse className="h-2.5 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
