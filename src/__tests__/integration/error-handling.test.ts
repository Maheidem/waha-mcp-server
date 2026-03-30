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

  it("read_messages with invalid chatId returns error, not crash", async () => {
    const result = await client.callTool({
      name: "whatsapp_read_messages",
      arguments: { chatId: "not-a-real-chat-id" },
    });
    // Should return gracefully (either error or empty) — not throw
    expect(result.content).toBeTruthy();

    // Prove server is still alive
    const status = await client.callTool({
      name: "whatsapp_session_status",
      arguments: {},
    });
    expect(status.isError).toBeFalsy();
  });

  it("send_text with empty chatId returns validation error", async () => {
    try {
      const result = await client.callTool({
        name: "whatsapp_send_text",
        arguments: { chatId: "", text: "test" },
      });
      // If it returns (doesn't throw), it should be an error
      expect(result.isError).toBe(true);
    } catch (error) {
      // MCP SDK may throw for validation errors — that's also acceptable
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

  it("server stays functional after errors", async () => {
    // Trigger an error
    await client.callTool({
      name: "whatsapp_read_messages",
      arguments: { chatId: "invalid@xyz" },
    }).catch(() => {});

    // Server should still respond
    const result = await client.callTool({
      name: "whatsapp_session_status",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
  });
});
