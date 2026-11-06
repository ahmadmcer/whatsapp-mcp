import { describe, it, expect, beforeEach } from "vitest";
import { createMcpServer } from "../../src/mcp/server.js";
import { baileysClient } from "../../src/core/baileys.js";

describe("MCP Server & Tool Registration", () => {
  let server: ReturnType<typeof createMcpServer>;

  beforeEach(() => {
    server = createMcpServer();
  });

  it("registers all 19 expected WhatsApp MCP tools", () => {
    // Access internal registered tools
    const tools = (server as any)._registeredTools;
    expect(tools).toBeDefined();

    const expectedTools = [
      "get_connection_status",
      "request_pairing_code",
      "logout",
      "list_chats",
      "get_chat_history",
      "get_message_context",
      "search_messages",
      "mark_chat_read",
      "send_message",
      "send_media",
      "react_to_message",
      "download_media",
      "list_contacts",
      "get_contact_profile",
      "list_groups",
      "get_group_metadata",
      "create_group",
      "manage_group_participants",
      "get_group_invite_link",
    ];

    for (const toolName of expectedTools) {
      expect(tools[toolName], `Tool ${toolName} must be registered`).toBeDefined();
    }
  });

  it("handles get_connection_status tool invocation", async () => {
    const tools = (server as any)._registeredTools;
    const statusHandler = tools["get_connection_status"].handler;

    const result = await statusHandler({});
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("status");
  });

  it("simulates message send via send_message with dryRun parameter", async () => {
    const tools = (server as any)._registeredTools;
    const sendHandler = tools["send_message"].handler;

    const result = await sendHandler({
      recipientJid: "15551234567@s.whatsapp.net",
      message: "Hello from test suite!",
      dryRun: true,
    });

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.simulated).toBe(true);
    expect(parsed.recipient).toBe("15551234567@s.whatsapp.net");
  });

  it("simulates media send via send_media with dryRun parameter", async () => {
    const tools = (server as any)._registeredTools;
    const mediaHandler = tools["send_media"].handler;

    const result = await mediaHandler({
      recipientJid: "15551234567",
      mediaPathOrUrl: "https://example.com/sample.jpg",
      mediaType: "image",
      caption: "Sample image",
      dryRun: true,
    });

    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.simulated).toBe(true);
  });
});
