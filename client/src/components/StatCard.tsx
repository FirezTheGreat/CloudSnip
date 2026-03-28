import { ReactNode } from "react";
import { useCountUp } from "../hooks/useCountUp";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StatCardProps {
  label: string;
  value: string | number;
  variant?: "default" | "success" | "danger" | "warning";
  icon?: ReactNode;
}

export function StatCard({ label, value, variant = "default", icon }: StatCardProps) {
  const numericTarget = typeof value === "number" ? value : null;
  const animated = useCountUp(numericTarget ?? 0, 800);

  const colors = {
    default: "text-slate-200 bg-blue-500/10 border-blue-500/20 shadow-blue-500/10 text-blue-400",
    success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/10 text-emerald-400",
    danger: "text-red-400 bg-red-500/10 border-red-500/20 shadow-red-500/10 text-red-400",
    warning: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20 shadow-yellow-500/10 text-yellow-400",
  };

  const currentColors = colors[variant];

  return (
    <div className="flex flex-col p-5 bg-[#1A2234]/80 backdrop-blur-xl rounded-2xl border border-white/5 hover:border-white/10 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5 group relative overflow-hidden">
      {/* Glow effect on hover */}
      <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 blur-xl", currentColors.split(" ")[1])} />
      
      <div className="flex items-start justify-between relative z-10">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        {icon && (
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border", currentColors.split(" ").slice(1).join(" "))}>
            {icon}
          </div>
        )}
      </div>
      <div className="mt-4 relative z-10">
        <p className={cn("text-3xl font-bold tracking-tight tabular-nums", variant === 'default' ? 'text-white' : currentColors.split(' ')[0])}>
          {numericTarget !== null ? animated : value}
        </p>
      </div>
    </div>
  );
}
