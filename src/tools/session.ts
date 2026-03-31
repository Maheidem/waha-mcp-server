import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../services/api-client.js";
import { parseApiError, mcpError } from "../utils/errors.js";

export function registerSessionTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whatsapp_session_status",
    {
      title: "WhatsApp Session Status",
      description: `Check if the WhatsApp session is connected and working.

Returns the session status (WORKING, STOPPED, etc.), the connected phone number,
and display name. Use this to verify connectivity before sending messages.

No parameters required.

Returns:
  - name: Session name
  - status: "WORKING" if connected, "STOPPED" if disconnected
  - phone: Connected phone number (if authenticated)
  - pushName: Display name on WhatsApp`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const session = await api.getSessionStatus() as Record<string, unknown>;

        const me = session.me as Record<string, unknown> | null;
        const timestamps = session.timestamps as Record<string, number> | null;

        const result = {
          name: session.name ?? api.session,
          status: session.status,
          phone: me?.id || null,
          pushName: me?.pushName || null,
          presence: session.presence ?? null,
          lastActivity: timestamps?.activity
            ? new Date(timestamps.activity).toISOString()
            : null,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );

  server.registerTool(
    "whatsapp_account_info",
    {
      title: "WhatsApp Account Info",
      description: `Get information about the authenticated WhatsApp account.

Returns the phone number, display name, and WhatsApp ID of the connected account.
Use this to verify which account is connected.

No parameters required.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const me = await api.getAccount() as Record<string, unknown>;

        const result = {
          id: me.id,
          pushName: me.pushName,
          lid: me.lid || null,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    }
  );
}
