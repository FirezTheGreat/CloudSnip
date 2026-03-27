import fs from "fs";
import path from "path";
import { pool } from "../db";

async function runMigrations() {
  console.log("[Migration] Connecting to database...");

  const migrationFile = path.join(__dirname, "001_initial.sql");
  const sql = fs.readFileSync(migrationFile, "utf-8");

  try {
    await pool.query(sql);
    console.log("[Migration] Schema created successfully");
  } catch (err: any) {
    if (err.message?.includes("already a hypertable")) {
      console.log("[Migration] Tables already exist — skipping");
    } else {
      console.error("[Migration] Error:", err.message);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

runMigrations();
