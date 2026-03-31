import * as fs from "node:fs";
import * as path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import type { WahaConfig } from "../types.js";
import { parseApiError, mcpError } from "../utils/errors.js";

const MEDIA_DIR = "/tmp/whatsapp-media";

export function registerMediaTools(server: McpServer, api: ApiClient, config: WahaConfig): void {
  server.registerTool(
    "whatsapp_download_media",
    {
      title: "Download WhatsApp Media",
      description: `Download media (image, audio, video, document) from a WhatsApp message.

Fetches the media attached to a specific message and returns it directly:
- Images: returned inline so Claude can see them
- Audio: returned inline so Claude can process them
- Video/documents: saved to /tmp/whatsapp-media/ and path returned

Use whatsapp_read_messages first to find messages with hasMedia=true, then pass
the chatId and messageId here.

Note: Old media (weeks+) may no longer be available on WhatsApp's servers.

Args:
  - chatId: Chat ID containing the message
  - messageId: Message ID with media to download (from whatsapp_read_messages)

Returns:
  - For images: the image content directly (Claude can see it)
  - For audio: the audio content directly
  - For other files: file path where it was saved + metadata`,
      inputSchema: {
        chatId: z.string().min(1).describe("Chat ID containing the message"),
        messageId: z.string().min(1).describe("Message ID with media to download"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ chatId, messageId }) => {
      try {
        // Read the message live with downloadMedia=true to get the media URL
        const messages = await api.readMessagesLive(chatId, {
          limit: 1,
          downloadMedia: true,
        }) as Array<Record<string, unknown>>;

        // Find the specific message by ID from the live data
        // Since live endpoint returns latest messages, we need to use the
        // media endpoint directly with the file ID
        // Try downloading via the media endpoint
        const { data, mimeType } = await api.downloadMedia(config.session, messageId);

        // Return based on type
        if (mimeType.startsWith("image/")) {
          return {
            content: [
              {
                type: "image" as const,
                data: data.toString("base64"),
                mimeType,
              },
              {
                type: "text" as const,
                text: JSON.stringify({
                  messageId,
                  chatId,
                  mimeType,
                  sizeBytes: data.length,
                }, null, 2),
              },
            ],
          };
        }

        if (mimeType.startsWith("audio/")) {
          return {
            content: [
              {
                type: "audio" as const,
                data: data.toString("base64"),
                mimeType,
              },
              {
                type: "text" as const,
                text: JSON.stringify({
                  messageId,
                  chatId,
                  mimeType,
                  sizeBytes: data.length,
                }, null, 2),
              },
            ],
          };
        }

        // For video/documents: save to disk
        if (!fs.existsSync(MEDIA_DIR)) {
          fs.mkdirSync(MEDIA_DIR, { recursive: true });
        }

        const ext = mimeType.split("/")[1]?.split(";")[0] || "bin";
        const filename = `${messageId.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
        const filePath = path.join(MEDIA_DIR, filename);
        fs.writeFileSync(filePath, data);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "saved",
                filePath,
                messageId,
                chatId,
                mimeType,
                sizeBytes: data.length,
                filename,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );

  // ─── whatsapp_transcribe_audio ──────────────────────────────────
  server.registerTool(
    "whatsapp_transcribe_audio",
    {
      title: "Transcribe WhatsApp Audio",
      description: `Transcribe a WhatsApp voice message or audio to text.

Server-side transcription via Speaches (Whisper). Optionally replies to the
original message with the transcription text.

Args:
  - chatId: Chat ID containing the audio message
  - messageId: Message ID of the audio to transcribe
  - replyWithTranscription: If true, sends the transcription as a WhatsApp reply to the audio message (default false)

Returns:
  - transcription: The transcribed text
  - language: Detected language (if available)
  - replyMessageId: ID of the reply message (if replyWithTranscription=true)`,
      inputSchema: {
        chatId: z.string().min(1).describe("Chat ID containing the audio message"),
        messageId: z.string().min(1).describe("Message ID of the audio to transcribe"),
        replyWithTranscription: z.coerce.boolean().default(false)
          .describe("If true, sends the transcription as a WhatsApp reply to the audio (default false)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ chatId, messageId, replyWithTranscription }) => {
      try {
        // Transcribe via the API (server-side)
        const result = await api.transcribe({ message_id: messageId }) as Record<string, unknown>;
        const transcription = (result.text ?? result.transcription ?? "") as string;

        // Optionally reply with transcription
        let replyMessageId: string | undefined;
        if (replyWithTranscription && transcription) {
          await api.throttleSend();
          const replyPrefix = "\u{1F4DD} *Transcri\u00e7\u00e3o:*\n\n";
          const sendResult = await api.sendText({
            chat_id: chatId,
            text: `${replyPrefix}${transcription}`,
            session: api.session,
            reply_to: messageId,
          });
          replyMessageId = sendResult.id;
        }

        const output: Record<string, unknown> = {
          transcription,
          messageId,
          chatId,
          language: result.language || "auto",
        };
        if (replyMessageId) {
          output.replyMessageId = replyMessageId;
          output.replySent = true;
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );
}
