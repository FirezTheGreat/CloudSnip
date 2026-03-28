import { NavLink, Outlet } from "react-router-dom";
import { 
  LayoutDashboard, 
  Server, 
  AlertTriangle, 
  Zap, 
  PieChart, 
  Lightbulb, 
  CreditCard, 
  ShieldCheck, 
  PlaySquare,
  Activity
} from "lucide-react";
import { useGlobalData } from "../context/CostDataContext";
import { PipelineHealthIndicator } from "./PipelineHealthIndicator";
import { ToastContainer } from "./ToastContainer";
import LightPillar from "./LightPillar";

export function SidebarLayout() {
  const { data, ws } = useGlobalData();
  const pendingCount = (data.actions ?? []).filter((a) => a.status === "pending_approval").length;

  const navItems = [
    { label: "Dashboard", path: "/", icon: <LayoutDashboard size={20} /> },
    { label: "Resources", path: "/resources", icon: <Server size={20} /> },
    { label: "Anomalies", path: "/anomalies", icon: <AlertTriangle size={20} /> },
    { label: "Actions", path: "/actions", icon: <Zap size={20} />, badge: pendingCount > 0 ? pendingCount : 0 },
    { label: "Cost Analytics", path: "/costs", icon: <PieChart size={20} /> },
    { label: "Recommendations", path: "/recommendations", icon: <Lightbulb size={20} /> },
    { label: "Budgets", path: "/budgets", icon: <CreditCard size={20} /> },
    { label: "Compliance", path: "/compliance", icon: <ShieldCheck size={20} /> },
    { label: "Simulator", path: "/simulator", icon: <PlaySquare size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-black text-slate-200 overflow-hidden font-sans selection:bg-slate-500/30 relative">
      {/* Three.js Animated Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden" }}>
        <LightPillar
          topColor="#5227FF"
          bottomColor="#FF9FFC"
          intensity={1}
          rotationSpeed={0.3}
          glowAmount={0.002}
          pillarWidth={3}
          pillarHeight={0.4}
          noiseIntensity={0.5}
          pillarRotation={25}
          interactive={false}
          mixBlendMode="screen"
          quality="high"
        />
      </div>

      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-slate-300/10 blur-[120px] pointer-events-none z-0" />
      <div className="fixed top-[20%] right-[-5%] w-[35%] h-[35%] rounded-full bg-slate-500/10 blur-[150px] pointer-events-none z-0" />
      
      <ToastContainer wsMessages={ws.messages} />

      {/* Sidebar */}
      <aside className="w-64 bg-slate-900/30 backdrop-blur-2xl border-r border-white/10 flex flex-col z-20 shadow-[4px_0_24px_-2px_rgba(0,0,0,0.3)]">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">CloudSnip</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? "bg-blue-500/10 text-blue-400 font-medium" 
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300 transition-colors"}>
                    {item.icon}
                  </div>
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-400 rounded-full">
                      {item.badge}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Global Controls */}
        <div className="p-4 mt-auto border-t border-white/5">
          <PipelineHealthIndicator />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${ws.connected ? "bg-emerald-500 animate-pulse-live shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-red-500"}`} />
              <span className="text-xs font-medium text-slate-400">
                {ws.connected ? "Live Config" : "Offline"}
              </span>
            </div>
            <button
              onClick={data.triggerScan}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all cursor-pointer shadow-[0_0_10px_rgba(37,99,235,0.3)] hover:shadow-[0_0_15px_rgba(37,99,235,0.5)]"
            >
              Trigger
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 relative overflow-y-auto no-scrollbar z-10 scroll-smooth">
        <div className="max-w-[1600px] mx-auto p-8 lg:p-12 min-h-full flex flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
