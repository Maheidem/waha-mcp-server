import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../services/api-client.js";
import type { WahaConfig } from "../types.js";
import { registerSessionTools } from "./session.js";
import { registerChatTools } from "./chats.js";
import { registerMessagingTools } from "./messaging.js";
import { registerContactTools } from "./contacts.js";
import { registerMediaTools } from "./media.js";
import { registerStoreTools } from "./store.js";
import { registerAutoReplyTools } from "./auto-reply.js";

/**
 * Register all WhatsApp MCP tools on the server.
 */
export function registerAllTools(
  server: McpServer,
  api: ApiClient,
  config: WahaConfig,
): void {
  registerSessionTools(server, api);
  registerChatTools(server, api);
  registerMessagingTools(server, api);
  registerContactTools(server, api);
  registerMediaTools(server, api, config);
  registerStoreTools(server, api);
  registerAutoReplyTools(server, api);
}
