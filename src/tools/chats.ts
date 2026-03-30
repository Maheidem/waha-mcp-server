import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WahaClient } from "../services/waha-client.js";
import type { WahaChat, WahaMessage } from "../types.js";
import { DEFAULT_LIMIT, MAX_LIMIT, CHARACTER_LIMIT } from "../constants.js";
import { parseWahaError, mcpError } from "../utils/errors.js";
import { formatTimestamp, extractMessageBody } from "../utils/formatting.js";

export function registerChatTools(server: McpServer, client: WahaClient): void {
  server.registerTool(
    "whatsapp_list_chats",
    {
      title: "List WhatsApp Chats",
      description: `List recent WhatsApp chats (conversations).

Returns chat IDs, names, and last message timestamps. Use the chat ID from results
to read messages with whatsapp_read_messages.

Args:
  - limit: Number of chats to return (1-100, default 20)
  - offset: Pagination offset (default 0)

Returns array of chats with:
  - id: Chat ID (use this in other tools)
  - name: Contact or group name
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
        const chats = await client.get<WahaChat[]>(
          `/${client.session}/chats`,
          { limit, offset }
        );

        const result = {
          chats: chats.map((c) => ({
            id: c.id,
            name: c.name || c.id,
            lastMessageAt: formatTimestamp(c.conversationTimestamp),
          })),
          count: chats.length,
          offset,
          hasMore: chats.length === limit,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
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

Supports pagination via offset to go back in time, and timestamp filters to read
messages from a specific date range.

Args:
  - chatId: Chat ID to read from (e.g., "5511999999999@c.us" for contacts, "id@g.us" for groups)
  - limit: Number of messages to return (1-100, default 20)
  - offset: Skip N messages for pagination (default 0). Use to go further back in history.
  - timestampFrom: Only messages after this Unix timestamp (seconds). Example: 1709251200 for March 1 2024.
  - timestampTo: Only messages before this Unix timestamp (seconds).
  - fromMe: Filter to only sent (true) or only received (false) messages.
  - downloadMedia: Include media download URLs (default false, faster without)
  - markAsRead: Mark messages as read after fetching (default false). Use when triaging inbox.

Returns array of messages with:
  - id: Message ID (use for reactions/replies)
  - from: Sender's chat ID
  - fromMe: Whether you sent this message
  - body: Message text or description
  - timestamp: ISO timestamp
  - hasMedia: Whether message contains media`,
      inputSchema: {
        chatId: z.string().min(1).describe("Chat ID to read messages from"),
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
          .describe("Number of messages to return (1-100, default 20)"),
        offset: z.coerce.number().int().min(0).default(0)
          .describe("Skip N messages for pagination (default 0). Use to go further back in history."),
        timestampFrom: z.coerce.number().int().optional()
          .describe("Only messages after this Unix timestamp (seconds). E.g., 1709251200 for March 1 2024."),
        timestampTo: z.coerce.number().int().optional()
          .describe("Only messages before this Unix timestamp (seconds)."),
        fromMe: z.coerce.boolean().optional()
          .describe("Filter: true = only sent messages, false = only received messages."),
        downloadMedia: z.coerce.boolean().default(false)
          .describe("Include media download URLs (default false)"),
        markAsRead: z.coerce.boolean().default(false)
          .describe("Mark messages as read after fetching (default false). Use when triaging inbox."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ chatId, limit, offset, timestampFrom, timestampTo, fromMe, downloadMedia, markAsRead }) => {
      try {
        const params: Record<string, string | number | boolean> = {
          limit,
          offset,
          downloadMedia,
        };
        if (timestampFrom !== undefined) params["filter.timestamp.gte"] = timestampFrom;
        if (timestampTo !== undefined) params["filter.timestamp.lte"] = timestampTo;
        if (fromMe !== undefined) params["filter.fromMe"] = fromMe;

        const messages = await client.get<WahaMessage[]>(
          `/${client.session}/chats/${chatId}/messages`,
          params
        );

        // Mark messages as read if requested
        if (markAsRead && messages.length > 0) {
          client.post(`/${client.session}/chats/${chatId}/messages/read`, {}).catch(() => {
            // Non-critical — don't fail the read if mark-read fails
          });
        }

        const result = {
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
            // Include media URL when downloadMedia=true and media exists
            if (m.media?.url) {
              // Rewrite internal localhost URL to the configured WAHA API URL
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
          ...(markAsRead ? { markedAsRead: true } : {}),
        };

        // Truncate if response is too large
        let text = JSON.stringify(result, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...result,
            messages: result.messages.slice(0, Math.ceil(result.messages.length / 2)),
            truncated: true,
            truncationNote: `Response truncated. Use a smaller 'limit' or increase 'offset' to paginate.`,
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
}
