import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WahaClient } from "../services/waha-client.js";
import type { MessageStoreClient } from "../services/message-store-client.js";
import type { WahaConfig } from "../types.js";
import { registerSessionTools } from "./session.js";
import { registerChatTools } from "./chats.js";
import { registerMessagingTools } from "./messaging.js";
import { registerContactTools } from "./contacts.js";
import { registerMediaTools } from "./media.js";
import { registerGroupTools } from "./groups.js";
import { registerStoreTools } from "./store.js";

/**
 * Register all WhatsApp MCP tools on the server.
 * storeClient is null when Message Store is not configured.
 */
export function registerAllTools(
  server: McpServer,
  client: WahaClient,
  config: WahaConfig,
  storeClient: MessageStoreClient | null,
): void {
  registerSessionTools(server, client);
  registerChatTools(server, client, storeClient);
  registerMessagingTools(server, client);
  registerContactTools(server, client, storeClient);
  registerMediaTools(server, client, config);
  registerGroupTools(server, client);

  if (storeClient) {
    registerStoreTools(server, storeClient);
  }
}
