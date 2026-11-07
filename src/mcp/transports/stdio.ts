import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../../utils/logger.js";

export async function startStdioTransport(server: McpServer): Promise<void> {
  console.error(
    "\x1b[33m%s\x1b[0m",
    "[DEPRECATED] Running whatsapp-mcp over Stdio is deprecated. WhatsApp allows only 1 active socket; running multiple Stdio agents triggers reconnection loops (code 440). Please run as a daemon (HTTP server) and connect clients via serverUrl."
  );
  logger.warn(
    "Running over deprecated Stdio transport. For multi-agent support and anti-ban protection, run as an HTTP daemon instead."
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("WhatsApp MCP server connected via Stdio transport");
}
