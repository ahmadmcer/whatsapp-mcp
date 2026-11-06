import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { baileysClient } from "../../core/baileys.js";

export function registerGroupTools(server: McpServer): void {
  server.tool(
    "list_groups",
    "Lists all joined WhatsApp groups with participant counts and metadata.",
    {},
    async () => {
      const groups = baileysClient.groupsRepo.listGroups();
      return {
        content: [{ type: "text", text: JSON.stringify({ count: groups.length, groups }, null, 2) }],
      };
    }
  );

  server.tool(
    "get_group_metadata",
    "Retrieves full group metadata, including description, owner, creation date, and participant member list with admin privileges.",
    {
      groupJid: z.string().describe("Group JID (e.g. '120363025441234567@g.us')"),
    },
    async ({ groupJid }) => {
      try {
        const metadata = await baileysClient.getGroupMetadata(groupJid);
        return {
          content: [{ type: "text", text: JSON.stringify(metadata, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch group metadata: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "create_group",
    "Creates a new WhatsApp group with specified title and initial member phone numbers or JIDs.",
    {
      subject: z.string().describe("Group subject/name (up to 100 characters)"),
      participants: z
        .array(z.string())
        .describe("Array of participant phone numbers with country codes or JIDs to add to the new group"),
    },
    async ({ subject, participants }) => {
      try {
        const result = await baileysClient.createGroup(subject, participants);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to create group: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "manage_group_participants",
    "Adds, removes, promotes to admin, or demotes from admin participants in a WhatsApp group.",
    {
      groupJid: z.string().describe("Target group JID"),
      action: z
        .enum(["add", "remove", "promote", "demote"])
        .describe("Action to perform on the specified participants"),
      participants: z
        .array(z.string())
        .describe("Array of participant phone numbers or JIDs"),
    },
    async ({ groupJid, action, participants }) => {
      try {
        const result = await baileysClient.manageGroupParticipants(groupJid, action, participants);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to ${action} participants: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "get_group_invite_link",
    "Gets or regenerates an invite link URL (https://chat.whatsapp.com/...) for a group.",
    {
      groupJid: z.string().describe("Target group JID"),
      revoke: z
        .boolean()
        .optional()
        .describe("If true, revokes the current invite link and generates a new one"),
    },
    async ({ groupJid, revoke }) => {
      try {
        const inviteLink = await baileysClient.getGroupInviteCode(groupJid, revoke);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ groupJid, inviteLink }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get group invite link: ${err.message}` }],
        };
      }
    }
  );
}
