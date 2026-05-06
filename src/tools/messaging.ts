import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import { parseApiError, mcpError } from "../utils/errors.js";

const CONTACT_ID_DESC =
  'Contact id: phone digits for a person (e.g. "5521986910666"; survives @c.us↔@lid flips), or a group JID "*@g.us". Look up via whatsapp_list_contacts.';

export function registerMessagingTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whatsapp_send_text",
    {
      title: "Send WhatsApp Text Message",
      description: `Send a text message to a contact (person or group).

CORE tier supports text messages only (no images, video, audio, or documents).
A rate limit delay is enforced between sends to avoid WhatsApp detection.

Args:
  - contactId: ${CONTACT_ID_DESC}
  - text: Message text to send
  - replyTo: Optional message ID to quote-reply to (get from whatsapp_read_messages)

Returns:
  - status: "sent"
  - messageId: The sent message's ID
  - contactId: Where it was sent`,
      inputSchema: {
        contactId: z.string().min(1).describe(CONTACT_ID_DESC),
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
    async ({ contactId, text, replyTo }) => {
      try {
        await api.throttleSend();

        const result = await api.sendText({
          contact_id: contactId,
          text,
          session: api.session,
          ...(replyTo ? { reply_to: replyTo } : {}),
        });

        const output = {
          status: "sent",
          messageId: result.id,
          contactId,
          timestamp: result.timestamp
            ? new Date(result.timestamp * 1000).toISOString()
            : new Date().toISOString(),
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
    "whatsapp_react",
    {
      title: "React to WhatsApp Message",
      description: `React to a WhatsApp message with an emoji.

Use an empty string for the reaction to remove an existing reaction.

Args:
  - contactId: ${CONTACT_ID_DESC}
  - messageId: Message ID to react to (get from whatsapp_read_messages)
  - reaction: Emoji to react with (e.g., "👍", "❤️", "😂"). Empty string removes reaction.

Returns confirmation of the reaction.`,
      inputSchema: {
        contactId: z.string().min(1).describe(CONTACT_ID_DESC),
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
    async ({ contactId, messageId, reaction }) => {
      try {
        await api.react({
          message_id: messageId,
          reaction,
          session: api.session,
        });

        const output = {
          status: reaction ? "reacted" : "reaction_removed",
          contactId,
          messageId,
          reaction: reaction || null,
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
    "whatsapp_edit_message",
    {
      title: "Edit WhatsApp Message",
      description: `Edit a previously sent text message.

Only works on messages you sent (fromMe=true). WhatsApp shows an "edited" label
on the message after editing.

Args:
  - contactId: ${CONTACT_ID_DESC}
  - messageId: Message ID to edit (must be your own message)
  - text: New text content

Returns confirmation with the edited message ID.`,
      inputSchema: {
        contactId: z.string().min(1).describe(CONTACT_ID_DESC),
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
    async ({ contactId, messageId, text }) => {
      try {
        await api.editMessage({
          contact_id: contactId,
          message_id: messageId,
          text,
          session: api.session,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "edited",
              contactId,
              messageId,
            }, null, 2),
          }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_delete_message",
    {
      title: "Delete WhatsApp Message",
      description: `Delete (unsend) a message from a contact's chat.

Removes the message for everyone. WhatsApp shows "This message was deleted" in its place.

Args:
  - contactId: ${CONTACT_ID_DESC}
  - messageId: Message ID to delete

Returns confirmation of deletion.`,
      inputSchema: {
        contactId: z.string().min(1).describe(CONTACT_ID_DESC),
        messageId: z.string().min(1).describe("Message ID to delete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ contactId, messageId }) => {
      try {
        await api.deleteMessage(messageId, contactId, api.session);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "deleted",
              contactId,
              messageId,
            }, null, 2),
          }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_forward_message",
    {
      title: "Forward WhatsApp Message",
      description: `Forward a message from one chat to another contact.

The forwarded message shows a "Forwarded" label in WhatsApp and preserves
the original sender attribution.

Args:
  - contactId: ${CONTACT_ID_DESC} — destination
  - messageId: Message ID to forward (get from whatsapp_read_messages)

Returns confirmation with forwarded message ID.`,
      inputSchema: {
        contactId: z.string().min(1).describe(`${CONTACT_ID_DESC} (destination)`),
        messageId: z.string().min(1)
          .describe("Message ID to forward (from whatsapp_read_messages)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ contactId, messageId }) => {
      try {
        await api.throttleSend();

        const result = await api.forwardMessage({
          message_id: messageId,
          contact_id: contactId,
          session: api.session,
        });

        const output = {
          status: "forwarded",
          messageId: result.id,
          destinationContactId: contactId,
          originalMessageId: messageId,
          timestamp: result.timestamp
            ? new Date(result.timestamp * 1000).toISOString()
            : new Date().toISOString(),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );
}
