import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startHttpTransport, type StartedHttpServer } from "../../src/mcp/transports/http.js";

describe("HTTP & Streamable MCP Transport (/mcp, /sse, /health)", () => {
  let serverHandle: StartedHttpServer;
  const TEST_PORT = 3899;
  const BASE_URL = `http://localhost:${TEST_PORT}`;

  beforeAll(async () => {
    serverHandle = await startHttpTransport(TEST_PORT, "127.0.0.1");
  });

  afterAll(async () => {
    if (serverHandle) {
      await serverHandle.close();
    }
  });

  it("serves healthy status and diagnostic info on GET /health", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.timestamp).toBeDefined();
    expect(data.pid).toBeDefined();
    expect(data.uptime).toBeDefined();
    expect(data.whatsapp).toBeDefined();
    expect(data.whatsapp.status).toBeDefined();
  });

  it("handles Streamable HTTP handshake on POST /mcp and lists tools", async () => {
    // 1. Initialize request
    const initResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "init-1",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "streamable-test-client",
            version: "1.0.0",
          },
        },
      }),
    });

    expect(initResponse.status).toBe(200);

    const sessionId = initResponse.headers.get("mcp-session-id");
    expect(sessionId, "Server must return Mcp-Session-Id header").toBeTruthy();

    const initText = await initResponse.text();
    // In Streamable HTTP, response can be JSON or SSE event stream format
    expect(initText).toContain("whatsapp-mcp");

    // Send notifications/initialized
    await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": sessionId!,
        "mcp-protocol-version": "2024-11-05",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    // 2. Call tools/list using the acquired session ID
    const toolsResponse = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": sessionId!,
        "mcp-protocol-version": "2024-11-05",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "tools-1",
        method: "tools/list",
        params: {},
      }),
    });

    expect(toolsResponse.status).toBe(200);
    const toolsText = await toolsResponse.text();
    expect(toolsText).toContain("get_connection_status");
    expect(toolsText).toContain("send_message");
    expect(toolsText).toContain("send_media");
    expect(toolsText).toContain("create_group");
  });

  it("rejects non-initialization POST /mcp requests missing Mcp-Session-Id", async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "invalid-1",
        method: "tools/list",
        params: {},
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("Mcp-Session-Id");
  });

  it("enforces optional API key authentication when configured", async () => {
    const AUTH_PORT = 3898;
    const authServer = await startHttpTransport(AUTH_PORT, "127.0.0.1", "secret-test-token-123");

    try {
      // 1. GET /health should still be accessible without token
      const healthRes = await fetch(`http://localhost:${AUTH_PORT}/health`);
      expect(healthRes.status).toBe(200);

      // 2. POST /mcp without token should fail with 401
      const unauthRes = await fetch(`http://localhost:${AUTH_PORT}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      });
      expect(unauthRes.status).toBe(401);
      const unauthJson = await unauthRes.json();
      expect(unauthJson.error.message).toContain("Unauthorized");

      // 3. POST /mcp with Bearer token should succeed
      const authRes = await fetch(`http://localhost:${AUTH_PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer secret-test-token-123",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "auth-test", version: "1.0" },
          },
        }),
      });
      expect(authRes.status).toBe(200);
    } finally {
      await authServer.close();
    }
  });
});
