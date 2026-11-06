import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { baileysClient } from "../../core/baileys.js";

export function registerMediaTools(server: McpServer): void {
  server.tool(
    "download_media",
    "Decrypts and downloads media (image, video, audio, document) from an inbound WhatsApp message to local storage, returning metadata, file path, and optional base64 for images under 1MB.",
    {
      chatJid: z.string().describe("Chat JID or sender phone number"),
      messageId: z.string().describe("The ID of the message containing media"),
      includeBase64: z
        .boolean()
        .optional()
        .describe("If true and media is an image < 1MB, includes base64 data URI directly in output for multimodal vision models"),
    },
    async ({ chatJid, messageId, includeBase64 }) => {
      try {
        const result = await baileysClient.downloadMedia(chatJid, messageId, includeBase64);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to download media: ${err.message}` }],
        };
      }
    }
  );
}
