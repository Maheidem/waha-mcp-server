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

Args:
  - chatId: Chat ID to read from (e.g., "5511999999999@c.us" for contacts, "id@g.us" for groups)
  - limit: Number of messages to return (1-100, default 20)
  - downloadMedia: Include media download URLs (default false, faster without)

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
        downloadMedia: z.coerce.boolean().default(false)
          .describe("Include media download URLs (default false)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ chatId, limit, downloadMedia }) => {
      try {
        const messages = await client.get<WahaMessage[]>(
          `/${client.session}/chats/${chatId}/messages`,
          { limit, downloadMedia }
        );

        const result = {
          chatId,
          messages: messages.map((m) => ({
            id: m.id,
            from: m.from,
            fromMe: m.fromMe,
            body: extractMessageBody(m),
            timestamp: formatTimestamp(m.timestamp),
            hasMedia: m.hasMedia,
            ack: m.ackName,
          })),
          count: messages.length,
        };

        // Truncate if response is too large
        let text = JSON.stringify(result, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const truncated = {
            ...result,
            messages: result.messages.slice(0, Math.ceil(result.messages.length / 2)),
            truncated: true,
            truncationNote: `Response truncated. Use a smaller 'limit' to see all messages.`,
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
