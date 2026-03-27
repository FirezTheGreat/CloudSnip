import mongoose from "mongoose";
import { config } from "./config";

export async function connectDB() {
  try {
    await mongoose.connect(config.db.url);
    console.log("[DB] Connected to MongoDB");
  } catch (err: any) {
    console.error("[DB] Connection error:", err.message);
    process.exit(1);
  }
}

mongoose.connection.on("error", (err) => {
  console.error("[DB] Mongoose error:", err.message);
});
