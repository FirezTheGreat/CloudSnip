import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

let io: Server | undefined;

export function initSocketIO(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  io.on("connection", (socket) => {
    console.log("[Socket.IO] Client connected", socket.id);
    socket.emit("feed", { type: "connected", message: "CloudSnip — live feed" });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] Client disconnected", socket.id, reason);
    });
  });

  console.log("[Socket.IO] Attached to HTTP server");
}

export function broadcast(message: { type: string; data?: unknown }) {
  if (!io) return;

  io.emit("feed", message);

  const n = io.engine.clientsCount;
  if (n > 0) {
    console.log(`[Socket.IO] Broadcast ${message.type} to ${n} client(s)`);
  }
}
