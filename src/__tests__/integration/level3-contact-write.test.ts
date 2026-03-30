import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createLiveServer,
  parseToolResult,
  testMarker,
  MARIANA_CHAT_ID,
  sharedState,
  type LiveServer,
} from "../helpers/live-server.js";

// Gate: only run if WAHA_TEST_LEVEL >= 3
const level = parseInt(process.env.WAHA_TEST_LEVEL || "2", 10);
const describeOrSkip = level >= 3 ? describe : describe.skip;

describeOrSkip("Level 3 — Contact-write Tools (Mariana)", () => {
  let env: LiveServer;
  let client: Client;
  let marker: string;

  beforeAll(async () => {
    env = await createLiveServer();
    client = env.client;
    marker = testMarker();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("sends a text message to Mariana", async () => {
    const result = await client.callTool({
      name: "whatsapp_send_text",
      arguments: {
        chatId: MARIANA_CHAT_ID,
        text: `Automated test message — please ignore ${marker}`,
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseToolResult(result) as {
      status: string;
      messageId: string;
    };
    expect(parsed.status).toBe("sent");
    expect(parsed.messageId).toBeTruthy();
    sharedState.marianaSentMessageId = parsed.messageId;
  });

  it("reacts to latest message in Mariana chat and cleans up", async () => {
    const readResult = await client.callTool({
      name: "whatsapp_read_messages",
      arguments: { chatId: MARIANA_CHAT_ID, limit: 3 },
    });
    expect(readResult.isError).toBeFalsy();
    const parsed = parseToolResult(readResult) as {
      messages: Array<{ id: string }>;
    };
    expect(parsed.messages.length).toBeGreaterThan(0);

    const latestId = parsed.messages[0].id;
    sharedState.latestMarianaMessageId = latestId;

    // React
    const reactResult = await client.callTool({
      name: "whatsapp_react",
      arguments: {
        chatId: MARIANA_CHAT_ID,
        messageId: latestId,
        reaction: "\u2764\uFE0F",
      },
    });
    expect(reactResult.isError).toBeFalsy();
    const reactParsed = parseToolResult(reactResult) as { status: string };
    expect(reactParsed.status).toBe("reacted");

    // Cleanup: remove reaction
    await client.callTool({
      name: "whatsapp_react",
      arguments: {
        chatId: MARIANA_CHAT_ID,
        messageId: latestId,
        reaction: "",
      },
    });
  });
});
