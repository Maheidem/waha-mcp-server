import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createLiveServer,
  parseToolResult,
  SELF_CHAT_ID,
  SELF_PHONE,
  type LiveServer,
} from "../helpers/live-server.js";

describe("Level 1 — Read-only Tools", () => {
  let env: LiveServer;
  let client: Client;

  beforeAll(async () => {
    env = await createLiveServer();
    client = env.client;
  });

  afterAll(async () => {
    await env.cleanup();
  });

  // ─── whatsapp_session_status ────────────────────────────────────
  describe("whatsapp_session_status", () => {
    it("returns WORKING status", async () => {
      const result = await client.callTool({
        name: "whatsapp_session_status",
        arguments: {},
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as Record<string, unknown>;
      expect(parsed.status).toBe("WORKING");
    });

    it("returns the connected phone number", async () => {
      const result = await client.callTool({
        name: "whatsapp_session_status",
        arguments: {},
      });
      const parsed = parseToolResult(result) as Record<string, unknown>;
      expect(parsed.phone).toContain(SELF_PHONE);
    });

    it("returns a valid lastActivity timestamp", async () => {
      const result = await client.callTool({
        name: "whatsapp_session_status",
        arguments: {},
      });
      const parsed = parseToolResult(result) as Record<string, unknown>;
      if (parsed.lastActivity) {
        const date = new Date(parsed.lastActivity as string);
        expect(date.getTime()).not.toBeNaN();
      }
    });
  });

  // ─── whatsapp_account_info ──────────────────────────────────────
  describe("whatsapp_account_info", () => {
    it("returns the known WhatsApp ID", async () => {
      const result = await client.callTool({
        name: "whatsapp_account_info",
        arguments: {},
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as Record<string, unknown>;
      expect(parsed.id).toBe(SELF_CHAT_ID);
    });

    it("returns the known push name", async () => {
      const result = await client.callTool({
        name: "whatsapp_account_info",
        arguments: {},
      });
      const parsed = parseToolResult(result) as Record<string, unknown>;
      expect(parsed.pushName).toContain("Marcos");
    });
  });

  // ─── whatsapp_list_chats ────────────────────────────────────────
  describe("whatsapp_list_chats", () => {
    it("returns a non-empty array of chats", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_chats",
        arguments: {},
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as { chats: unknown[]; count: number };
      expect(parsed.chats.length).toBeGreaterThan(0);
      expect(parsed.count).toBeGreaterThan(0);
    });

    it("each chat has id, name, and lastMessageAt fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_chats",
        arguments: { limit: 5 },
      });
      const parsed = parseToolResult(result) as {
        chats: Array<{ id: string; name: string; lastMessageAt: string }>;
      };
      for (const chat of parsed.chats) {
        expect(typeof chat.id).toBe("string");
        expect(typeof chat.name).toBe("string");
        expect(typeof chat.lastMessageAt).toBe("string");
      }
    });

    it("limit=1 returns exactly 1 chat", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_chats",
        arguments: { limit: 1 },
      });
      const parsed = parseToolResult(result) as { chats: unknown[] };
      expect(parsed.chats.length).toBe(1);
    });

    it("limit=100 returns up to 100 chats", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_chats",
        arguments: { limit: 100 },
      });
      const parsed = parseToolResult(result) as { chats: unknown[] };
      expect(parsed.chats.length).toBeGreaterThan(0);
      expect(parsed.chats.length).toBeLessThanOrEqual(100);
    });

    it("pagination: offset=0 vs offset=1 return different first chats", async () => {
      const r1 = await client.callTool({
        name: "whatsapp_list_chats",
        arguments: { limit: 1, offset: 0 },
      });
      const r2 = await client.callTool({
        name: "whatsapp_list_chats",
        arguments: { limit: 1, offset: 1 },
      });
      const p1 = parseToolResult(r1) as { chats: Array<{ id: string }> };
      const p2 = parseToolResult(r2) as { chats: Array<{ id: string }> };
      expect(p1.chats[0].id).not.toBe(p2.chats[0].id);
    });

    it("result includes count and hasMore metadata", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_chats",
        arguments: { limit: 5 },
      });
      const parsed = parseToolResult(result) as {
        count: number;
        hasMore: boolean;
        offset: number;
      };
      expect(typeof parsed.count).toBe("number");
      expect(typeof parsed.hasMore).toBe("boolean");
      expect(typeof parsed.offset).toBe("number");
    });
  });

  // ─── whatsapp_read_messages ─────────────────────────────────────
  describe("whatsapp_read_messages", () => {
    it("returns messages from self chat", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as { messages: unknown[]; count: number };
      expect(parsed.messages.length).toBeGreaterThan(0);
    });

    it("each message has required fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, limit: 3 },
      });
      const parsed = parseToolResult(result) as {
        messages: Array<{
          id: string;
          from: string;
          fromMe: boolean;
          body: string;
          timestamp: string;
          hasMedia: boolean;
        }>;
      };
      for (const msg of parsed.messages) {
        expect(typeof msg.id).toBe("string");
        expect(msg.id.length).toBeGreaterThan(0);
        expect(typeof msg.from).toBe("string");
        expect(typeof msg.fromMe).toBe("boolean");
        expect(typeof msg.body).toBe("string");
        expect(typeof msg.timestamp).toBe("string");
        expect(typeof msg.hasMedia).toBe("boolean");
      }
    });

    it("limit=1 returns exactly 1 message", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, limit: 1 },
      });
      const parsed = parseToolResult(result) as { messages: unknown[] };
      expect(parsed.messages.length).toBe(1);
    });

    it("downloadMedia=true does not crash", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, limit: 1, downloadMedia: true },
      });
      expect(result.isError).toBeFalsy();
    });

    it("timestamps are valid ISO strings", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, limit: 5 },
      });
      const parsed = parseToolResult(result) as {
        messages: Array<{ timestamp: string }>;
      };
      for (const msg of parsed.messages) {
        if (msg.timestamp !== "unknown") {
          const date = new Date(msg.timestamp);
          expect(date.getTime()).not.toBeNaN();
        }
      }
    });
  });

  // ─── whatsapp_check_number ──────────────────────────────────────
  describe("whatsapp_check_number", () => {
    it("own number exists on WhatsApp", async () => {
      const result = await client.callTool({
        name: "whatsapp_check_number",
        arguments: { phone: SELF_PHONE },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        numberExists: boolean;
        chatId: string;
      };
      expect(parsed.numberExists).toBe(true);
    });
  });

  // ─── whatsapp_list_contacts ─────────────────────────────────────
  describe("whatsapp_list_contacts", () => {
    it("returns an array (may be LID-only on GOWS)", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_contacts",
        arguments: { limit: 5 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        contacts: Array<{ id: string; name: string }>;
      };
      expect(Array.isArray(parsed.contacts)).toBe(true);
      // May be LID-only entries — just verify structure
      for (const contact of parsed.contacts) {
        expect(typeof contact.id).toBe("string");
        expect(typeof contact.name).toBe("string");
      }
    });
  });
});
