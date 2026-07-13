import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import { CHARACTER_LIMIT, DEFAULT_LIMIT, MAX_LIMIT } from "../constants.js";
import { parseApiError, mcpError } from "../utils/errors.js";

/** Max length for free-text search inputs */
const MAX_SEARCH_LENGTH = 500;

/** Contact identifier: phone digits (person), '*@g.us' (group), or legacy JID. */
const CONTACT_ID_PATTERN = /^(\d{6,20}|[^\s/]+@(c\.us|g\.us|lid))$/;
const STORE_CHAT_ID_PATTERN = /^(\d{6,20}|[^\s/]+@(c\.us|g\.us|lid|import))$/;

/** Zod refinement for the unified contact identifier */
const contactIdSchema = z.string().min(1).max(200)
  .refine((v) => CONTACT_ID_PATTERN.test(v), {
    message: "Must be phone digits (person) or *@g.us (group)",
  });

const storeChatIdSchema = z.string().min(1).max(200)
  .refine((v) => STORE_CHAT_ID_PATTERN.test(v), {
    message: "Must be phone digits, a WhatsApp JID, or an imported *@import chat id",
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
      description: `Search across all WhatsApp message history. Supports case-insensitive
substring search, date ranges, sender filtering, and message type filtering.

Args:
  - search: Text to search for (case insensitive, supports Portuguese/unicode)
  - contactId: Scope to phone digits, a WhatsApp JID, or an imported "*@import" chat
  - sender: Filter by sender name or exact phone digits (optional)
  - since: ISO date string — messages after this date (optional)
  - until: ISO date string — messages before this date (optional)
  - type: Stored message type (some current GOWS media is still labeled "chat")
  - fromMe: Filter sent (true) or received (false) messages (optional)
  - limit: Results per page (1-100, default 20)
  - offset: Pagination offset (default 0)

Returns:
  - messages: Array with original body plus contextualBody/contextNote when enhanced
  - total: Total matching messages
  - hasMore: Whether more results exist

Search also covers indexed media captions, filenames, OCR, AI summaries, tags,
and extracted document text, so a matching media-only result can have body=null.`,
      inputSchema: {
        search: z.string().min(1).max(MAX_SEARCH_LENGTH)
          .describe("Text to search for (case insensitive)"),
        contactId: storeChatIdSchema.optional()
          .describe('Phone digits, a WhatsApp JID, or a returned "*@import" chat id (optional)'),
        sender: z.string().max(MAX_SEARCH_LENGTH).optional()
          .describe("Filter by sender name or exact phone digits (optional)"),
        since: z.string().max(30).optional()
          .describe("ISO date string — only messages after this date (optional)"),
        until: z.string().max(30).optional()
          .describe("ISO date string — only messages before this date (optional)"),
        type: z.string().max(50).optional()
          .describe('Stored message type; current GOWS media may still be labeled "chat"'),
        fromMe: z.boolean().optional()
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
    async ({ search, contactId, sender, since, until, type, fromMe, limit, offset }) => {
      try {
        const result = await api.searchMessages({
          search,
          chat_jid: contactId, // backend resolve_chat_jids accepts digits or JID
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
            contextualBody: m.body_contextual,
            contextNote: m.context_note,
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
      description: `Get social graph for a WhatsApp contact — shared groups, mutual connections.

Args:
  - phone: Phone number with country code (e.g., "5524999160115")

Returns:
  - groups: Groups this contact is in, with message counts
  - mutualContacts: Other contacts who share groups with this person`,
      inputSchema: {
        phone: z.string().min(8)
          .describe('Phone number with country code (e.g., "5524999160115")'),
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
        const graph = await api.getContactGraph(phone);

        const response = {
          phone: graph.contact.phone,
          name: graph.contact.person_name || graph.contact.push_name,
          sharedGroups: graph.chats.map((c) => ({
            jid: c.jid,
            name: c.name,
            type: c.chat_type,
            messageCount: c.message_count,
          })),
          mutualContacts: graph.connections.map((c) => ({
            phone: c.phone,
            name: c.name || c.push_name,
            sharedGroups: c.shared_groups,
          })),
        };

        let text = JSON.stringify(response, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...response,
            mutualContacts: response.mutualContacts.slice(0, 20),
            truncated: true,
            truncationNote: "Mutual contacts list truncated to top 20.",
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
with filtering, or whatsapp_search_messages for cross-chat substring search.

Args:
  - contactId: Phone digits for a person, or "*@g.us" for a group
  - limit: Number of recent messages to include (1-100, default 50)

Returns:
  - chat: Name, type, message count, date range
  - messages: Recent messages with sender name, body, timestamp, type`,
      inputSchema: {
        contactId: contactIdSchema.describe('Phone digits for a person, or "*@g.us" for a group'),
        limit: z.coerce.number().int().min(1).max(100).default(50)
          .describe("Number of recent messages to include (1-100, default 50)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ contactId, limit }) => {
      try {
        const summary = await api.getChatSummary(contactId, limit);

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
  - Top 5 chats by message count (name may be null for groups — use whatsapp_get_contact to look up)
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
            phone: c.phone,
            name: c.name,
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

  // ─── whatsapp_import_chat ───────────────────────────────────────
  server.registerTool(
    "whatsapp_import_chat",
    {
      title: "Import WhatsApp Chat Export",
      description: `Import a WhatsApp chat export file (ZIP or TXT) into the message store.

Use this to backfill historical messages from WhatsApp's "Export Chat" feature.
Only inserts new messages — won't overwrite or duplicate existing data.

The file should be a WhatsApp chat export:
  - ZIP file containing a .txt (standard WhatsApp export format)
  - Or a plain .txt file

The chat name is extracted from the filename (e.g., "Conversa do WhatsApp com NAME.zip").
You can override it with the chatName parameter.

Messages are matched to existing contacts by name. If a contact doesn't exist, it's created.
If the chat already exists in the store (by name), messages are added to it.

Args:
  - filePath: Absolute path to the ZIP or TXT file on the server
  - chatName: Optional override for the chat name (extracted from filename if omitted)

Returns:
  - chat_name: Resolved chat name
  - total_parsed: Number of messages found in file
  - inserted: New messages added
  - skipped_duplicates: Messages already in store
  - senders: List of sender names found

The returned *@import chat id can be used with whatsapp_read_messages and
whatsapp_search_messages. The backend does not currently support it in chat_summary.`,
      inputSchema: {
        filePath: z.string().min(1)
          .describe("Absolute path to the WhatsApp export ZIP or TXT file on the server"),
        chatName: z.string().optional()
          .describe("Override chat name (extracted from filename if omitted)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ filePath, chatName }) => {
      try {
        // Read the file from the server filesystem
        const fs = await import("fs/promises");
        const path = await import("path");

        const extension = path.extname(filePath).toLowerCase();
        if (!new Set([".zip", ".txt"]).has(extension)) {
          return mcpError("Chat import only accepts .zip or .txt files.");
        }
        const info = await fs.lstat(filePath);
        if (!info.isFile() || info.isSymbolicLink()) {
          return mcpError("Chat import path must be a regular file, not a directory or symlink.");
        }
        const maxBytes = 100 * 1024 * 1024;
        if (info.size > maxBytes) {
          return mcpError("Chat import file exceeds the 100 MiB safety limit.");
        }

        const realPath = await fs.realpath(filePath);
        const fileData = await fs.readFile(realPath);
        const filename = path.basename(realPath);

        const result = await api.importMessages(fileData, filename, chatName);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "imported",
              chatName: result.chat_name,
              chatJid: result.chat_jid,
              totalParsed: result.total_parsed,
              inserted: result.inserted,
              skippedDuplicates: result.skipped_duplicates,
              phonesCreated: result.phones_created ?? result.contacts_created ?? 0,
              contactsCreated: result.phones_created ?? result.contacts_created ?? 0,
              senders: result.senders,
            }, null, 2),
          }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );
}
