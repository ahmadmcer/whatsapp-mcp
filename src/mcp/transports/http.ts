import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "../server.js";
import { baileysClient } from "../../core/baileys.js";
import { logger } from "../../utils/logger.js";

export interface StartedHttpServer {
  server: HttpServer;
  close: () => Promise<void>;
}

export function startHttpTransport(
  port: number,
  host = "0.0.0.0",
  apiKey?: string
): Promise<StartedHttpServer> {
  return new Promise((resolve) => {
    const app = express();

    // Enable CORS with exposed session headers for remote MCP clients
    app.use(
      cors({
        origin: "*",
        exposedHeaders: ["Mcp-Session-Id"],
        allowedHeaders: [
          "Content-Type",
          "mcp-session-id",
          "mcp-protocol-version",
          "last-event-id",
          "authorization",
          "x-api-key",
        ],
      })
    );

    app.use(express.json());

    // Optional API key authorization middleware
    if (apiKey && apiKey.trim().length > 0) {
      const expectedToken = apiKey.trim();
      app.use((req: Request, res: Response, next) => {
        // Expose health status without requiring auth token
        if (req.path === "/health") {
          return next();
        }

        const authHeader = req.headers.authorization;
        const customHeader = req.headers["x-api-key"] as string | undefined;
        const token = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : customHeader || authHeader?.trim();

        if (!token || token !== expectedToken) {
          res.status(401).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Unauthorized: Invalid or missing API key token",
            },
            id: null,
          });
          return;
        }

        next();
      });
    }

    // Storage for active transport sessions
    const streamableTransports = new Map<string, StreamableHTTPServerTransport>();
    const sseTransports = new Map<string, SSEServerTransport>();

    // -------------------------------------------------------------
    // Streamable HTTP transport endpoints (/mcp) - Spec 2025-03-26
    // -------------------------------------------------------------

    // POST /mcp: Handle JSON-RPC messages and session handshakes
    app.post("/mcp", async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId) {
          const transport = streamableTransports.get(sessionId);
          if (!transport) {
            res.status(404).json({
              jsonrpc: "2.0",
              error: { code: -32001, message: "Session not found" },
              id: null,
            });
            return;
          }

          await transport.handleRequest(req, res, req.body);
          return;
        }

        // Check if request is an initialization handshake
        const isInit = Array.isArray(req.body)
          ? req.body.some((m) => m?.method === "initialize")
          : req.body?.method === "initialize";

        if (!isInit) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: Mcp-Session-Id header is required for non-initialization requests",
            },
            id: null,
          });
          return;
        }

        // Create new stateful Streamable HTTP transport with unique session ID
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        transport.onclose = () => {
          const id = transport.sessionId;
          if (id) {
            logger.info({ sessionId: id }, "Streamable HTTP session closed");
            streamableTransports.delete(id);
          }
        };

        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);

        // Process initialize request
        await transport.handleRequest(req, res, req.body);

        if (transport.sessionId) {
          streamableTransports.set(transport.sessionId, transport);
          logger.info({ sessionId: transport.sessionId }, "Streamable HTTP session initialized");
        }
      } catch (err: any) {
        logger.error({ err }, "Error handling MCP POST /mcp request");
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    });

    // GET /mcp: Handle persistent SSE stream for server-to-client notifications
    app.get("/mcp", async (req: Request, res: Response) => {
      const headerSessionId = req.headers["mcp-session-id"] as string | undefined;
      const querySessionId = req.query.sessionId as string | undefined;
      const sessionId = headerSessionId || querySessionId;

      if (!sessionId) {
        res.status(400).send("Bad Request: Mcp-Session-Id header is required for SSE stream.");
        return;
      }

      const transport = streamableTransports.get(sessionId);
      if (!transport) {
        logger.warn({ sessionId }, "GET /mcp requested for unknown or expired session, returning 404");
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found" },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res);
    });

    // DELETE /mcp: Terminate session
    app.delete("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && streamableTransports.has(sessionId)) {
        const transport = streamableTransports.get(sessionId)!;
        await transport.close();
        streamableTransports.delete(sessionId);
        res.status(200).send("Session terminated.");
      } else {
        res.status(404).send("Session not found.");
      }
    });

    // -------------------------------------------------------------
    // Legacy HTTP+SSE transport endpoints (/sse, /messages) - Spec 2024-11-05
    // -------------------------------------------------------------

    app.get("/sse", async (req: Request, res: Response) => {
      logger.info("New legacy SSE client connection received");
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      sseTransports.set(sessionId, transport);

      transport.onclose = () => {
        logger.info({ sessionId }, "SSE client connection closed");
        sseTransports.delete(sessionId);
      };

      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      const transport = sseTransports.get(sessionId);

      if (!transport) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      await transport.handlePostMessage(req, res, req.body);
    });

    // -------------------------------------------------------------
    // Health & diagnostic endpoint (/health)
    // -------------------------------------------------------------

    app.get("/health", (_req: Request, res: Response) => {
      const waStatus = baileysClient.getStatus();
      res.json({
        status: "healthy",
        timestamp: Date.now(),
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        transport: "http",
        whatsapp: {
          status: waStatus.status,
          user: waStatus.user,
          hasPairingCode: Boolean(waStatus.pairingCode),
          hasQr: Boolean(waStatus.qr),
        },
      });
    });

    // Start server
    const httpServer = app.listen(port, host, () => {
      logger.info(
        { port, host },
        `WhatsApp MCP server running on HTTP (Streamable HTTP: http://${host}:${port}/mcp, SSE: http://${host}:${port}/sse)`
      );
      resolve({
        server: httpServer,
        close: () =>
          new Promise((closeResolve) => {
            httpServer.close(() => closeResolve());
          }),
      });
    });
  });
}

// Re-export alias for backward compatibility
export const startSseTransport = (serverOrPort: any, port?: number) => {
  const actualPort = typeof serverOrPort === "number" ? serverOrPort : port || 3000;
  return startHttpTransport(actualPort);
};
