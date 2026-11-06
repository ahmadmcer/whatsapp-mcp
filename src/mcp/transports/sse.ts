import express from "express";
import cors from "cors";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../../utils/logger.js";

export function startSseTransport(server: McpServer, port: number): Promise<void> {
  return new Promise((resolve) => {
    const app = express();
    app.use(cors());

    const transports = new Map<string, SSEServerTransport>();

    app.get("/sse", async (req, res) => {
      logger.info("New SSE client connection received");
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);

      transport.onclose = () => {
        logger.info({ sessionId }, "SSE client connection closed");
        transports.delete(sessionId);
      };

      await server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const transport = transports.get(sessionId);

      if (!transport) {
        res.status(404).send({ error: "Session not found" });
        return;
      }

      await transport.handlePostMessage(req, res);
    });

    app.get("/health", (req, res) => {
      res.json({ status: "healthy", timestamp: Date.now() });
    });

    app.listen(port, () => {
      logger.info({ port }, `WhatsApp MCP server running on SSE transport (http://localhost:${port}/sse)`);
      resolve();
    });
  });
}
