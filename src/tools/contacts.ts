import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import { DEFAULT_LIMIT, MAX_LIMIT, CHARACTER_LIMIT } from "../constants.js";
import { parseApiError, mcpError } from "../utils/errors.js";

export function registerContactTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whatsapp_check_number",
    {
      title: "Check WhatsApp Number",
      description: `Check if a phone number is registered on WhatsApp.

Use this before sending a message to verify the number exists on WhatsApp.

Args:
  - phone: Phone number with country code, no spaces or dashes (e.g., "5511999999999")

Returns:
  - numberExists: true if registered on WhatsApp
  - chatId: The chat ID to use for messaging (e.g., "5511999999999@c.us")`,
      inputSchema: {
        phone: z.string().min(1)
          .describe('Phone number with country code, no spaces/dashes (e.g., "5511999999999")'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ phone }) => {
      try {
        const result = await api.checkNumber(phone);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_list_contacts",
    {
      title: "List WhatsApp Contacts",
      description: `List WhatsApp contacts with names and activity stats.

Powered by Message Store — supports name search and shows activity stats, enriched with Google Contacts.

Args:
  - search: Filter contacts by name (optional)
  - limit: Maximum contacts to return (1-100, default 20)
  - offset: Pagination offset (default 0)

Returns array of contacts with:
  - id: Contact JID (use as chatId in other tools)
  - name: Display name
  - messageCount: Total messages from this contact
  - chatsCount: Number of chats this contact is in
  - firstSeen/lastSeen: Activity timestamps`,
      inputSchema: {
        search: z.string().max(500).optional()
          .describe("Filter contacts by name (optional)"),
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
          .describe("Maximum contacts to return (1-100, default 20)"),
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
    async ({ search, limit, offset }) => {
      try {
        // Use store endpoint for enriched data
        const contacts = await api.listContacts({ search, limit, offset });

        const result = {
          contacts: contacts.map((c) => ({
            id: c.jid,
            storeId: c.id,
            name: c.google_name || c.push_name || c.jid,
            pushName: c.push_name,
            googleName: c.google_name,
            phone: c.phone,
            email: c.email,
            organization: c.organization,
            messageCount: c.message_count,
            chatsCount: c.chats_count,
            firstSeen: c.first_seen_at,
            lastSeen: c.last_seen_at,
          })),
          count: contacts.length,
          offset,
          hasMore: contacts.length === limit,
          source: "message-store" as const,
        };

        let text = JSON.stringify(result, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...result,
            contacts: result.contacts.slice(0, Math.ceil(result.contacts.length / 2)),
            truncated: true,
            truncationNote: "Response truncated. Use a smaller 'limit' or increase 'offset'.",
          };
          text = JSON.stringify(truncated, null, 2);
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );
}
