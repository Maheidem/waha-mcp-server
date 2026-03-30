import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createLiveServer,
  parseToolResult,
  testMarker,
  SELF_CHAT_ID,
  sharedState,
  type LiveServer,
} from "../helpers/live-server.js";

describe("Level 2 — Self-write Tools", () => {
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

  it("sends a text message to self and returns a messageId", async () => {
    const result = await client.callTool({
      name: "whatsapp_send_text",
      arguments: {
        chatId: SELF_CHAT_ID,
        text: `Hello from integration test ${marker}`,
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseToolResult(result) as {
      status: string;
      messageId: string;
      chatId: string;
      timestamp: string;
    };
    expect(parsed.status).toBe("sent");
    expect(parsed.messageId).toBeTruthy();
    expect(typeof parsed.messageId).toBe("string");
    expect(parsed.chatId).toBe(SELF_CHAT_ID);

    sharedState.selfSentMessageId = parsed.messageId;
  });

  it("reads back the sent message from self chat", async () => {
    expect(sharedState.selfSentMessageId).toBeTruthy();

    // Small delay to ensure message is readable
    await new Promise((r) => setTimeout(r, 1000));

    const result = await client.callTool({
      name: "whatsapp_read_messages",
      arguments: { chatId: SELF_CHAT_ID, limit: 5 },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseToolResult(result) as {
      messages: Array<{ id: string; body: string; fromMe: boolean }>;
    };

    const found = parsed.messages.find(
      (m) => m.body && m.body.includes(marker)
    );
    expect(found).toBeTruthy();
    expect(found!.fromMe).toBe(true);
    expect(found!.id).toBe(sharedState.selfSentMessageId);
  });

  it("sends a reply-to message referencing the first message", async () => {
    expect(sharedState.selfSentMessageId).toBeTruthy();

    const result = await client.callTool({
      name: "whatsapp_send_text",
      arguments: {
        chatId: SELF_CHAT_ID,
        text: `Reply test ${marker}`,
        replyTo: sharedState.selfSentMessageId,
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseToolResult(result) as {
      status: string;
      messageId: string;
    };
    expect(parsed.status).toBe("sent");
    expect(parsed.messageId).toBeTruthy();
    sharedState.selfReplyMessageId = parsed.messageId;
  });

  it("reacts to own message with thumbs-up emoji", async () => {
    expect(sharedState.selfSentMessageId).toBeTruthy();

    const result = await client.callTool({
      name: "whatsapp_react",
      arguments: {
        chatId: SELF_CHAT_ID,
        messageId: sharedState.selfSentMessageId!,
        reaction: "\uD83D\uDC4D",
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseToolResult(result) as {
      status: string;
      messageId: string;
    };
    expect(parsed.status).toBe("reacted");
    expect(parsed.messageId).toBe(sharedState.selfSentMessageId);
  });

  it("removes reaction with empty string", async () => {
    expect(sharedState.selfSentMessageId).toBeTruthy();

    const result = await client.callTool({
      name: "whatsapp_react",
      arguments: {
        chatId: SELF_CHAT_ID,
        messageId: sharedState.selfSentMessageId!,
        reaction: "",
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseToolResult(result) as { status: string };
    expect(parsed.status).toBe("reaction_removed");
  });
});
