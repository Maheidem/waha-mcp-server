import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WahaClient } from "../services/waha-client.js";
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

export function registerGroupTools(server: McpServer, client: WahaClient): void {
  server.registerTool(
    "whatsapp_get_group_info",
    {
      title: "Get WhatsApp Group Info",
      description: `Get information about a WhatsApp group including its participants.

Returns the group name, description, creation date, owner, settings,
and a list of all participants with their phone numbers and admin status.

Use this to see who is in a group, who the admins are, and group settings.

Args:
  - groupId: Group chat ID (ending in @g.us, get from whatsapp_list_chats)

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
        // Fetch group info and participants in parallel
        const [groupInfo, participants] = await Promise.all([
          client.get<WahaGroupInfo>(`/${client.session}/groups/${groupId}`),
          client.get<WahaGroupParticipant[]>(`/${client.session}/groups/${groupId}/participants`),
        ]);

        const formatPhone = (pn: string) => pn.replace("@s.whatsapp.net", "");

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
