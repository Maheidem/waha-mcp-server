import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import { DEFAULT_LIMIT, MAX_LIMIT, CHARACTER_LIMIT } from "../constants.js";
import { parseApiError, mcpError } from "../utils/errors.js";

const CONTACT_ID_PATTERN = /^(\d{6,20}|.+@(c\.us|g\.us|lid))$/;

export function registerContactTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whatsapp_check_number",
    {
      title: "Check WhatsApp Number",
      description: `Check if a phone number is registered on WhatsApp.

Use this before sending a message to a number not yet in your address book.

Args:
  - phone: Phone number with country code, no spaces or dashes (e.g., "5511999999999")

Returns:
  - numberExists: true if registered on WhatsApp
  - contactId: The id to use as contactId in other tools (the same phone digits)`,
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
        // Re-shape: contactId for the LLM (digits only), keep chatId for back-compat
        const contactId = (result.chatId || "").replace(/@(c\.us|lid)$/, "") || phone;
        const output = {
          numberExists: result.numberExists,
          contactId,
          chatId: result.chatId,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_list_contacts",
    {
      title: "List WhatsApp Contacts (people + groups)",
      description: `Unified address book — lists people you DM and groups you're in.

Use the returned 'id' as contactId in any chat-targeting tool (send_text, read_messages, etc.):
  - Person: id = phone digits (universal — survives @c.us↔@lid flips)
  - Group:  id = group JID (e.g. "120363...@g.us")

Args:
  - kind: "person" | "group" | "all" (default "all")
  - search: Filter by name or id (optional)
  - limit: Maximum rows to return (1-100, default 20)
  - offset: Pagination offset for the persons section (default 0)

Returns array of contacts with:
  - kind: "person" | "group"
  - id: phone digits or group JID — pass to other tools
  - name: display name (Google Contact name → push name → phone/jid fallback)
  - messageCount, lastMessageAt: activity stats
  - For persons: pushName, googleName, email, organization
  - For groups: memberCount`,
      inputSchema: {
        kind: z.enum(["person", "group", "all"]).default("all")
          .describe("Filter by contact type (default 'all')"),
        search: z.string().max(500).optional()
          .describe("Filter by name or id (optional)"),
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
          .describe("Maximum rows to return (1-100, default 20)"),
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
    async ({ kind, search, limit, offset }) => {
      try {
        const contacts = await api.listContacts({ kind, search, limit, offset });

        const result = {
          contacts: contacts.map((c) => ({
            kind: c.kind,
            id: c.id ?? c.phone, // fallback for any older response shape
            name: c.display_name ?? c.person_name ?? c.push_name ?? c.phone ?? c.id,
            ...(c.kind === "person" ? {
              phone: c.phone,
              pushName: c.push_name,
              googleName: c.person_name,
              email: c.email,
              organization: c.organization,
              chatsCount: c.chats_count,
            } : {
              memberCount: c.member_count,
            }),
            messageCount: c.message_count,
            lastMessageAt: c.last_message_at,
          })),
          count: contacts.length,
          kind,
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
            truncationNote: "Response truncated. Use a smaller 'limit', increase 'offset', or filter by 'kind'.",
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

  server.registerTool(
    "whatsapp_get_contact",
    {
      title: "Get Contact Detail (person or group)",
      description: `Detail for a single contact — person OR group, by stable id.

Returns shape depends on kind:
  - Person: contact (phone, names, email, org), all chats they appear in, all JID variants, message stats.
  - Group:  chat (group metadata), members with display names, member_count.

Args:
  - contactId: phone digits (person; "5521986910666"), or "*@g.us" (group). Look up via whatsapp_list_contacts.`,
      inputSchema: {
        contactId: z.string().regex(CONTACT_ID_PATTERN, "phone digits or *@g.us")
          .describe('Phone digits for a person, or "*@g.us" for a group'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ contactId }) => {
      try {
        const detail = await api.getContact(contactId);

        let text = JSON.stringify(detail, null, 2);
        if (text.length > CHARACTER_LIMIT && detail.kind === "group" && detail.members) {
          const truncated = {
            ...detail,
            members: detail.members.slice(0, Math.ceil(detail.members.length / 2)),
            truncated: true,
            truncationNote: "Member list truncated — fetch chat members separately if needed.",
          };
          text = JSON.stringify(truncated, null, 2);
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );
}
