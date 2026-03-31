import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClient } from "./services/api-client.js";
import { registerAllTools } from "./tools/index.js";
import type { WahaConfig } from "./types.js";

/**
 * Create and configure the MCP server with all tools registered.
 */
export function createServer(config: WahaConfig): McpServer {
  const server = new McpServer({
    name: "waha-mcp-server",
    version: "1.0.0",
  });

  const api = new ApiClient(config);
  registerAllTools(server, api, config);

  return server;
}
