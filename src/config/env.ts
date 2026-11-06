import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

export const WORKSPACE_ROOT = process.cwd();

export const PATHS = {
  AUTH_DIR: process.env.WHATSAPP_AUTH_DIR || path.join(WORKSPACE_ROOT, "auth_info"),
  DATA_DIR: process.env.WHATSAPP_DATA_DIR || path.join(WORKSPACE_ROOT, "data"),
  MEDIA_DIR: process.env.WHATSAPP_MEDIA_DIR || path.join(WORKSPACE_ROOT, "data", "media"),
  LOGS_DIR: process.env.WHATSAPP_LOGS_DIR || path.join(WORKSPACE_ROOT, "logs"),
  DB_FILE: process.env.WHATSAPP_DB_FILE || path.join(WORKSPACE_ROOT, "data", "whatsapp.db"),
  LOG_FILE: path.join(WORKSPACE_ROOT, "logs", "whatsapp-mcp.log"),
};

export const CONFIG = {
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  SERVER_NAME: "whatsapp-mcp",
  SERVER_VERSION: "1.0.0",
  DEFAULT_PORT: Number.parseInt(process.env.PORT || "3000", 10),
  DEFAULT_TRANSPORT: (process.env.MCP_TRANSPORT || "stdio") as "stdio" | "sse",
};
