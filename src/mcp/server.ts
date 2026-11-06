import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CONFIG } from "../config/env.js";
import { registerAuthTools } from "./tools/auth.tools.js";
import { registerChatTools } from "./tools/chat.tools.js";
import { registerMessageTools } from "./tools/message.tools.js";
import { registerMediaTools } from "./tools/media.tools.js";
import { registerContactTools } from "./tools/contact.tools.js";
import { registerGroupTools } from "./tools/group.tools.js";
import { logger } from "../utils/logger.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: CONFIG.SERVER_NAME,
    version: CONFIG.SERVER_VERSION,
  });

  registerAuthTools(server);
  registerChatTools(server);
  registerMessageTools(server);
  registerMediaTools(server);
  registerContactTools(server);
  registerGroupTools(server);

  logger.info("Registered all 19 WhatsApp MCP tool primitives");
  return server;
}
