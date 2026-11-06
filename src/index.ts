import { Command } from "commander";
import { createMcpServer } from "./mcp/server.js";
import { startStdioTransport } from "./mcp/transports/stdio.js";
import { startSseTransport } from "./mcp/transports/sse.js";
import { baileysClient } from "./core/baileys.js";
import { CONFIG } from "./config/env.js";
import { logger } from "./utils/logger.js";

const program = new Command();

program
  .name(CONFIG.SERVER_NAME)
  .version(CONFIG.SERVER_VERSION)
  .description("WhatsApp Model Context Protocol (MCP) server integrated with Baileys")
  .option("-t, --transport <type>", "MCP transport protocol: stdio or sse", CONFIG.DEFAULT_TRANSPORT)
  .option("-p, --port <number>", "Port for SSE HTTP transport", String(CONFIG.DEFAULT_PORT))
  .action(async (options) => {
    try {
      const transportType = (options.transport || "stdio").toLowerCase();
      const port = Number.parseInt(options.port, 10) || CONFIG.DEFAULT_PORT;

      logger.info({ transportType, port }, "Starting WhatsApp MCP server");

      // Initialize WhatsApp client in background
      baileysClient.start().catch((err) => {
        logger.error({ err }, "Initial WhatsApp socket start failed (will retry or wait for auth)");
      });

      const server = createMcpServer();

      if (transportType === "sse") {
        await startSseTransport(server, port);
      } else {
        await startStdioTransport(server);
      }

      const shutdown = async () => {
        logger.info("Gracefully shutting down WhatsApp MCP server");
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } catch (err: any) {
      logger.error({ err }, "Fatal error starting WhatsApp MCP server");
      process.exit(1);
    }
  });

program.parse(process.argv);
