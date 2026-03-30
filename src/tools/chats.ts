import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WahaClient } from "../services/waha-client.js";
import type { MessageStoreClient } from "../services/message-store-client.js";
import type { WahaChatOverview, WahaMessage } from "../types.js";
import { DEFAULT_LIMIT, MAX_LIMIT, CHARACTER_LIMIT } from "../constants.js";
import { parseWahaError, parseStoreError, mcpError } from "../utils/errors.js";
import { formatTimestamp, extractMessageBody } from "../utils/formatting.js";

export function registerChatTools(
  server: McpServer,
  client: WahaClient,
  storeClient: MessageStoreClient | null = null,
): void {
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
        const chats = await client.get<WahaChatOverview[]>(
          `/${client.session}/chats/overview`,
          { limit, offset }
        );

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
        return mcpError(parseWahaError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_read_messages",
    {
      title: "Read WhatsApp Messages",
      description: `Read messages from a specific WhatsApp chat.

Returns messages with sender, text content, timestamp, and message ID.
Use the message ID from results for whatsapp_react or reply_to in whatsapp_send_text.

${storeClient ? "Powered by Message Store — persistent full history with full-text search and sender filtering." : "Using WAHA directly — in-memory history only."}

Args:
  - chatId: Chat ID to read from (e.g., "5511999999999@c.us" for contacts, "id@g.us" for groups)
  - limit: Number of messages to return (1-100, default 20)
  - offset: Skip N messages for pagination (default 0)
  - search: Full-text search within this chat's messages (optional${storeClient ? "" : ", requires Message Store"})
  - sender: Filter by sender name or JID (optional${storeClient ? "" : ", requires Message Store"})
  - type: Filter by message type: chat, image, album (optional${storeClient ? "" : ", requires Message Store"})
  - since: ISO date — messages after this date (optional)
  - until: ISO date — messages before this date (optional)
  - fromMe: Filter sent (true) or received (false) messages (optional)
  - downloadMedia: Include media download URLs (default false, WAHA only)
  - markAsRead: Mark messages as read after fetching (default false, WAHA only)

Returns:
  - messages: Array with id, sender, body, timestamp, type, fromMe, hasMedia
  - total: Total matching messages (Message Store only)
  - hasMore: Whether more results exist`,
      inputSchema: {
        chatId: z.string().min(1).describe("Chat ID to read messages from"),
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
          .describe("Number of messages to return (1-100, default 20)"),
        offset: z.coerce.number().int().min(0).default(0)
          .describe("Skip N messages for pagination (default 0)"),
        search: z.string().max(500).optional()
          .describe("Full-text search within this chat (optional, Message Store only)"),
        sender: z.string().max(500).optional()
          .describe("Filter by sender name or JID (optional, Message Store only)"),
        type: z.string().max(50).optional()
          .describe("Filter by message type: chat, image, album (optional, Message Store only)"),
        since: z.string().max(30).optional()
          .describe("ISO date — only messages after this date (optional)"),
        until: z.string().max(30).optional()
          .describe("ISO date — only messages before this date (optional)"),
        fromMe: z.coerce.boolean().optional()
          .describe("Filter: true = sent, false = received (optional)"),
        downloadMedia: z.coerce.boolean().default(false)
          .describe("Include media download URLs (WAHA only, default false)"),
        markAsRead: z.coerce.boolean().default(false)
          .describe("Mark messages as read after fetching (WAHA only, default false)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ chatId, limit, offset, search, sender, type, since, until, fromMe, downloadMedia, markAsRead }) => {
      try {
        // Helper: query WAHA directly (used as primary or fallback)
        const queryWaha = async () => {
          const params: Record<string, string | number | boolean> = {
            limit,
            offset,
            downloadMedia,
          };
          if (since !== undefined) {
            const ts = Math.floor(new Date(since).getTime() / 1000);
            if (!isNaN(ts)) params["filter.timestamp.gte"] = ts;
          }
          if (until !== undefined) {
            const ts = Math.floor(new Date(until).getTime() / 1000);
            if (!isNaN(ts)) params["filter.timestamp.lte"] = ts;
          }
          if (fromMe !== undefined) params["filter.fromMe"] = fromMe;

          const messages = await client.get<WahaMessage[]>(
            `/${client.session}/chats/${chatId}/messages`,
            params
          );

          if (markAsRead && messages.length > 0) {
            client.post(`/${client.session}/chats/${chatId}/messages/read`, {}).catch(() => {});
          }

          return {
            chatId,
            messages: messages.map((m) => {
              const msg: Record<string, unknown> = {
                id: m.id,
                from: m.from,
                fromMe: m.fromMe,
                body: extractMessageBody(m),
                timestamp: formatTimestamp(m.timestamp),
                hasMedia: m.hasMedia,
                ack: m.ackName,
              };
              if (m.media?.url) {
                const mediaUrl = m.media.url.replace(
                  /^https?:\/\/localhost:\d+\/api/,
                  client.baseUrl
                );
                msg.media = {
                  url: mediaUrl,
                  mimetype: m.media.mimetype,
                  ...(m.media.filename ? { filename: m.media.filename } : {}),
                };
              }
              return msg;
            }),
            count: messages.length,
            offset,
            hasMore: messages.length === limit,
            source: "waha" as const,
            ...(markAsRead ? { markedAsRead: true } : {}),
          };
        };

        if (storeClient) {
          // Use Message Store — persistent history with search
          const data = await storeClient.searchMessages({
            chat_jid: chatId,
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
          // fall back to WAHA — the Store may not have this chat's messages
          // (e.g., self-chat, or chat predates webhook capture).
          const isDm = chatId.endsWith("@c.us");
          const hasFilters = search || sender || type || since || until || fromMe !== undefined;
          if (data.messages.length === 0 && isDm && offset === 0 && !hasFilters) {
            const wahaResult = await queryWaha();
            let text = JSON.stringify(wahaResult, null, 2);
            if (text.length > CHARACTER_LIMIT) {
              const truncated = {
                ...wahaResult,
                messages: wahaResult.messages.slice(0, Math.ceil(wahaResult.messages.length / 2)),
                truncated: true,
                truncationNote: "Response truncated. Use a smaller 'limit' or increase 'offset'.",
              };
              text = JSON.stringify(truncated, null, 2);
            }
            return { content: [{ type: "text" as const, text }] };
          }

          const result = {
            chatId,
            messages: data.messages.map((m) => ({
              id: m.id,
              senderName: m.sender_name,
              senderJid: m.sender_jid,
              fromMe: m.from_me,
              body: m.body,
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
        }

        // No Message Store — WAHA directly
        const wahaResult = await queryWaha();
        let text = JSON.stringify(wahaResult, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...wahaResult,
            messages: wahaResult.messages.slice(0, Math.ceil(wahaResult.messages.length / 2)),
            truncated: true,
            truncationNote: "Response truncated. Use a smaller 'limit' or increase 'offset'.",
          };
          text = JSON.stringify(truncated, null, 2);
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return mcpError(storeClient ? parseStoreError(error) : parseWahaError(error));
      }
    }
  );
}
