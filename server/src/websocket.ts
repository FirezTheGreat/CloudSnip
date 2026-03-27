import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config";

let wss: WebSocketServer;

export function initWebSocket() {
  wss = new WebSocketServer({ port: config.server.wsPort });

  wss.on("connection", (ws) => {
    console.log("[WS] Client connected");
    ws.send(JSON.stringify({ type: "connected", message: "Cloud Cost Intel — live feed" }));

    ws.on("close", () => {
      console.log("[WS] Client disconnected");
    });
  });

  console.log(`[WS] WebSocket server running on port ${config.server.wsPort}`);
}

export function broadcast(message: { type: string; data: any }) {
  if (!wss) return;

  const payload = JSON.stringify(message);
  let sent = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });

  if (sent > 0) {
    console.log(`[WS] Broadcast ${message.type} to ${sent} clients`);
  }
}
