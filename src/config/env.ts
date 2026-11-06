import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the root directory of the whatsapp-mcp package reliably regardless of process.cwd()
export const PACKAGE_ROOT = path.resolve(
  __dirname,
  path.basename(__dirname) === "dist" ? ".." : "../.."
);

export const WORKSPACE_ROOT = process.env.WHATSAPP_ROOT_DIR || PACKAGE_ROOT;

dotenv.config({ path: path.join(WORKSPACE_ROOT, ".env") });

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
