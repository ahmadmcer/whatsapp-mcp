import { Command } from "commander";
import { createMcpServer } from "./mcp/server.js";
import { startStdioTransport } from "./mcp/transports/stdio.js";
import { startHttpTransport } from "./mcp/transports/http.js";
import { runInteractiveLogin } from "./cli/login.js";
import { startDaemon, stopDaemon, getDaemonStatus } from "./cli/daemon.js";
import { baileysClient } from "./core/baileys.js";
import { CONFIG } from "./config/env.js";
import { logger } from "./utils/logger.js";

const program = new Command();

program
  .name(CONFIG.SERVER_NAME)
  .version(CONFIG.SERVER_VERSION)
  .description("WhatsApp Model Context Protocol (MCP) server integrated with Baileys")
  .option(
    "-d, --daemon",
    "Run server as a detached background daemon process"
  )
  .option(
    "-t, --transport <type>",
    "MCP transport protocol: http (default), sse, or stdio (deprecated)",
    CONFIG.DEFAULT_TRANSPORT
  )
  .option(
    "-p, --port <number>",
    "Port for HTTP daemon (Streamable HTTP /mcp & SSE /sse)",
    String(CONFIG.DEFAULT_PORT)
  )
  .option(
    "-H, --host <address>",
    "Host address to bind HTTP daemon (e.g. 0.0.0.0 or 127.0.0.1)",
    CONFIG.DEFAULT_HOST
  )
  .option(
    "-k, --api-key <token>",
    "Optional API key token required in Authorization or x-api-key header",
    CONFIG.API_KEY
  )
  .action(async (options) => {
    try {
      const port = Number.parseInt(options.port, 10) || CONFIG.DEFAULT_PORT;
      const host = options.host || CONFIG.DEFAULT_HOST;
      const apiKey = options.apiKey || CONFIG.API_KEY;
      const transportType = (options.transport || CONFIG.DEFAULT_TRANSPORT).toLowerCase();

      // If user requested background daemon mode via -d / --daemon
      if (options.daemon) {
        await startDaemon({ port, host, apiKey });
        return;
      }

      logger.info({ transportType, host, port, apiKeySet: Boolean(apiKey) }, "Starting WhatsApp MCP server");

      // Initialize WhatsApp client in background
      baileysClient.start().catch((err) => {
        logger.error({ err }, "Initial WhatsApp socket start failed (will retry or wait for auth)");
      });

      let httpServerHandle: { close: () => Promise<void> } | undefined;

      if (transportType === "stdio") {
        // Protect stdout from any console.log statements when in stdio mode
        console.log = (...args: any[]) => {
          console.error(...args);
        };
        console.info = (...args: any[]) => {
          console.error(...args);
        };

        const server = createMcpServer();
        await startStdioTransport(server);

        // Also expose Streamable HTTP (/mcp) and SSE (/sse) on port for remote devices
        try {
          httpServerHandle = await startHttpTransport(port, host, apiKey);
          logger.info({ port, host }, "Exposed concurrent HTTP transport for remote access");
        } catch (httpErr: any) {
          logger.warn(
            { err: httpErr },
            "Could not bind HTTP port for remote access, continuing on Stdio"
          );
        }
      } else {
        // Default HTTP daemon mode (Streamable HTTP /mcp & SSE /sse)
        httpServerHandle = await startHttpTransport(port, host, apiKey);
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

program
  .command("status")
  .description("Check the running status of the WhatsApp MCP background daemon")
  .option("-p, --port <number>", "Port to probe (defaults to port saved in PID file)")
  .option("-H, --host <address>", "Host to probe (defaults to host saved in PID file)")
  .action(async (options) => {
    try {
      const port = options.port ? Number.parseInt(options.port, 10) : undefined;
      await getDaemonStatus(port, options.host);
    } catch (err: any) {
      console.error("Status check failed:", err.message);
      process.exit(1);
    }
  });

program
  .command("stop")
  .description("Stop the running WhatsApp MCP background daemon process")
  .action(async () => {
    try {
      await stopDaemon();
    } catch (err: any) {
      console.error("Failed to stop daemon:", err.message);
      process.exit(1);
    }
  });

program
  .command("login")
  .description("Interactive terminal login for WhatsApp Web (QR code or pairing code)")
  .action(async () => {
    try {
      await runInteractiveLogin();
    } catch (err: any) {
      console.error("Login failed:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);
