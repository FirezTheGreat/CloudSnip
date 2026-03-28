import { useEffect, useState, useRef } from "react";
import type { WebSocketMessage } from "../types";

interface Toast {
  id: number;
  message: string;
  type: "anomaly" | "action" | "budget" | "info";
}

const TYPE_STYLES: Record<string, string> = {
  anomaly: "border-red-500/30 bg-red-500/10 text-red-300 backdrop-blur-xl",
  action: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 backdrop-blur-xl",
  budget: "border-amber-500/30 bg-amber-500/10 text-amber-300 backdrop-blur-xl",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-300 backdrop-blur-xl",
};

let nextId = 0;

interface Props {
  wsMessages: WebSocketMessage[];
}

export function ToastContainer({ wsMessages }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastProcessedRef = useRef(0);
  // Dedup: track recent message signatures to avoid duplicate toasts
  const recentSignatures = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (wsMessages.length <= lastProcessedRef.current) return;

    const newMessages = wsMessages.slice(lastProcessedRef.current);
    lastProcessedRef.current = wsMessages.length;

    for (const msg of newMessages) {
      let toast: Toast | null = null;
      let signature = "";

      if (msg.type === "anomalies_detected") {
        const count = (msg.data as { count?: number } | undefined)?.count || 0;
        signature = `anomaly-${count}-${Math.floor(Date.now() / 10000)}`;
        toast = { id: nextId++, message: `${count} new anomal${count === 1 ? "y" : "ies"} detected`, type: "anomaly" };
      } else if (msg.type === "action_completed") {
        const d = msg.data as { actionType?: string; savingsMonthly?: number; resourceId?: string } | undefined;
        signature = `action-${d?.actionType}-${d?.resourceId}-${Math.floor(Date.now() / 10000)}`;
        toast = {
          id: nextId++,
          message: `Action ${d?.actionType?.replace(/_/g, " ") || "completed"}${d?.savingsMonthly ? ` — saves $${d.savingsMonthly.toFixed(2)}/mo` : ""}`,
          type: "action",
        };
      } else if (msg.type === "budget_alert") {
        const d = msg.data as { message?: string } | undefined;
        signature = `budget-${Math.floor(Date.now() / 30000)}`;
        toast = { id: nextId++, message: d?.message || "Budget threshold crossed", type: "budget" };
      } else if (msg.type === "approval_needed") {
        const d = msg.data as { actionType?: string; resourceId?: string } | undefined;
        signature = `approval-${d?.resourceId}-${Math.floor(Date.now() / 10000)}`;
        toast = { id: nextId++, message: `Approval needed: ${d?.actionType?.replace(/_/g, " ")} on ${d?.resourceId || "resource"}`, type: "info" };
      }
      // Ignore simulation_triggered, intelligence_update, etc. to reduce noise

      if (toast && signature) {
        // Skip duplicate toasts within the same time window
        if (recentSignatures.current.has(signature)) continue;
        recentSignatures.current.add(signature);

        // Clean old signatures after 15s
        setTimeout(() => recentSignatures.current.delete(signature), 15000);

        const t = toast;
        setToasts((prev) => [t, ...prev].slice(0, 4));
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id));
        }, 5000);
      }
    }
  }, [wsMessages.length]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-xl border text-xs font-medium shadow-xl animate-fade-in pointer-events-auto ${TYPE_STYLES[t.type]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
