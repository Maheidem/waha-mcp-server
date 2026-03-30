import * as fs from "node:fs";
import * as path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WahaClient } from "../services/waha-client.js";
import type { WahaMessage } from "../types.js";
import { parseWahaError, mcpError } from "../utils/errors.js";

const MEDIA_DIR = "/tmp/whatsapp-media";

/**
 * Extract the relative path from a WAHA media URL.
 * "http://localhost:3000/api/files/default/xxx.jpeg" → "/files/default/xxx.jpeg"
 */
function extractMediaPath(url: string): string {
  const match = url.match(/\/files\/.+$/);
  if (match) return match[0];
  // Fallback: try to extract path after /api
  const apiMatch = url.match(/\/api(\/files\/.+)$/);
  if (apiMatch) return apiMatch[1];
  throw new Error(`Cannot parse media path from URL: ${url}`);
}

export function registerMediaTools(server: McpServer, client: WahaClient): void {
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
        // 1. Fetch the specific message with media download enabled
        const message = await client.get<WahaMessage>(
          `/${client.session}/chats/${chatId}/messages/${messageId}`,
          { downloadMedia: true }
        );

        if (!message.hasMedia || !message.media?.url) {
          return mcpError(
            "This message has no media attached." +
            (message.media && "error" in message.media
              ? ` Download error: media may have expired on WhatsApp's servers.`
              : "")
          );
        }

        // 2. Download the binary
        const mediaPath = extractMediaPath(message.media.url);
        const { data, mimeType } = await client.download(mediaPath);
        const resolvedMime = message.media.mimetype || mimeType;

        // 3. Return based on type
        if (resolvedMime.startsWith("image/")) {
          return {
            content: [
              {
                type: "image" as const,
                data: data.toString("base64"),
                mimeType: resolvedMime,
              },
              {
                type: "text" as const,
                text: JSON.stringify({
                  messageId,
                  chatId,
                  mimeType: resolvedMime,
                  sizeBytes: data.length,
                }, null, 2),
              },
            ],
          };
        }

        if (resolvedMime.startsWith("audio/")) {
          return {
            content: [
              {
                type: "audio" as const,
                data: data.toString("base64"),
                mimeType: resolvedMime,
              },
              {
                type: "text" as const,
                text: JSON.stringify({
                  messageId,
                  chatId,
                  mimeType: resolvedMime,
                  sizeBytes: data.length,
                }, null, 2),
              },
            ],
          };
        }

        // 4. For video/documents: save to disk
        if (!fs.existsSync(MEDIA_DIR)) {
          fs.mkdirSync(MEDIA_DIR, { recursive: true });
        }

        const ext = resolvedMime.split("/")[1]?.split(";")[0] || "bin";
        const filename = message.media.filename || `${messageId.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
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
                mimeType: resolvedMime,
                sizeBytes: data.length,
                filename,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return mcpError(parseWahaError(error));
      }
    }
  );
}
