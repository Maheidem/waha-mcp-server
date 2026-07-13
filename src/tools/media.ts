import * as fs from "node:fs";
import * as path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient } from "../services/api-client.js";
import type { WahaConfig } from "../types.js";
import { parseApiError, mcpError } from "../utils/errors.js";
import { extractSentMessageId } from "./messaging.js";

const MEDIA_DIR = "/tmp/whatsapp-media";
const MAX_INLINE_MEDIA_BYTES = 10 * 1024 * 1024;

interface StoredMediaMessage {
  media_url?: string | null;
}

/** Resolve the WAHA files endpoint components from a stored media URL. */
export function parseStoredMediaUrl(mediaUrl: string): { session: string; fileId: string } | null {
  try {
    const url = new URL(mediaUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const filesIndex = parts.lastIndexOf("files");
    if (filesIndex < 0 || parts.length < filesIndex + 3) return null;
    return {
      session: decodeURIComponent(parts[filesIndex + 1]),
      fileId: decodeURIComponent(parts.slice(filesIndex + 2).join("/")),
    };
  } catch {
    return null;
  }
}

function saveMediaFile(messageId: string, mimeType: string, data: Buffer): string {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
  const rawExtension = mimeType.split("/")[1]?.split(";")[0] || "bin";
  const extension = rawExtension.replace(/[^a-zA-Z0-9.+-]/g, "_");
  const filename = `${messageId.replace(/[^a-zA-Z0-9]/g, "_")}.${extension}`;
  const filePath = path.join(MEDIA_DIR, filename);
  fs.writeFileSync(filePath, data);
  return filePath;
}

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

Images or audio larger than 10 MiB are also saved to /tmp instead of being embedded
in an oversized MCP response.

Use whatsapp_read_messages first to find messages with hasMedia=true, then pass
the contactId and messageId here.

Note: Old media (weeks+) may no longer be available on WhatsApp's servers.

Args:
  - contactId: Phone digits or "*@g.us" — the contact whose chat contains the message
  - messageId: Message ID with media to download (from whatsapp_read_messages)

Returns:
  - For images: the image content directly (Claude can see it)
  - For audio: the audio content directly
  - For other files: file path where it was saved + metadata`,
      inputSchema: {
        contactId: z.string().min(1).describe('Phone digits or "*@g.us" — chat that contains the media message'),
        messageId: z.string().min(1).describe("Message ID with media to download"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ contactId, messageId }) => {
      try {
        // Current GOWS message IDs and WAHA media filenames are independent.
        // Resolve the authoritative media_url from the store first, retaining
        // the old message-id heuristic for live-only/legacy messages.
        let session = config.session;
        let fileId: string | undefined;
        try {
          const stored = await api.getMessage(messageId) as StoredMediaMessage;
          const location = stored.media_url ? parseStoredMediaUrl(stored.media_url) : null;
          if (location) {
            session = location.session;
            fileId = location.fileId;
          }
        } catch {
          // A just-arrived live message may not be in PostgreSQL yet.
        }
        if (!fileId) {
          const parts = messageId.split("_");
          fileId = parts.length >= 3 ? parts[2] : messageId;
        }

        const { data, mimeType } = await api.downloadMedia(session, fileId);

        if ((mimeType.startsWith("image/") || mimeType.startsWith("audio/"))
          && data.length > MAX_INLINE_MEDIA_BYTES) {
          const filePath = saveMediaFile(messageId, mimeType, data);
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                status: "saved",
                inline: false,
                reason: "Media exceeds the 10 MiB inline response limit.",
                filePath,
                messageId,
                contactId,
                mimeType,
                sizeBytes: data.length,
                filename: path.basename(filePath),
              }, null, 2),
            }],
          };
        }

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
                  contactId,
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
                  contactId,
                  mimeType,
                  sizeBytes: data.length,
                }, null, 2),
              },
            ],
          };
        }

        // For video/documents: save to disk
        const filePath = saveMediaFile(messageId, mimeType, data);
        const filename = path.basename(filePath);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "saved",
                filePath,
                messageId,
                contactId,
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

Server-side transcription through the backend provider chain. Optionally sends the
transcription to the chat as a new, unquoted follow-up message.

Args:
  - contactId: Phone digits or "*@g.us" — the contact whose chat contains the audio
  - messageId: Message ID of the audio to transcribe
  - language: ISO 639-1 language hint (default "pt")
  - prompt: Optional names, vocabulary, or context to help the ASR provider
  - replyWithTranscription: If true, sends the transcription back to the chat (default false)

Returns:
  - transcription: The transcribed text
  - source: "cached" or "transcribed"
  - replyMessageId: ID of the reply message (if replyWithTranscription=true)`,
      inputSchema: {
        contactId: z.string().min(1).describe('Phone digits or "*@g.us" — chat that contains the audio'),
        messageId: z.string().min(1).describe("Message ID of the audio to transcribe"),
        language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/).default("pt")
          .describe('Language hint such as "pt" or "en" (default "pt")'),
        prompt: z.string().max(1000).optional()
          .describe("Optional names, vocabulary, or context to help transcription"),
        replyWithTranscription: z.boolean().default(false)
          .describe("If true, sends the transcription as a new WhatsApp follow-up (default false)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ contactId, messageId, language, prompt, replyWithTranscription }) => {
      try {
        // Transcribe via the API (server-side)
        const result = await api.transcribe({
          message_id: messageId,
          language,
          ...(prompt ? { prompt } : {}),
        }) as Record<string, unknown>;
        const transcription = (result.text ?? result.transcription ?? "") as string;

        // Optionally reply with transcription
        let replyMessageId: string | undefined;
        let replySent = false;
        if (replyWithTranscription && transcription) {
          await api.throttleSend();
          const replyPrefix = "\u{1F4DD} *Transcri\u00e7\u00e3o:*\n\n";
          const sendResult = await api.sendText({
            contact_id: contactId,
            text: `${replyPrefix}${transcription}`,
            session: api.session,
          });
          replySent = true;
          replyMessageId = extractSentMessageId(sendResult) ?? undefined;
        }

        const output: Record<string, unknown> = {
          transcription,
          messageId,
          contactId,
          languageHint: language,
          source: result.source ?? "unknown",
        };
        if (replySent) {
          output.replySent = true;
          output.replyMessageId = replyMessageId ?? null;
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    },
  );

  server.registerTool(
    "whatsapp_generate_speech",
    {
      title: "Generate Speech Audio",
      description: `Generate speech audio from text with the backend TTS service.

The audio is returned inline to the MCP client. This tool does not send audio to
WhatsApp (the configured WAHA CORE tier supports outbound text only).

Args:
  - text: Text to speak
  - voice: TTS voice id (backend default: pf_dora)
  - model: Optional backend model override
  - responseFormat: mp3, opus, wav, flac, aac, or pcm (default mp3)`,
      inputSchema: {
        text: z.string().min(1).max(10000).describe("Text to synthesize"),
        voice: z.string().min(1).max(200).default("pf_dora").describe("TTS voice id"),
        model: z.string().min(1).max(300).optional().describe("Optional TTS model override"),
        responseFormat: z.enum(["mp3", "opus", "wav", "flac", "aac", "pcm"])
          .default("mp3"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ text, voice, model, responseFormat }) => {
      try {
        const result = await api.textToSpeech({
          text,
          voice,
          ...(model ? { model } : {}),
          response_format: responseFormat,
        });
        if (result.data.length > MAX_INLINE_MEDIA_BYTES) {
          return mcpError(
            `Generated audio is ${result.data.length} bytes, above the 10 MiB inline limit.`,
          );
        }
        return {
          content: [
            {
              type: "audio" as const,
              data: result.data.toString("base64"),
              mimeType: result.mimeType,
            },
            {
              type: "text" as const,
              text: JSON.stringify({
                voice,
                model: model ?? "backend-default",
                responseFormat,
                mimeType: result.mimeType,
                sizeBytes: result.data.length,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    },
  );
}
