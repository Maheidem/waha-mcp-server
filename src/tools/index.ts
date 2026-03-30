import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WahaClient } from "../services/waha-client.js";
import { registerSessionTools } from "./session.js";
import { registerChatTools } from "./chats.js";
import { registerMessagingTools } from "./messaging.js";
import { registerContactTools } from "./contacts.js";

/**
 * Register all WhatsApp MCP tools on the server.
 */
export function registerAllTools(server: McpServer, client: WahaClient): void {
  registerSessionTools(server, client);
  registerChatTools(server, client);
  registerMessagingTools(server, client);
  registerContactTools(server, client);
}
