import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import { parseApiError, mcpError } from "../utils/errors.js";

const CONTACT_ID_PATTERN = /^(\d{6,20}|[^\s/]+@g\.us)$/;

type ContactArgs = {
  contactId?: string;
  phone?: string;
};

function resolveContactId({ contactId, phone }: ContactArgs): string {
  if (contactId && phone && contactId !== phone) {
    throw new Error("Provide either contactId or the deprecated phone alias, not conflicting values.");
  }
  const value = contactId ?? phone;
  if (!value) {
    throw new Error("contactId is required (the legacy phone field is also accepted).");
  }
  if (!CONTACT_ID_PATTERN.test(value)) {
    throw new Error("contactId must be phone digits or a group JID ending in @g.us.");
  }
  return value;
}

const contactInput = {
  contactId: z.string().min(1).max(200).optional()
    .describe('Phone digits for a person or "*@g.us" for a group'),
  phone: z.string().min(1).max(20).optional()
    .describe("Deprecated alias for a person's phone digits; prefer contactId"),
};

export function registerAutoReplyTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whatsapp_auto_reply_enable",
    {
      title: "Enable Automatic Voice-Note Replies",
      description: `Enable automatic transcription replies for a person or group.

When a voice note arrives, the backend transcribes it and sends a quoted reply.
The setting is phone-scoped for people (so it survives @c.us↔@lid changes) and
group-JID-scoped for groups. The optional contextual mode uses recent conversation
history to clean up the transcription and can add a short recap.

Args:
  - contactId: Phone digits for a person, or "*@g.us" for a group
  - contextual: Also enable contextual enhancement for this conversation (optional)
  - phone: Deprecated alias for contactId, retained for v2 compatibility`,
      inputSchema: {
        ...contactInput,
        contextual: z.boolean().optional()
          .describe("Enable contextual transcription cleanup/recap for this conversation"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ contactId, phone, contextual }) => {
      try {
        const id = resolveContactId({ contactId, phone });
        const result = await api.setAutoReply(id, contextual);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ contactId: id, ...result }, null, 2),
          }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    },
  );

  server.registerTool(
    "whatsapp_auto_reply_disable",
    {
      title: "Disable Automatic Voice-Note Replies",
      description: `Disable automatic transcription replies for a person or group.

Args:
  - contactId: Phone digits for a person, or "*@g.us" for a group
  - phone: Deprecated alias for contactId, retained for v2 compatibility

The operation is idempotent. Contextual mode remains stored by the backend but is
inactive while automatic replies are disabled.`,
      inputSchema: contactInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ contactId, phone }) => {
      try {
        const id = resolveContactId({ contactId, phone });
        const result = await api.disableAutoReply(id);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ contactId: id, ...result }, null, 2),
          }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    },
  );

  server.registerTool(
    "whatsapp_auto_reply_status",
    {
      title: "Automatic Voice-Note Reply Status",
      description: `Check whether automatic transcription replies are enabled for a person or group.

Args:
  - contactId: Phone digits for a person, or "*@g.us" for a group
  - phone: Deprecated alias for contactId`,
      inputSchema: contactInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ contactId, phone }) => {
      try {
        const id = resolveContactId({ contactId, phone });
        const result = await api.getAutoReply(id);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ contactId: id, ...result }, null, 2),
          }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    },
  );

  server.registerTool(
    "whatsapp_auto_reply_list",
    {
      title: "List Automatic Voice-Note Replies",
      description: `List all people and groups with automatic transcription replies enabled.

Returns a normalized autoReplies array plus the backend's contacts and groups arrays
for compatibility with existing clients.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const result = await api.listAutoReplies();
        const groups = result.groups ?? [];
        const autoReplies = [
          ...result.contacts.map((contact) => ({
            kind: "person" as const,
            contactId: contact.phone,
            displayName: contact.display_name,
          })),
          ...groups.map((group) => ({
            kind: "group" as const,
            contactId: group.jid,
            displayName: group.display_name,
          })),
        ];
        const output = { ...result, groups, autoReplies, count: autoReplies.length };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    },
  );
}
