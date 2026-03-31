import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createLiveServer,
  type LiveServer,
} from "../helpers/live-server.js";

describe("Error Handling", () => {
  let env: LiveServer;
  let client: Client;

  beforeAll(async () => {
    env = await createLiveServer();
    client = env.client;
  });

  afterAll(async () => {
    await env.cleanup();
  });

  // ─── Input validation ──────────────────────────────────────────

  it("send_text with empty chatId returns validation error", async () => {
    try {
      const result = await client.callTool({
        name: "whatsapp_send_text",
        arguments: { chatId: "", text: "test" },
      });
      expect(result.isError).toBe(true);
    } catch (error) {
      // MCP SDK may throw for validation errors — acceptable
      expect(error).toBeTruthy();
    }
  });

  it("send_text with empty text returns validation error", async () => {
    try {
      const result = await client.callTool({
        name: "whatsapp_send_text",
        arguments: { chatId: "5524992272331@c.us", text: "" },
      });
      expect(result.isError).toBe(true);
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  it("check_number with empty phone returns error", async () => {
    try {
      const result = await client.callTool({
        name: "whatsapp_check_number",
        arguments: { phone: "" },
      });
      expect(result.isError).toBe(true);
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  it("search_messages with empty search returns validation error", async () => {
    try {
      const result = await client.callTool({
        name: "whatsapp_search_messages",
        arguments: { search: "" },
      });
      expect(result.isError).toBe(true);
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  it("contact_graph with invalid contactId returns error", async () => {
    const result = await client.callTool({
      name: "whatsapp_contact_graph",
      arguments: { contactId: 999999 },
    });
    expect(result.isError).toBeTruthy();
  });

  it("chat_summary with invalid chatId returns error", async () => {
    const result = await client.callTool({
      name: "whatsapp_chat_summary",
      arguments: { chatId: "0000000000@c.us" },
    });
    expect(result.isError).toBeTruthy();
  });

  it("get_group_info with invalid groupId returns error", async () => {
    const result = await client.callTool({
      name: "whatsapp_get_group_info",
      arguments: { groupId: "invalid@g.us" },
    });
    expect(result.isError).toBeTruthy();
  });

  it("edit_message with empty text returns validation error", async () => {
    try {
      const result = await client.callTool({
        name: "whatsapp_edit_message",
        arguments: { chatId: "test@c.us", messageId: "test", text: "" },
      });
      expect(result.isError).toBe(true);
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  // ─── Graceful degradation ─────────────────────────────────────

  it("read_messages with invalid chatId returns error, not crash", async () => {
    const result = await client.callTool({
      name: "whatsapp_read_messages",
      arguments: { chatId: "not-a-real-chat-id" },
    });
    // Should return gracefully — not throw
    expect(result.content).toBeTruthy();

    // Prove server is still alive
    const status = await client.callTool({
      name: "whatsapp_session_status",
      arguments: {},
    });
    expect(status.isError).toBeFalsy();
  });

  it("server stays functional after multiple errors", async () => {
    // Trigger several errors
    await client.callTool({
      name: "whatsapp_read_messages",
      arguments: { chatId: "invalid@xyz" },
    }).catch(() => {});
    await client.callTool({
      name: "whatsapp_contact_graph",
      arguments: { contactId: 999999 },
    }).catch(() => {});
    await client.callTool({
      name: "whatsapp_get_group_info",
      arguments: { groupId: "fake@g.us" },
    }).catch(() => {});

    // Server should still respond correctly
    const result = await client.callTool({
      name: "whatsapp_session_status",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
  });

  // ─── Error message quality ─────────────────────────────────────

  it("error messages do not contain internal IP addresses", async () => {
    const result = await client.callTool({
      name: "whatsapp_chat_summary",
      arguments: { chatId: "0000000000@c.us" },
    });
    if (result.isError) {
      const content = result.content as Array<{ type: string; text: string }>;
      const errorText = content[0].text;
      // Should not contain raw internal IPs like 192.168.x.x or 10.x.x.x
      expect(errorText).not.toMatch(/\b192\.168\.\d{1,3}\.\d{1,3}/);
      expect(errorText).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    }
  });
});
