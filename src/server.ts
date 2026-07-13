import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRequire } from "node:module";
import { ApiClient } from "./services/api-client.js";
import { registerAllTools } from "./tools/index.js";
import type { WahaConfig } from "./types.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/**
 * Create and configure the MCP server with all tools registered.
 */
export function createServer(config: WahaConfig, apiClient?: ApiClient): McpServer {
  const server = new McpServer({
    name: "waha-mcp-server",
    version,
  });

  const api = apiClient ?? new ApiClient(config);
  registerAllTools(server, api, config);

  return server;
}
