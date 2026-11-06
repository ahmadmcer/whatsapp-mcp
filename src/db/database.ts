import fs from "node:fs";
import path from "node:path";
import DatabaseConstructor, { type Database } from "better-sqlite3";
import { SCHEMA_SQL } from "./schema.js";
import { PATHS } from "../config/env.js";
import { logger } from "../utils/logger.js";

export function initDatabase(dbPath: string = PATHS.DB_FILE): Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseConstructor(dbPath);

  // WAL mode for high concurrency and performance
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(SCHEMA_SQL);

  logger.debug({ dbPath }, "Initialized SQLite database with WAL mode");
  return db;
}
