import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { baileysClient } from "../../core/baileys.js";

export function registerMessageTools(server: McpServer): void {
  server.tool(
    "send_message",
    "Sends a text message to a WhatsApp user or group, with human-simulated typing presence, anti-ban jitter, optional quote/reply, and user mentions.",
    {
      recipientJid: z
        .string()
        .describe("Recipient phone number with country code, user JID (e.g. '15551234567@s.whatsapp.net'), or group JID"),
      message: z.string().describe("Message text content to send"),
      quotedMessageId: z.string().optional().describe("Message ID to reply/quote directly"),
      mentions: z.array(z.string()).optional().describe("Array of user phone numbers or JIDs to mention in the message"),
      dryRun: z.boolean().optional().describe("If true, simulates the send without actually dispatching over WhatsApp network"),
    },
    async ({ recipientJid, message, quotedMessageId, mentions, dryRun }) => {
      try {
        const result = await baileysClient.sendMessage(recipientJid, message, {
          quotedMessageId,
          mentions,
          dryRun,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to send message: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "send_media",
    "Sends rich media (image, video, audio/voice note, document, or sticker) from a local file path or web URL.",
    {
      recipientJid: z.string().describe("Recipient phone number or JID"),
      mediaPathOrUrl: z.string().describe("Local absolute/relative file path or HTTP/HTTPS URL"),
      mediaType: z
        .enum(["image", "video", "audio", "document", "sticker"])
        .describe("Type of media being sent"),
      caption: z.string().optional().describe("Optional text caption for images, videos, and documents"),
      quotedMessageId: z.string().optional().describe("Message ID to reply/quote"),
      dryRun: z.boolean().optional().describe("If true, simulates dispatch without network transmission"),
    },
    async ({ recipientJid, mediaPathOrUrl, mediaType, caption, quotedMessageId, dryRun }) => {
      try {
        const result = await baileysClient.sendMedia(recipientJid, mediaPathOrUrl, mediaType, {
          caption,
          quotedMessageId,
          dryRun,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to send media: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "react_to_message",
    "Adds or removes an emoji reaction on a specific message in a chat.",
    {
      chatJid: z.string().describe("Chat JID or phone number where the message resides"),
      messageId: z.string().describe("Message ID to react to"),
      emoji: z
        .string()
        .describe("Single emoji character (e.g. '👍', '❤️', '🔥', '😂') or empty string '' to remove an existing reaction"),
    },
    async ({ chatJid, messageId, emoji }) => {
      try {
        const result = await baileysClient.reactToMessage(chatJid, messageId, emoji);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to react to message: ${err.message}` }],
        };
      }
    }
  );
}
