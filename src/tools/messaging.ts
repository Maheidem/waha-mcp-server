import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WahaClient } from "../services/waha-client.js";
import type { WahaSendResult } from "../types.js";
import { parseWahaError, mcpError } from "../utils/errors.js";

export function registerMessagingTools(server: McpServer, client: WahaClient): void {
  server.registerTool(
    "whatsapp_send_text",
    {
      title: "Send WhatsApp Text Message",
      description: `Send a text message to a WhatsApp chat.

CORE tier supports text messages only (no images, video, audio, or documents).
A rate limit delay is enforced between sends to avoid WhatsApp detection.

Args:
  - chatId: Recipient chat ID. Format: "5511999999999@c.us" for contacts, "id@g.us" for groups
  - text: Message text to send
  - replyTo: Optional message ID to quote-reply to (get from whatsapp_read_messages)

Returns:
  - status: "sent"
  - messageId: The sent message's ID
  - chatId: Where it was sent`,
      inputSchema: {
        chatId: z.string().min(1)
          .describe('Recipient chat ID. Format: "5511999999999@c.us" for contacts, "id@g.us" for groups'),
        text: z.string().min(1).max(65536)
          .describe("Text message to send"),
        replyTo: z.string().optional()
          .describe("Message ID to quote-reply to (from whatsapp_read_messages)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ chatId, text, replyTo }) => {
      try {
        await client.throttleSend();

        const body: Record<string, unknown> = {
          chatId,
          text,
          session: client.session,
        };
        if (replyTo) {
          body.reply_to = replyTo;
        }

        const result = await client.post<WahaSendResult>("/sendText", body);

        const output = {
          status: "sent",
          messageId: result.id,
          chatId,
          timestamp: result.timestamp
            ? new Date(result.timestamp * 1000).toISOString()
            : new Date().toISOString(),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseWahaError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_react",
    {
      title: "React to WhatsApp Message",
      description: `React to a WhatsApp message with an emoji.

Use an empty string for the reaction to remove an existing reaction.

Args:
  - chatId: Chat ID where the message is
  - messageId: Message ID to react to (get from whatsapp_read_messages)
  - reaction: Emoji to react with (e.g., "👍", "❤️", "😂"). Empty string removes reaction.

Returns confirmation of the reaction.`,
      inputSchema: {
        chatId: z.string().min(1)
          .describe("Chat ID where the message is"),
        messageId: z.string().min(1)
          .describe("Message ID to react to"),
        reaction: z.string()
          .describe('Emoji reaction (e.g., "👍", "❤️"). Empty string removes reaction.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ chatId, messageId, reaction }) => {
      try {
        await client.put("/reaction", {
          chatId,
          messageId,
          reaction,
          session: client.session,
        });

        const output = {
          status: reaction ? "reacted" : "reaction_removed",
          chatId,
          messageId,
          reaction: reaction || null,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseWahaError(error));
      }
    }
  );

  // ─── whatsapp_edit_message ──────────────────────────────────────
  server.registerTool(
    "whatsapp_edit_message",
    {
      title: "Edit WhatsApp Message",
      description: `Edit a previously sent text message.

Only works on messages you sent (fromMe=true). WhatsApp shows an "edited" label
on the message after editing.

Args:
  - chatId: Chat ID containing the message
  - messageId: Message ID to edit (must be your own message)
  - text: New text content

Returns confirmation with the edited message ID.`,
      inputSchema: {
        chatId: z.string().min(1).describe("Chat ID containing the message"),
        messageId: z.string().min(1).describe("Message ID to edit (must be your own message)"),
        text: z.string().min(1).max(65536).describe("New text content"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ chatId, messageId, text }) => {
      try {
        await client.put(
          `/${client.session}/chats/${chatId}/messages/${messageId}`,
          { text }
        );

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "edited",
              chatId,
              messageId,
            }, null, 2),
          }],
        };
      } catch (error) {
        return mcpError(parseWahaError(error));
      }
    }
  );

  // ─── whatsapp_delete_message ────────────────────────────────────
  server.registerTool(
    "whatsapp_delete_message",
    {
      title: "Delete WhatsApp Message",
      description: `Delete (unsend) a message from a chat.

Removes the message for everyone in the chat. WhatsApp shows
"This message was deleted" in its place.

Args:
  - chatId: Chat ID containing the message
  - messageId: Message ID to delete

Returns confirmation of deletion.`,
      inputSchema: {
        chatId: z.string().min(1).describe("Chat ID containing the message"),
        messageId: z.string().min(1).describe("Message ID to delete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ chatId, messageId }) => {
      try {
        await client.delete(
          `/${client.session}/chats/${chatId}/messages/${messageId}`
        );

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "deleted",
              chatId,
              messageId,
            }, null, 2),
          }],
        };
      } catch (error) {
        return mcpError(parseWahaError(error));
      }
    }
  );
}
