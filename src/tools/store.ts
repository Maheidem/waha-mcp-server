import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import { CHARACTER_LIMIT, DEFAULT_LIMIT, MAX_LIMIT } from "../constants.js";
import { parseApiError, mcpError } from "../utils/errors.js";

/** Max length for free-text search inputs */
const MAX_SEARCH_LENGTH = 500;

/** Regex for valid WhatsApp JID formats */
const JID_PATTERN = /^.+@(c\.us|g\.us|lid)$/;

/** Zod refinement for JID validation */
const jidSchema = z.string().min(1).max(200)
  .refine((v) => JID_PATTERN.test(v), {
    message: "Must be a valid JID (ending in @c.us, @g.us, or @lid)",
  });

/**
 * Register Message Store tools (search, graph, summary, stats).
 * Always registered — the Message Store API is the single backend.
 */
export function registerStoreTools(server: McpServer, api: ApiClient): void {

  // ── whatsapp_search_messages ──────────────────────────────────

  server.registerTool(
    "whatsapp_search_messages",
    {
      title: "Search WhatsApp Messages",
      description: `Search across all WhatsApp message history. Supports full-text search,
date ranges, sender filtering, and message type filtering.

Args:
  - search: Text to search for (case insensitive, supports Portuguese/unicode)
  - chatId: Scope search to a specific chat JID (optional)
  - sender: Filter by sender name or JID (optional)
  - since: ISO date string — messages after this date (optional)
  - until: ISO date string — messages before this date (optional)
  - type: Message type filter: chat, image, album, e2e_notification (optional)
  - fromMe: Filter sent (true) or received (false) messages (optional)
  - limit: Results per page (1-100, default 20)
  - offset: Pagination offset (default 0)

Returns:
  - messages: Array with id, chatJid, senderName, body, timestamp, messageType, fromMe
  - total: Total matching messages
  - has_more: Whether more results exist

Note: sender_name may be null for some messages.`,
      inputSchema: {
        search: z.string().min(1).max(MAX_SEARCH_LENGTH)
          .describe("Text to search for (case insensitive)"),
        chatId: jidSchema.optional()
          .describe("Scope search to a specific chat JID (optional)"),
        sender: z.string().max(MAX_SEARCH_LENGTH).optional()
          .describe("Filter by sender name or JID (optional)"),
        since: z.string().max(30).optional()
          .describe("ISO date string — only messages after this date (optional)"),
        until: z.string().max(30).optional()
          .describe("ISO date string — only messages before this date (optional)"),
        type: z.string().max(50).optional()
          .describe("Message type filter: chat, image, album, e2e_notification (optional)"),
        fromMe: z.coerce.boolean().optional()
          .describe("Filter: true = sent, false = received (optional)"),
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
          .describe("Results per page (1-100, default 20)"),
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
    async ({ search, chatId, sender, since, until, type, fromMe, limit, offset }) => {
      try {
        const result = await api.searchMessages({
          search,
          chat_jid: chatId,
          sender,
          since,
          until,
          type,
          from_me: fromMe,
          limit,
          offset,
        });

        const response = {
          messages: result.messages.map((m) => ({
            id: m.id,
            chatJid: m.chat_jid,
            senderName: m.sender_name,
            senderJid: m.sender_jid,
            body: m.body,
            timestamp: m.timestamp,
            messageType: m.message_type,
            fromMe: m.from_me,
            hasMedia: m.has_media,
          })),
          total: result.total,
          hasMore: result.has_more,
          count: result.messages.length,
          offset,
        };

        let text = JSON.stringify(response, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...response,
            messages: response.messages.slice(0, Math.ceil(response.messages.length / 2)),
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

  // ── whatsapp_contact_graph ────────────────────────────────────

  server.registerTool(
    "whatsapp_contact_graph",
    {
      title: "Contact Social Graph",
      description: `Get social graph for a WhatsApp contact — shared groups, mutual connections,
and interaction statistics.

Args:
  - contactId: Numeric contact ID from the Message Store (use whatsapp_search_messages
    or whatsapp_list_contacts to find contact IDs)

Returns:
  - contact: Name, JID, first/last seen
  - chats: Groups this contact is in, with message counts
  - connections: Other contacts who share groups with this person`,
      inputSchema: {
        contactId: z.coerce.number().int().min(1)
          .describe("Numeric contact ID from the Message Store"),
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
        const graph = await api.getContactGraph(contactId);

        const response = {
          contact: {
            id: graph.contact.id,
            name: graph.contact.push_name,
            jid: graph.contact.jid,
            phone: graph.contact.phone,
            firstSeen: graph.contact.first_seen_at,
            lastSeen: graph.contact.last_seen_at,
          },
          sharedGroups: graph.chats.map((c) => ({
            jid: c.jid,
            name: c.name,
            type: c.chat_type,
            messageCount: c.message_count,
          })),
          connections: graph.connections.map((c) => ({
            id: c.id,
            name: c.push_name,
            jid: c.jid,
            sharedGroups: c.shared_groups,
          })),
        };

        let text = JSON.stringify(response, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...response,
            connections: response.connections.slice(0, 20),
            truncated: true,
            truncationNote: "Connections list truncated to top 20.",
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

  // ── whatsapp_chat_summary ─────────────────────────────────────

  server.registerTool(
    "whatsapp_chat_summary",
    {
      title: "Chat Summary",
      description: `Get a readable summary of recent messages in a WhatsApp chat,
including sender names and timestamps.

This is optimized for readability — use whatsapp_read_messages for structured data
with filtering, or whatsapp_search_messages for full-text search.

Args:
  - chatId: Chat JID (e.g., "5511999999999@c.us" or "id@g.us")
  - limit: Number of recent messages to include (1-200, default 50)

Returns:
  - chat: Name, type, message count, date range
  - messages: Recent messages with sender name, body, timestamp, type`,
      inputSchema: {
        chatId: jidSchema.describe("Chat JID (e.g., '5511999999999@c.us' or 'id@g.us')"),
        limit: z.coerce.number().int().min(1).max(200).default(50)
          .describe("Number of recent messages to include (1-200, default 50)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ chatId, limit }) => {
      try {
        const summary = await api.getChatSummary(chatId, limit);

        const response = {
          chat: {
            jid: summary.chat.jid,
            name: summary.chat.name,
            type: summary.chat.chat_type,
            messageCount: summary.chat.message_count,
            firstMessage: summary.chat.first_message_at,
            lastMessage: summary.chat.last_message_at,
          },
          messages: summary.messages.map((m) => ({
            sender: m.sender_name || (m.from_me ? "You" : "Unknown"),
            body: m.body,
            timestamp: m.timestamp,
            type: m.message_type,
            hasMedia: m.has_media,
            ...(m.is_revoked ? { revoked: true } : {}),
            ...(m.is_edited ? { edited: true } : {}),
          })),
          count: summary.messages.length,
        };

        let text = JSON.stringify(response, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...response,
            messages: response.messages.slice(0, Math.ceil(response.messages.length / 2)),
            truncated: true,
            truncationNote: "Response truncated. Use a smaller 'limit'.",
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

  // ── whatsapp_stats ────────────────────────────────────────────

  server.registerTool(
    "whatsapp_stats",
    {
      title: "WhatsApp Stats",
      description: `Overview dashboard of WhatsApp activity — message totals, top chats,
top contacts, and group/DM breakdown.

No arguments needed. Returns:
  - Totals: messages, contacts, chats, groups, DMs
  - Activity: messages today, this week
  - Top 5 chats by message count (name may be null for groups — use whatsapp_get_group_info to look up)
  - Top 5 contacts by message count`,
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
        const stats = await api.getStats();

        const response = {
          totals: {
            messages: stats.total_messages,
            contacts: stats.total_contacts,
            chats: stats.total_chats,
            groups: stats.groups,
            dms: stats.dms,
          },
          activity: {
            messagesToday: stats.messages_today,
            messagesThisWeek: stats.messages_week,
          },
          topChats: stats.top_chats.map((c) => ({
            jid: c.jid,
            name: c.name,
            type: c.chat_type,
            messageCount: c.message_count,
            lastMessage: c.last_message_at,
          })),
          topContacts: stats.top_contacts.map((c) => ({
            name: c.push_name,
            jid: c.jid,
            messageCount: c.message_count,
          })),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );
}
