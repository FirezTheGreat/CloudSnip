import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import type { WebSocketMessage } from "../types";

function getSocketUrl(): string {
  return import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
}

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);

  const connect = useCallback(() => {
    const socket = io(getSocketUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      setConnected(true);
      console.log("[Socket.IO] Connected", socket.id);
    });

    socket.on("disconnect", () => {
      setConnected(false);
      console.log("[Socket.IO] Disconnected");
    });

    socket.on("feed", (payload: unknown) => {
      try {
        if (payload && typeof payload === "object" && "type" in payload) {
          setMessages((prev) => [payload as WebSocketMessage, ...prev].slice(0, 100));
        }
      } catch {
        /* ignore malformed */
      }
    });

    socketRef.current = socket;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.removeAllListeners();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  return { connected, messages };
}
