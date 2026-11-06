import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { baileysClient } from "../../core/baileys.js";

export function registerAuthTools(server: McpServer): void {
  server.tool(
    "get_connection_status",
    "Returns current WhatsApp connection state ('connected', 'connecting', 'qr_ready', 'disconnected', 'logged_out'), active pairing code / QR availability, and connected user info.",
    {},
    async () => {
      const status = baileysClient.getStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "request_pairing_code",
    "Requests an 8-digit WhatsApp pairing code for linking a device via phone number instead of scanning a QR code.",
    {
      phoneNumber: z
        .string()
        .describe("Your WhatsApp phone number including country code with digits only (e.g. '15551234567' or '6281234567890')"),
    },
    async ({ phoneNumber }) => {
      try {
        const code = await baileysClient.requestPairingCode(phoneNumber);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  pairingCode: code,
                  message: `Enter code ${code} on your phone under WhatsApp -> Linked Devices -> Link with Phone Number.`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to request pairing code: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "logout",
    "Logs out the active WhatsApp session and clears local credential files.",
    {
      confirm: z.boolean().describe("Must be true to confirm logout and credential removal"),
    },
    async ({ confirm }) => {
      if (!confirm) {
        return {
          isError: true,
          content: [{ type: "text", text: "Logout cancelled: confirm must be set to true." }],
        };
      }

      await baileysClient.logout();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, message: "Logged out and credentials cleared." }, null, 2),
          },
        ],
      };
    }
  );
}
