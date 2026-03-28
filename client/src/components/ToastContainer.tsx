import { useEffect, useState } from "react";
import type { WebSocketMessage } from "../types";

interface Toast {
  id: number;
  message: string;
  type: "anomaly" | "action" | "budget" | "info";
}

const TYPE_STYLES: Record<string, string> = {
  anomaly: "border-red-200 bg-red-50 text-red-700",
  action: "border-emerald-200 bg-emerald-50 text-emerald-700",
  budget: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
};

let nextId = 0;

interface Props {
  wsMessages: WebSocketMessage[];
}

export function ToastContainer({ wsMessages }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastProcessed, setLastProcessed] = useState(0);

  useEffect(() => {
    if (wsMessages.length <= lastProcessed) return;

    const newMessages = wsMessages.slice(0, wsMessages.length - lastProcessed);
    setLastProcessed(wsMessages.length);

    for (const msg of newMessages) {
      let toast: Toast | null = null;

      if (msg.type === "anomalies_detected") {
        const count = (msg.data as { count?: number } | undefined)?.count || 0;
        toast = { id: nextId++, message: `${count} new anomal${count === 1 ? "y" : "ies"} detected`, type: "anomaly" };
      } else if (msg.type === "action_completed") {
        const d = msg.data as { actionType?: string; savingsMonthly?: number } | undefined;
        toast = {
          id: nextId++,
          message: `Action ${d?.actionType?.replace(/_/g, " ") || "completed"}${d?.savingsMonthly ? ` — saves $${d.savingsMonthly.toFixed(2)}/mo` : ""}`,
          type: "action",
        };
      } else if (msg.type === "budget_alert") {
        const d = msg.data as { message?: string } | undefined;
        toast = { id: nextId++, message: d?.message || "Budget threshold crossed", type: "budget" };
      } else if (msg.type === "approval_needed") {
        const d = msg.data as { actionType?: string; resourceId?: string } | undefined;
        toast = { id: nextId++, message: `Approval needed: ${d?.actionType?.replace(/_/g, " ")} on ${d?.resourceId || "resource"}`, type: "info" };
      }

      if (toast) {
        const t = toast;
        setToasts((prev) => [t, ...prev].slice(0, 5));
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id));
        }, 6000);
      }
    }
  }, [wsMessages.length]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-100 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-lg border backdrop-blur-sm text-xs font-medium shadow-lg animate-fade-in-up pointer-events-auto ${TYPE_STYLES[t.type]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
