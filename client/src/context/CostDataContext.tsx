import { createContext, useContext } from "react";
import { useCostData } from "../hooks/useCostData";
import { useWebSocket } from "../hooks/useWebSocket";

type CostDataType = ReturnType<typeof useCostData>;
type WebSocketType = ReturnType<typeof useWebSocket>;

interface GlobalContextType {
  data: CostDataType;
  ws: WebSocketType;
}

export const CostDataContext = createContext<GlobalContextType | null>(null);

export function useGlobalData() {
  const ctx = useContext(CostDataContext);
  if (!ctx) throw new Error("useGlobalData must be used inside Provider");
  return ctx;
}
