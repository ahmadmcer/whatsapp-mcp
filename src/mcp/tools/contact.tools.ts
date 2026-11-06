import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { baileysClient } from "../../core/baileys.js";
import { toJid } from "../../utils/jid.js";

export function registerContactTools(server: McpServer): void {
  server.tool(
    "list_contacts",
    "Lists synchronized WhatsApp contacts with names, JIDs, and status text.",
    {
      limit: z.number().optional().describe("Maximum contacts to return (default 50)"),
      query: z.string().optional().describe("Filter by contact name or phone number"),
    },
    async ({ limit, query }) => {
      const contacts = baileysClient.contactsRepo.listContacts({ limit, query });
      return {
        content: [{ type: "text", text: JSON.stringify({ count: contacts.length, contacts }, null, 2) }],
      };
    }
  );

  server.tool(
    "get_contact_profile",
    "Fetches comprehensive contact details, 'About' status text, and profile picture URL.",
    {
      contactJid: z.string().describe("Contact phone number or JID"),
    },
    async ({ contactJid }) => {
      const targetJid = toJid(contactJid);
      const contact = baileysClient.contactsRepo.getContact(targetJid);
      const sock = baileysClient.getSocket();

      let statusText: string | undefined = contact?.statusText || undefined;
      let profilePictureUrl: string | undefined;

      if (sock) {
        try {
          const statusResult = await sock.fetchStatus(targetJid);
          if (statusResult?.status) statusText = statusResult.status;
        } catch {
          // Status privacy settings may restrict retrieval
        }

        try {
          profilePictureUrl = await sock.profilePictureUrl(targetJid, "image");
        } catch {
          // Profile picture privacy may restrict retrieval
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                jid: targetJid,
                name: contact?.name || null,
                notifyName: contact?.notifyName || null,
                statusText: statusText || null,
                profilePictureUrl: profilePictureUrl || null,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
