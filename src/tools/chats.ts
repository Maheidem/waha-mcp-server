import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import { DEFAULT_LIMIT, MAX_LIMIT, CHARACTER_LIMIT } from "../constants.js";
import { parseApiError, mcpError } from "../utils/errors.js";

/** Shape returned by GET /chats/live */
interface LiveChat {
  id: string;
  name: string;
  conversationTimestamp: number;
  picture?: string | null;
  lastMessage?: {
    id: string;
    body?: string;
    timestamp: number;
    from: string;
    fromMe: boolean;
    hasMedia: boolean;
  } | null;
}

function formatTimestamp(ts: number): string {
  if (!ts || ts <= 0) return "unknown";
  return new Date(ts * 1000).toISOString();
}

export function registerChatTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whatsapp_list_chats",
    {
      title: "List WhatsApp Chats",
      description: `List recent WhatsApp chats with last message preview and profile pictures.

Returns chat IDs, names, profile picture URLs, and a preview of the last message.
Use the chat ID from results to read messages with whatsapp_read_messages.

Args:
  - limit: Number of chats to return (1-100, default 20)
  - offset: Pagination offset (default 0)

Returns array of chats with:
  - id: Chat ID (use this in other tools)
  - name: Contact or group name
  - picture: Profile picture URL (may expire)
  - lastMessage: Preview with body, from, fromMe, hasMedia, timestamp
  - lastMessageAt: ISO timestamp of last message`,
      inputSchema: {
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
          .describe("Number of chats to return (1-100, default 20)"),
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
        // Use live endpoint for preview/profile pic data
        const resp = await api.listChatsLive({ limit, offset }) as { chats: LiveChat[] };
        const chats = resp.chats || [];

        const result = {
          chats: chats.map((c) => ({
            id: c.id,
            name: c.name || c.id,
            picture: c.picture || null,
            lastMessageAt: formatTimestamp(c.conversationTimestamp),
            lastMessage: c.lastMessage ? {
              body: (c.lastMessage.body || "").slice(0, 200) || null,
              from: c.lastMessage.from,
              fromMe: c.lastMessage.fromMe,
              hasMedia: c.lastMessage.hasMedia,
              timestamp: formatTimestamp(c.lastMessage.timestamp),
            } : null,
          })),
          count: chats.length,
          offset,
          hasMore: chats.length === limit,
        };

        let text = JSON.stringify(result, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...result,
            chats: result.chats.slice(0, Math.ceil(result.chats.length / 2)),
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

  server.registerTool(
    "whatsapp_read_messages",
    {
      title: "Read WhatsApp Messages",
      description: `Read messages from a specific WhatsApp chat.

Returns messages with sender, text content, timestamp, and message ID.
Use the message ID from results for whatsapp_react, media download, or transcription.

Powered by Message Store — persistent history with case-insensitive substring search.
Search includes indexed captions, filenames, OCR, summaries, tags, and document text.

Args:
  - contactId: Phone digits for a person, group JID "*@g.us", or an imported "*@import" history id
  - limit: Number of messages to return (1-100, default 20)
  - offset: Skip N messages for pagination (default 0)
  - search: Case-insensitive substring search within this chat (optional)
  - sender: Filter by sender name or exact phone digits (optional)
  - type: Stored message type; current GOWS media may still be labeled "chat" (optional)
  - since: ISO date — messages after this date (optional)
  - until: ISO date — messages before this date (optional)
  - fromMe: Filter sent (true) or received (false) messages (optional)
  - downloadMedia: Include media download URLs when falling back to live (default false)
  - markAsRead: Mark live WhatsApp messages as read after fetching; imported history is skipped (default false)

Returns:
  - messages: Array with id, sender, body, timestamp, type, fromMe, hasMedia
  - total: Total matching messages
  - hasMore: Whether more results exist`,
      inputSchema: {
        contactId: z.string().min(1)
          .describe('Phone digits, a group "*@g.us", or an imported "*@import" history id'),
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
          .describe("Number of messages to return (1-100, default 20)"),
        offset: z.coerce.number().int().min(0).default(0)
          .describe("Skip N messages for pagination (default 0)"),
        search: z.string().max(500).optional()
          .describe("Case-insensitive substring search within this chat (optional)"),
        sender: z.string().max(500).optional()
          .describe("Filter by sender name or exact phone digits (optional)"),
        type: z.string().max(50).optional()
          .describe('Stored message type; current GOWS media may still be labeled "chat"'),
        since: z.string().max(30).optional()
          .describe("ISO date — only messages after this date (optional)"),
        until: z.string().max(30).optional()
          .describe("ISO date — only messages before this date (optional)"),
        fromMe: z.boolean().optional()
          .describe("Filter: true = sent, false = received (optional)"),
        downloadMedia: z.boolean().default(false)
          .describe("Include media download URLs when falling back to live (default false)"),
        markAsRead: z.boolean().default(false)
          .describe("Mark live WhatsApp messages as read; skipped for imported history"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ contactId, limit, offset, search, sender, type, since, until, fromMe, downloadMedia, markAsRead }) => {
      try {
        // Helper: query live WAHA messages (used as fallback)
        const queryLive = async () => {
          const liveResp = await api.readMessagesLive(contactId, {
            limit,
            offset,
            downloadMedia,
          }) as { messages: Array<Record<string, unknown>> };
          const liveData = liveResp.messages || [];
          let markedAsRead = false;

          if (markAsRead && liveData.length > 0) {
            await api.markAsRead(contactId);
            markedAsRead = true;
          }

          return {
            contactId,
            messages: liveData.map((m) => ({
              id: m.id,
              from: m.from,
              fromMe: m.fromMe,
              body: m.body || (m.hasMedia ? `[Media: ${m.type || "file"}]` : "[No text content]"),
              timestamp: typeof m.timestamp === "number" ? formatTimestamp(m.timestamp as number) : m.timestamp,
              hasMedia: m.hasMedia,
              ack: m.ackName ?? m.ack,
              ...(m.media ? { media: m.media } : {}),
            })),
            count: liveData.length,
            offset,
            hasMore: liveData.length === limit,
            source: "live" as const,
            ...(markAsRead ? { markedAsRead } : {}),
          };
        };

        // Use Message Store — persistent history with search
        const data = await api.searchMessages({
          chat_jid: contactId,
          search,
          sender,
          type,
          since,
          until,
          from_me: fromMe,
          limit,
          offset,
        });

        // If Store returns empty for a DM chat (offset 0, no filters),
        // fall back to live — the Store may not have this chat's messages
        // (e.g., self-chat, or chat predates webhook capture).
        const isImported = contactId.endsWith("@import");
        const isDm = !contactId.endsWith("@g.us") && !isImported;
        const hasFilters = search || sender || type || since || until || fromMe !== undefined;
        if (data.messages.length === 0 && isDm && offset === 0 && !hasFilters) {
          const liveResult = await queryLive();
          let text = JSON.stringify(liveResult, null, 2);
          if (text.length > CHARACTER_LIMIT) {
            const truncated = {
              ...liveResult,
              messages: liveResult.messages.slice(0, Math.ceil(liveResult.messages.length / 2)),
              truncated: true,
              truncationNote: "Response truncated. Use a smaller 'limit' or increase 'offset'.",
            };
            text = JSON.stringify(truncated, null, 2);
          }
          return { content: [{ type: "text" as const, text }] };
        }

        const result = {
          contactId,
          messages: data.messages.map((m) => ({
            id: m.id,
            senderName: m.sender_name,
            senderJid: m.sender_jid,
            fromMe: m.from_me,
            body: m.body,
            contextualBody: m.body_contextual,
            contextNote: m.context_note,
            timestamp: m.timestamp,
            messageType: m.message_type,
            hasMedia: m.has_media,
            mediaMimetype: m.media_mimetype,
            ack: m.ack,
            isRevoked: m.is_revoked,
            isEdited: m.is_edited,
          })),
          total: data.total,
          count: data.messages.length,
          offset,
          hasMore: data.has_more,
          source: "message-store" as const,
        };

        if (markAsRead) {
          if (isImported) {
            Object.assign(result, {
              markedAsRead: false,
              markAsReadWarning: "Imported history has no live WhatsApp chat to mark as read.",
            });
          } else if (data.messages.length > 0) {
            await api.markAsRead(contactId);
            Object.assign(result, { markedAsRead: true });
          } else {
            Object.assign(result, { markedAsRead: false });
          }
        }

        let text = JSON.stringify(result, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...result,
            messages: result.messages.slice(0, Math.ceil(result.messages.length / 2)),
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
