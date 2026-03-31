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

  // ─── whatsapp_send_text ────────────────────────────────────────
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
    // Timestamp should be a valid ISO string
    expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();

    sharedState.selfSentMessageId = parsed.messageId;
  });

  it("reads back the sent message from self chat", async () => {
    expect(sharedState.selfSentMessageId).toBeTruthy();

    // Small delay to ensure message is readable
    await new Promise((r) => setTimeout(r, 1500));

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
  });

  // ─── whatsapp_send_text with replyTo ───────────────────────────
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

  // ─── whatsapp_react ────────────────────────────────────────────
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
      reaction: string;
    };
    expect(parsed.status).toBe("reacted");
    expect(parsed.messageId).toBe(sharedState.selfSentMessageId);
    expect(parsed.reaction).toBe("\uD83D\uDC4D");
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
    const parsed = parseToolResult(result) as { status: string; reaction: null };
    expect(parsed.status).toBe("reaction_removed");
    expect(parsed.reaction).toBeNull();
  });

  // ─── whatsapp_edit_message ─────────────────────────────────────
  it("edits own sent message", async () => {
    expect(sharedState.selfSentMessageId).toBeTruthy();

    const result = await client.callTool({
      name: "whatsapp_edit_message",
      arguments: {
        chatId: SELF_CHAT_ID,
        messageId: sharedState.selfSentMessageId!,
        text: `Edited message ${marker}`,
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseToolResult(result) as {
      status: string;
      chatId: string;
      messageId: string;
    };
    expect(parsed.status).toBe("edited");
    expect(parsed.chatId).toBe(SELF_CHAT_ID);
    expect(parsed.messageId).toBe(sharedState.selfSentMessageId);
  });

  // ─── whatsapp_forward_message ──────────────────────────────────
  it("forwards a fresh message to self chat", async () => {
    // Send a fresh message to forward (edited messages can't be forwarded)
    const sendResult = await client.callTool({
      name: "whatsapp_send_text",
      arguments: {
        chatId: SELF_CHAT_ID,
        text: `Forward source ${marker}`,
      },
    });
    expect(sendResult.isError).toBeFalsy();
    const sent = parseToolResult(sendResult) as { messageId: string };

    await new Promise((r) => setTimeout(r, 500));

    const result = await client.callTool({
      name: "whatsapp_forward_message",
      arguments: {
        chatId: SELF_CHAT_ID,
        messageId: sent.messageId,
      },
    });

    if (result.isError) {
      // Backend may return 502 for forward to self-chat — known WAHA limitation
      const content = result.content as Array<{ type: string; text: string }>;
      const errorText = content[0].text;
      expect(errorText).toMatch(/API|WAHA|error/i);
      console.warn("Forward to self-chat not supported by backend:", errorText);
      return;
    }

    const parsed = parseToolResult(result) as {
      status: string;
      messageId: string;
      destinationChatId: string;
      originalMessageId: string;
      timestamp: string;
    };
    expect(parsed.status).toBe("forwarded");
    expect(parsed.messageId).toBeTruthy();
    expect(parsed.destinationChatId).toBe(SELF_CHAT_ID);
    expect(parsed.originalMessageId).toBe(sent.messageId);
    expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();
  });

  // ─── whatsapp_delete_message ───────────────────────────────────
  it("deletes the reply message", async () => {
    expect(sharedState.selfReplyMessageId).toBeTruthy();

    const result = await client.callTool({
      name: "whatsapp_delete_message",
      arguments: {
        chatId: SELF_CHAT_ID,
        messageId: sharedState.selfReplyMessageId!,
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseToolResult(result) as {
      status: string;
      chatId: string;
      messageId: string;
    };
    expect(parsed.status).toBe("deleted");
    expect(parsed.chatId).toBe(SELF_CHAT_ID);
    expect(parsed.messageId).toBe(sharedState.selfReplyMessageId);
  });

  // ─── whatsapp_read_messages with markAsRead ────────────────────
  it("markAsRead=true does not error", async () => {
    const result = await client.callTool({
      name: "whatsapp_read_messages",
      arguments: { chatId: SELF_CHAT_ID, limit: 1, markAsRead: true },
    });
    expect(result.isError).toBeFalsy();
  });
});
