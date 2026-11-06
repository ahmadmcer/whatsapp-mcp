import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import { CONFIG, PATHS } from "../config/env.js";

// Ensure logs directory exists
try {
  if (!fs.existsSync(PATHS.LOGS_DIR)) {
    fs.mkdirSync(PATHS.LOGS_DIR, { recursive: true });
  }
} catch {
  // Ignored if permissions or filesystem errors occur
}

// Log destinations: ALWAYS write to process.stderr (never stdout)
// Stdout is exclusively reserved for MCP JSON-RPC protocol
const logFile = PATHS.LOG_FILE;
let fileStream: fs.WriteStream | null = null;
try {
  fileStream = fs.createWriteStream(logFile, { flags: "a" });
} catch {
  // Fallback to stderr only if file write fails
}

export const logger = pino(
  {
    level: CONFIG.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  pino.multistream(
    fileStream
      ? [{ stream: process.stderr }, { stream: fileStream }]
      : [{ stream: process.stderr }]
  )
);
