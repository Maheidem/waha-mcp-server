import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createLiveServer,
  parseToolResult,
  getToolText,
  SELF_CHAT_ID,
  type LiveServer,
} from "../helpers/live-server.js";

/**
 * Message Store integration tests (Level 1 — read-only).
 *
 * These test the 4 new tools backed by the Message Store API (:8200):
 *   - whatsapp_search_messages
 *   - whatsapp_contact_graph
 *   - whatsapp_chat_summary
 *   - whatsapp_stats
 *
 * Requires: WAHA_STORE_URL and WAHA_STORE_API_KEY env vars.
 * Skips gracefully when the Message Store is not configured.
 */

const storeConfigured = !!(process.env.WAHA_STORE_URL && process.env.WAHA_STORE_API_KEY);
const describeStore = storeConfigured ? describe : describe.skip;

describeStore("Message Store Tools", () => {
  let env: LiveServer;
  let client: Client;

  beforeAll(async () => {
    env = await createLiveServer();
    client = env.client;
  });

  afterAll(async () => {
    await env.cleanup();
  });

  // ─── whatsapp_search_messages ──────────────────────────────────

  describe("whatsapp_search_messages", () => {
    it("returns results for a common search term", async () => {
      const result = await client.callTool({
        name: "whatsapp_search_messages",
        arguments: { search: "oi" },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        messages: unknown[];
        total: number;
        hasMore: boolean;
        count: number;
        offset: number;
      };
      expect(parsed.total).toBeGreaterThan(0);
      expect(parsed.messages.length).toBeGreaterThan(0);
      expect(typeof parsed.hasMore).toBe("boolean");
      expect(parsed.offset).toBe(0);
    });

    it("each message has required fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_search_messages",
        arguments: { search: "oi", limit: 3 },
      });
      const parsed = parseToolResult(result) as {
        messages: Array<{
          id: string;
          chatJid: string;
          body: string;
          timestamp: string;
          messageType: string;
          fromMe: boolean;
        }>;
      };
      for (const msg of parsed.messages) {
        expect(typeof msg.id).toBe("string");
        expect(msg.id.length).toBeGreaterThan(0);
        expect(typeof msg.chatJid).toBe("string");
        expect(typeof msg.body).toBe("string");
        expect(typeof msg.timestamp).toBe("string");
        expect(typeof msg.messageType).toBe("string");
        expect(typeof msg.fromMe).toBe("boolean");
      }
    });

    it("limit parameter restricts result count", async () => {
      const result = await client.callTool({
        name: "whatsapp_search_messages",
        arguments: { search: "oi", limit: 2 },
      });
      const parsed = parseToolResult(result) as { messages: unknown[]; count: number };
      expect(parsed.messages.length).toBeLessThanOrEqual(2);
      expect(parsed.count).toBeLessThanOrEqual(2);
    });

    it("pagination via offset returns different messages", async () => {
      const r1 = await client.callTool({
        name: "whatsapp_search_messages",
        arguments: { search: "oi", limit: 1, offset: 0 },
      });
      const r2 = await client.callTool({
        name: "whatsapp_search_messages",
        arguments: { search: "oi", limit: 1, offset: 1 },
      });
      const p1 = parseToolResult(r1) as { messages: Array<{ id: string }> };
      const p2 = parseToolResult(r2) as { messages: Array<{ id: string }> };
      if (p1.messages.length > 0 && p2.messages.length > 0) {
        expect(p1.messages[0].id).not.toBe(p2.messages[0].id);
      }
    });

    it("chatId filter scopes to a specific chat", async () => {
      const result = await client.callTool({
        name: "whatsapp_search_messages",
        arguments: { search: "test", chatId: SELF_CHAT_ID, limit: 5 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        messages: Array<{ chatJid: string }>;
      };
      for (const msg of parsed.messages) {
        expect(msg.chatJid).toBe(SELF_CHAT_ID);
      }
    });

    it("no results for gibberish search returns empty array", async () => {
      const result = await client.callTool({
        name: "whatsapp_search_messages",
        arguments: { search: "xyzzy_nonexistent_zqwv_99999" },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as { messages: unknown[]; total: number };
      expect(parsed.messages).toHaveLength(0);
      expect(parsed.total).toBe(0);
    });

    it("fromMe filter works", async () => {
      const result = await client.callTool({
        name: "whatsapp_search_messages",
        arguments: { search: "test", fromMe: true, limit: 5 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        messages: Array<{ fromMe: boolean }>;
      };
      for (const msg of parsed.messages) {
        expect(msg.fromMe).toBe(true);
      }
    });
  });

  // ─── whatsapp_contact_graph ────────────────────────────────────

  describe("whatsapp_contact_graph", () => {
    it("returns graph for contact ID 1", async () => {
      const result = await client.callTool({
        name: "whatsapp_contact_graph",
        arguments: { contactId: 1 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        contact: { id: number; name: string; jid: string };
        sharedGroups: unknown[];
        connections: unknown[];
      };
      expect(parsed.contact).toBeDefined();
      expect(typeof parsed.contact.id).toBe("number");
      expect(typeof parsed.contact.jid).toBe("string");
      expect(Array.isArray(parsed.sharedGroups)).toBe(true);
      expect(Array.isArray(parsed.connections)).toBe(true);
    });

    it("contact has expected detail fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_contact_graph",
        arguments: { contactId: 1 },
      });
      const parsed = parseToolResult(result) as {
        contact: {
          id: number;
          name: string;
          jid: string;
          phone: string | null;
          firstSeen: string;
          lastSeen: string;
        };
      };
      expect(parsed.contact.id).toBe(1);
      expect(typeof parsed.contact.firstSeen).toBe("string");
      expect(typeof parsed.contact.lastSeen).toBe("string");
    });

    it("shared groups have required fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_contact_graph",
        arguments: { contactId: 1 },
      });
      const parsed = parseToolResult(result) as {
        sharedGroups: Array<{
          jid: string;
          name: string;
          type: string;
          messageCount: number;
        }>;
      };
      for (const group of parsed.sharedGroups) {
        expect(typeof group.jid).toBe("string");
        expect(typeof group.type).toBe("string");
        expect(typeof group.messageCount).toBe("number");
      }
    });

    it("connections have required fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_contact_graph",
        arguments: { contactId: 1 },
      });
      const parsed = parseToolResult(result) as {
        connections: Array<{
          id: number;
          name: string;
          jid: string;
          sharedGroups: number;
        }>;
      };
      for (const conn of parsed.connections) {
        expect(typeof conn.id).toBe("number");
        expect(typeof conn.jid).toBe("string");
        expect(typeof conn.sharedGroups).toBe("number");
      }
    });

    it("invalid contact ID returns error", async () => {
      const result = await client.callTool({
        name: "whatsapp_contact_graph",
        arguments: { contactId: 999999 },
      });
      expect(result.isError).toBeTruthy();
    });
  });

  // ─── whatsapp_chat_summary ─────────────────────────────────────

  describe("whatsapp_chat_summary", () => {
    // Self-chat doesn't exist in the Store (not captured via webhooks).
    // Discover a valid chat JID from stats topChats before testing.
    let storeChatJid: string;

    beforeAll(async () => {
      const statsResult = await client.callTool({
        name: "whatsapp_stats",
        arguments: {},
      });
      const stats = parseToolResult(statsResult) as {
        topChats: Array<{ jid: string; messageCount: number }>;
      };
      expect(stats.topChats.length).toBeGreaterThan(0);
      storeChatJid = stats.topChats[0].jid;
    });

    it("returns summary for a known chat", async () => {
      const result = await client.callTool({
        name: "whatsapp_chat_summary",
        arguments: { chatId: storeChatJid },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        chat: {
          jid: string;
          name: string;
          type: string;
          messageCount: number;
        };
        messages: unknown[];
        count: number;
      };
      expect(parsed.chat.jid).toBe(storeChatJid);
      expect(typeof parsed.chat.type).toBe("string");
      expect(typeof parsed.chat.messageCount).toBe("number");
      expect(parsed.messages.length).toBeGreaterThan(0);
      expect(parsed.count).toBeGreaterThan(0);
    });

    it("chat detail has date range fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_chat_summary",
        arguments: { chatId: storeChatJid },
      });
      const parsed = parseToolResult(result) as {
        chat: {
          firstMessage: string | null;
          lastMessage: string | null;
        };
      };
      // At least one should be non-null if there are messages
      expect(
        parsed.chat.firstMessage !== null || parsed.chat.lastMessage !== null
      ).toBe(true);
    });

    it("each message has sender, body, timestamp, and type", async () => {
      const result = await client.callTool({
        name: "whatsapp_chat_summary",
        arguments: { chatId: storeChatJid, limit: 5 },
      });
      const parsed = parseToolResult(result) as {
        messages: Array<{
          sender: string;
          body: string | null;
          timestamp: string;
          type: string;
          hasMedia: boolean;
        }>;
      };
      for (const msg of parsed.messages) {
        expect(typeof msg.sender).toBe("string");
        expect(typeof msg.timestamp).toBe("string");
        expect(typeof msg.type).toBe("string");
        expect(typeof msg.hasMedia).toBe("boolean");
      }
    });

    it("limit parameter restricts message count", async () => {
      const result = await client.callTool({
        name: "whatsapp_chat_summary",
        arguments: { chatId: storeChatJid, limit: 3 },
      });
      const parsed = parseToolResult(result) as { messages: unknown[]; count: number };
      expect(parsed.messages.length).toBeLessThanOrEqual(3);
      expect(parsed.count).toBeLessThanOrEqual(3);
    });

    it("invalid chat JID returns error", async () => {
      const result = await client.callTool({
        name: "whatsapp_chat_summary",
        arguments: { chatId: "0000000000@c.us" },
      });
      expect(result.isError).toBeTruthy();
    });
  });

  // ─── whatsapp_stats ────────────────────────────────────────────

  describe("whatsapp_stats", () => {
    it("returns valid stats overview", async () => {
      const result = await client.callTool({
        name: "whatsapp_stats",
        arguments: {},
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        totals: {
          messages: number;
          contacts: number;
          chats: number;
          groups: number;
          dms: number;
        };
        activity: {
          messagesToday: number;
          messagesThisWeek: number;
        };
        topChats: unknown[];
        topContacts: unknown[];
      };
      // Totals should be positive numbers
      expect(parsed.totals.messages).toBeGreaterThan(0);
      expect(parsed.totals.contacts).toBeGreaterThan(0);
      expect(parsed.totals.chats).toBeGreaterThan(0);
      // groups + dms should equal total chats
      expect(parsed.totals.groups + parsed.totals.dms).toBe(parsed.totals.chats);
    });

    it("activity counts are non-negative numbers", async () => {
      const result = await client.callTool({
        name: "whatsapp_stats",
        arguments: {},
      });
      const parsed = parseToolResult(result) as {
        activity: {
          messagesToday: number;
          messagesThisWeek: number;
        };
      };
      expect(parsed.activity.messagesToday).toBeGreaterThanOrEqual(0);
      expect(parsed.activity.messagesThisWeek).toBeGreaterThanOrEqual(0);
    });

    it("topChats entries have required fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_stats",
        arguments: {},
      });
      const parsed = parseToolResult(result) as {
        topChats: Array<{
          jid: string;
          type: string;
          messageCount: number;
          lastMessage: string;
        }>;
      };
      expect(parsed.topChats.length).toBeGreaterThan(0);
      for (const chat of parsed.topChats) {
        expect(typeof chat.jid).toBe("string");
        expect(typeof chat.type).toBe("string");
        expect(typeof chat.messageCount).toBe("number");
        expect(chat.messageCount).toBeGreaterThan(0);
      }
    });

    it("topContacts entries have required fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_stats",
        arguments: {},
      });
      const parsed = parseToolResult(result) as {
        topContacts: Array<{
          name: string;
          jid: string;
          messageCount: number;
        }>;
      };
      expect(parsed.topContacts.length).toBeGreaterThan(0);
      for (const contact of parsed.topContacts) {
        expect(typeof contact.jid).toBe("string");
        expect(typeof contact.messageCount).toBe("number");
        expect(contact.messageCount).toBeGreaterThan(0);
      }
    });
  });
});
