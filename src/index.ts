// Strictly protect stdout for JSON-RPC messages before any other modules load
console.log = (...args: any[]) => {
  console.error(...args);
};
console.info = (...args: any[]) => {
  console.error(...args);
};

import { Command } from "commander";
import { createMcpServer } from "./mcp/server.js";
import { startStdioTransport } from "./mcp/transports/stdio.js";
import { startHttpTransport } from "./mcp/transports/http.js";
import { baileysClient } from "./core/baileys.js";
import { CONFIG } from "./config/env.js";
import { logger } from "./utils/logger.js";

const program = new Command();

program
  .name(CONFIG.SERVER_NAME)
  .version(CONFIG.SERVER_VERSION)
  .description("WhatsApp Model Context Protocol (MCP) server integrated with Baileys")
  .option(
    "-t, --transport <type>",
    "MCP transport protocol: stdio, sse, or http",
    CONFIG.DEFAULT_TRANSPORT
  )
  .option("-p, --port <number>", "Port for HTTP transport (Streamable HTTP /mcp & SSE /sse)", String(CONFIG.DEFAULT_PORT))
  .action(async (options) => {
    try {
      const transportType = (options.transport || "stdio").toLowerCase();
      const port = Number.parseInt(options.port, 10) || CONFIG.DEFAULT_PORT;

      logger.info({ transportType, port }, "Starting WhatsApp MCP server");

      // Initialize WhatsApp client in background
      baileysClient.start().catch((err) => {
        logger.error({ err }, "Initial WhatsApp socket start failed (will retry or wait for auth)");
      });

      let httpServerHandle: { close: () => Promise<void> } | undefined;

      if (transportType === "sse" || transportType === "http") {
        httpServerHandle = await startHttpTransport(port);
      } else {
        const server = createMcpServer();
        await startStdioTransport(server);

        // Also expose Streamable HTTP (/mcp) and SSE (/sse) on port 3000
        // so remote devices (e.g. Galaxy A55 via Tailscale) can connect concurrently
        try {
          httpServerHandle = await startHttpTransport(port);
          logger.info({ port }, "Exposed concurrent HTTP transport for remote access");
        } catch (httpErr: any) {
          logger.warn(
            { err: httpErr },
            "Could not bind HTTP port for remote access (already in use), continuing on Stdio"
          );
        }
      }

      const shutdown = async () => {
        logger.info("Gracefully shutting down WhatsApp MCP server");
        if (httpServerHandle) {
          await httpServerHandle.close();
        }
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
