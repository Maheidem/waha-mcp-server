import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import { parseApiError, mcpError } from "../utils/errors.js";

interface AutoReplyState {
  phone: string;
  found?: boolean;
  enabled: boolean;
  status?: string;
}

interface AutoReplyList {
  contacts: Array<{
    phone: string;
    display_name: string;
    person_name: string | null;
    push_name: string | null;
  }>;
}

export function registerAutoReplyTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whatsapp_auto_reply_enable",
    {
      title: "Enable Auto-Reply Transcription",
      description: `Enable auto-reply with audio transcription for a contact.

When the contact sends a voice note, the transcription is sent back as a quoted reply automatically. DM only — voice notes in groups are never auto-replied even if a member is flagged.

The flag is contact/phone-scoped, so it follows the contact across WhatsApp's @c.us → @lid JID transitions automatically — no need to re-flag when WhatsApp migrates the JID.

Args:
  - phone: Phone number digits only, no @, no spaces (e.g., "5521986910666"). Look up via whatsapp_list_contacts first if you only know the name.

Returns:
  - status: "ok" on success
  - phone: the canonical phone
  - enabled: true`,
      inputSchema: {
        phone: z.string().regex(/^\d+$/, "phone must be digits only")
          .describe('Phone digits only with country code (e.g., "5521986910666")'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ phone }) => {
      try {
        const result = await api.put<AutoReplyState>(`/contacts/${phone}/auto-reply`);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_auto_reply_disable",
    {
      title: "Disable Auto-Reply Transcription",
      description: `Disable auto-reply with audio transcription for a contact.

Args:
  - phone: Phone number digits only, no @, no spaces (e.g., "5521986910666").

Returns:
  - status: "ok"
  - phone: the canonical phone
  - enabled: false`,
      inputSchema: {
        phone: z.string().regex(/^\d+$/, "phone must be digits only")
          .describe('Phone digits only with country code (e.g., "5521986910666")'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ phone }) => {
      try {
        const result = await api.delete<AutoReplyState>(`/contacts/${phone}/auto-reply`);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_auto_reply_list",
    {
      title: "List Contacts with Auto-Reply Enabled",
      description: `List every contact that currently has auto-reply transcription enabled, with display names from Google Contacts (when matched) or WhatsApp push name fallback.

Returns:
  - contacts: array of { phone, display_name, person_name, push_name }`,
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
        const result = await api.get<AutoReplyList>("/auto-replies");
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );
}
