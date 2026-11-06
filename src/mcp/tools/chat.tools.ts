import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { baileysClient } from "../../core/baileys.js";
import { toJid } from "../../utils/jid.js";

export function registerChatTools(server: McpServer): void {
  server.tool(
    "list_chats",
    "Lists recent WhatsApp conversations sorted by last activity with unread counts and group status.",
    {
      limit: z.number().optional().describe("Maximum number of chats to return (default 25, max 100)"),
      query: z.string().optional().describe("Search filter for chat name or JID"),
      unreadOnly: z.boolean().optional().describe("Filter only chats with unread messages"),
    },
    async ({ limit, query, unreadOnly }) => {
      const chats = baileysClient.chatsRepo.listChats({ limit, query, unreadOnly });
      return {
        content: [{ type: "text", text: JSON.stringify(chats, null, 2) }],
      };
    }
  );

  server.tool(
    "get_chat_history",
    "Fetches chronological messages from a specific WhatsApp chat conversation.",
    {
      chatJid: z.string().describe("Phone number, user JID (e.g. '15551234567@s.whatsapp.net') or group JID ('...-...@g.us')"),
      limit: z.number().optional().describe("Number of messages to retrieve (default 50, max 200)"),
      beforeTimestamp: z.number().optional().describe("Fetch messages strictly before this Unix epoch timestamp (ms) for pagination"),
    },
    async ({ chatJid, limit, beforeTimestamp }) => {
      const targetJid = toJid(chatJid);
      const messages = baileysClient.messagesRepo.listMessages(targetJid, { limit, beforeTimestamp });
      return {
        content: [{ type: "text", text: JSON.stringify({ chatJid: targetJid, count: messages.length, messages }, null, 2) }],
      };
    }
  );

  server.tool(
    "get_message_context",
    "Retrieves chronological context messages immediately preceding and following a target message.",
    {
      chatJid: z.string().describe("Chat JID or phone number"),
      messageId: z.string().describe("The specific message ID to inspect"),
      contextSize: z.number().optional().describe("Number of messages before and after to fetch (default 3, max 10)"),
    },
    async ({ chatJid, messageId, contextSize }) => {
      const targetJid = toJid(chatJid);
      const context = baileysClient.messagesRepo.getMessageContext(targetJid, messageId, contextSize);
      return {
        content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
      };
    }
  );

  server.tool(
    "search_messages",
    "Performs full-text search across WhatsApp message history with optional chat filtering.",
    {
      query: z.string().describe("Search terms or keywords"),
      chatJid: z.string().optional().describe("Optional chat JID to restrict search to a single conversation"),
      limit: z.number().optional().describe("Maximum search results (default 20, max 100)"),
    },
    async ({ query, chatJid, limit }) => {
      const targetJid = chatJid ? toJid(chatJid) : undefined;
      const results = baileysClient.messagesRepo.searchMessages(query, { chatJid: targetJid, limit });
      return {
        content: [{ type: "text", text: JSON.stringify({ query, count: results.length, results }, null, 2) }],
      };
    }
  );

  server.tool(
    "mark_chat_read",
    "Marks all unread messages in a chat conversation as read.",
    {
      chatJid: z.string().describe("Chat JID or phone number"),
    },
    async ({ chatJid }) => {
      const targetJid = toJid(chatJid);
      baileysClient.chatsRepo.markChatRead(targetJid);
      const sock = baileysClient.getSocket();
      if (sock) {
        try {
          await sock.readMessages([
            {
              remoteJid: targetJid,
              id: "latest",
              fromMe: false,
            },
          ]);
        } catch {
          // Non-fatal if socket read receipt fails
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, chatJid: targetJid }, null, 2) }],
      };
    }
  );
}
