import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WahaClient } from "../services/waha-client.js";
import { DEFAULT_LIMIT, MAX_LIMIT, CHARACTER_LIMIT } from "../constants.js";
import { parseWahaError, mcpError } from "../utils/errors.js";

interface WahaGroupInfo {
  JID: string;
  Name: string;
  Topic: string;
  OwnerPN: string;
  GroupCreated: string;
  IsAnnounce: boolean;
  IsEphemeral: boolean;
  IsLocked: boolean;
  participants?: WahaGroupParticipant[];
}

interface WahaGroupParticipant {
  JID: string;
  PhoneNumber: string;
  LID: string;
  IsAdmin: boolean;
  IsSuperAdmin: boolean;
  DisplayName: string;
}

function formatPhone(pn: string): string {
  return pn.replace("@s.whatsapp.net", "");
}

export function registerGroupTools(server: McpServer, client: WahaClient): void {
  server.registerTool(
    "whatsapp_list_groups",
    {
      title: "List WhatsApp Groups",
      description: `List all WhatsApp groups you are a member of.

Returns group IDs, names, owners, and creation dates. Use the group ID from results
with whatsapp_get_group_info for detailed info including participants.

Args:
  - limit: Number of groups to return (1-100, default 20)
  - offset: Pagination offset (default 0)

Returns array of groups with:
  - id: Group ID (ending in @g.us, use in whatsapp_get_group_info or whatsapp_read_messages)
  - name: Group name
  - owner: Group owner's phone number
  - createdAt: When the group was created`,
      inputSchema: {
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
          .describe("Number of groups to return (1-100, default 20)"),
        offset: z.coerce.number().int().min(0).default(0)
          .describe("Pagination offset (default 0)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ limit, offset }) => {
      try {
        const groups = await client.get<WahaGroupInfo[]>(
          `/${client.session}/groups`
        );

        // Client-side pagination (API returns all groups at once)
        const paginated = groups.slice(offset, offset + limit);

        const result = {
          groups: paginated.map((g) => ({
            id: g.JID,
            name: g.Name,
            owner: formatPhone(g.OwnerPN),
            createdAt: g.GroupCreated,
          })),
          count: paginated.length,
          total: groups.length,
          offset,
          hasMore: offset + limit < groups.length,
        };

        let text = JSON.stringify(result, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...result,
            groups: result.groups.slice(0, Math.ceil(result.groups.length / 2)),
            truncated: true,
            truncationNote: "Response truncated. Use a smaller 'limit' or increase 'offset'.",
          };
          text = JSON.stringify(truncated, null, 2);
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return mcpError(parseWahaError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_get_group_info",
    {
      title: "Get WhatsApp Group Info",
      description: `Get information about a WhatsApp group including its participants.

Returns the group name, description, creation date, owner, settings,
and a list of all participants with their phone numbers and admin status.

Use this to see who is in a group, who the admins are, and group settings.

Args:
  - groupId: Group chat ID (ending in @g.us, get from whatsapp_list_groups or whatsapp_list_chats)

Returns:
  - name: Group name
  - topic: Group description
  - owner: Group owner's phone number
  - createdAt: When the group was created
  - participantCount: Number of members
  - participants: Array with phone, isAdmin, isSuperAdmin for each member`,
      inputSchema: {
        groupId: z.string().min(1)
          .describe("Group chat ID (ending in @g.us)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ groupId }) => {
      try {
        const [groupInfo, participants] = await Promise.all([
          client.get<WahaGroupInfo>(`/${client.session}/groups/${groupId}`),
          client.get<WahaGroupParticipant[]>(`/${client.session}/groups/${groupId}/participants`),
        ]);

        const result = {
          groupId,
          name: groupInfo.Name,
          topic: groupInfo.Topic || null,
          owner: formatPhone(groupInfo.OwnerPN),
          createdAt: groupInfo.GroupCreated,
          settings: {
            isAnnounce: groupInfo.IsAnnounce,
            isLocked: groupInfo.IsLocked,
            isEphemeral: groupInfo.IsEphemeral,
          },
          participantCount: participants.length,
          participants: participants.map((p) => ({
            phone: formatPhone(p.PhoneNumber),
            displayName: p.DisplayName || null,
            isAdmin: p.IsAdmin,
            isSuperAdmin: p.IsSuperAdmin,
          })),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseWahaError(error));
      }
    }
  );
}
