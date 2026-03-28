import { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  children,
  className = "",
  action
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={`bg-[#111827]/60 backdrop-blur-2xl rounded-2xl border border-white/10 p-6 flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-white/15 ${className}`}>
      <div className="flex items-start justify-between mb-6 pb-4 border-b border-white/5">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
          {subtitle && <p className="text-sm mt-1 text-slate-400">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="flex-1 overflow-x-auto no-scrollbar">
        {children}
      </div>
    </div>
  );
}
