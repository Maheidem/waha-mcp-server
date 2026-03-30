import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WahaClient } from "../services/waha-client.js";
import type { WahaSession, WahaMe } from "../types.js";
import { parseWahaError, mcpError } from "../utils/errors.js";

export function registerSessionTools(server: McpServer, client: WahaClient): void {
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
        const sessions = await client.get<WahaSession[]>("/sessions");
        const session = sessions.find((s) => s.name === client.session);

        if (!session) {
          return mcpError(
            `Session "${client.session}" not found. Available sessions: ${sessions.map((s) => s.name).join(", ") || "none"}`
          );
        }

        const result = {
          name: session.name,
          status: session.status,
          phone: session.me?.id || null,
          pushName: session.me?.pushName || null,
          presence: session.presence,
          lastActivity: session.timestamps?.activity
            ? new Date(session.timestamps.activity).toISOString()
            : null,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseWahaError(error));
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
        const me = await client.get<WahaMe>(`/sessions/${client.session}/me`);

        const result = {
          id: me.id,
          pushName: me.pushName,
          lid: me.lid || null,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return mcpError(parseWahaError(error));
      }
    }
  );
}
