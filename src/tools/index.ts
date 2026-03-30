import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WahaClient } from "../services/waha-client.js";
import type { WahaConfig } from "../types.js";
import { registerSessionTools } from "./session.js";
import { registerChatTools } from "./chats.js";
import { registerMessagingTools } from "./messaging.js";
import { registerContactTools } from "./contacts.js";
import { registerMediaTools } from "./media.js";
import { registerGroupTools } from "./groups.js";

/**
 * Register all WhatsApp MCP tools on the server.
 */
export function registerAllTools(server: McpServer, client: WahaClient, config: WahaConfig): void {
  registerSessionTools(server, client);
  registerChatTools(server, client);
  registerMessagingTools(server, client);
  registerContactTools(server, client);
  registerMediaTools(server, client, config);
  registerGroupTools(server, client);
}
