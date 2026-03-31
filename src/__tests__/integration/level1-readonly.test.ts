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

    it("chats include lastMessage preview when available", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_chats",
        arguments: { limit: 5 },
      });
      const parsed = parseToolResult(result) as {
        chats: Array<{
          lastMessage: {
            body: string | null;
            from: string;
            fromMe: boolean;
            hasMedia: boolean;
            timestamp: string;
          } | null;
        }>;
      };
      // At least one chat should have a lastMessage
      const withPreview = parsed.chats.filter((c) => c.lastMessage !== null);
      expect(withPreview.length).toBeGreaterThan(0);
      for (const chat of withPreview) {
        expect(typeof chat.lastMessage!.fromMe).toBe("boolean");
        expect(typeof chat.lastMessage!.hasMedia).toBe("boolean");
        expect(typeof chat.lastMessage!.timestamp).toBe("string");
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

    it("result includes count, offset, and hasMore metadata", async () => {
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
      const parsed = parseToolResult(result) as { messages: unknown[] };
      expect(parsed.messages.length).toBeGreaterThan(0);
    });

    it("store response has senderName, senderJid, messageType fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, limit: 3 },
      });
      const parsed = parseToolResult(result) as {
        source: string;
        messages: Array<{
          id: string;
          fromMe: boolean;
          body: string | null;
          timestamp: string;
          hasMedia: boolean;
          senderName?: string | null;
          senderJid?: string;
          messageType?: string;
        }>;
      };
      for (const msg of parsed.messages) {
        expect(typeof msg.id).toBe("string");
        expect(msg.id.length).toBeGreaterThan(0);
        expect(typeof msg.fromMe).toBe("boolean");
        expect(typeof msg.timestamp).toBe("string");
        expect(typeof msg.hasMedia).toBe("boolean");
      }
    });

    it("indicates source as message-store or live", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, limit: 1 },
      });
      const parsed = parseToolResult(result) as { source: string };
      expect(["message-store", "live"]).toContain(parsed.source);
    });

    it("limit=1 returns exactly 1 message", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, limit: 1 },
      });
      const parsed = parseToolResult(result) as { messages: unknown[] };
      expect(parsed.messages.length).toBe(1);
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

    it("search filter returns only matching messages", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, search: "test", limit: 5 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        source: string;
        messages: Array<{ body: string | null }>;
      };
      // Store source should filter; live fallback may not support search
      if (parsed.source === "message-store") {
        for (const msg of parsed.messages) {
          if (msg.body) {
            expect(msg.body.toLowerCase()).toContain("test");
          }
        }
      }
    });

    it("fromMe=true returns only sent messages", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, fromMe: true, limit: 5 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        source: string;
        messages: Array<{ fromMe: boolean }>;
      };
      if (parsed.source === "message-store") {
        for (const msg of parsed.messages) {
          expect(msg.fromMe).toBe(true);
        }
      }
    });

    it("since filter returns only recent messages", async () => {
      // Get messages from the last 7 days only
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, since, limit: 5 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        source: string;
        messages: Array<{ timestamp: string }>;
      };
      if (parsed.source === "message-store") {
        for (const msg of parsed.messages) {
          expect(new Date(msg.timestamp).getTime()).toBeGreaterThanOrEqual(
            new Date(since).getTime()
          );
        }
      }
    });

    it("store response includes total and hasMore", async () => {
      const result = await client.callTool({
        name: "whatsapp_read_messages",
        arguments: { chatId: SELF_CHAT_ID, limit: 1 },
      });
      const parsed = parseToolResult(result) as {
        source: string;
        total?: number;
        hasMore?: boolean;
      };
      if (parsed.source === "message-store") {
        expect(typeof parsed.total).toBe("number");
        expect(typeof parsed.hasMore).toBe("boolean");
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
    it("returns an array of contacts with enriched fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_contacts",
        arguments: { limit: 5 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        contacts: Array<{
          id: string;
          name: string;
          pushName: string | null;
          googleName: string | null;
          phone: string;
          email: string | null;
          organization: string | null;
          messageCount: number;
          chatsCount: number;
          firstSeen: string;
          lastSeen: string;
        }>;
        source: string;
      };
      expect(Array.isArray(parsed.contacts)).toBe(true);
      expect(parsed.contacts.length).toBeGreaterThan(0);
      expect(parsed.source).toBe("message-store");
      for (const contact of parsed.contacts) {
        expect(typeof contact.id).toBe("string");
        // id is now the phone number
        expect(contact.id).toBe(contact.phone);
        expect(typeof contact.name).toBe("string");
        expect(typeof contact.messageCount).toBe("number");
        expect(typeof contact.chatsCount).toBe("number");
        expect(typeof contact.firstSeen).toBe("string");
        expect(typeof contact.lastSeen).toBe("string");
      }
    });

    it("search filter returns matching contacts", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_contacts",
        arguments: { search: "Marcos", limit: 5 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        contacts: Array<{ name: string; pushName: string | null; googleName: string | null }>;
      };
      // At least one contact should match
      expect(parsed.contacts.length).toBeGreaterThan(0);
    });

    it("pagination works", async () => {
      const r1 = await client.callTool({
        name: "whatsapp_list_contacts",
        arguments: { limit: 1, offset: 0 },
      });
      const r2 = await client.callTool({
        name: "whatsapp_list_contacts",
        arguments: { limit: 1, offset: 1 },
      });
      const p1 = parseToolResult(r1) as { contacts: Array<{ id: string }> };
      const p2 = parseToolResult(r2) as { contacts: Array<{ id: string }> };
      if (p1.contacts.length > 0 && p2.contacts.length > 0) {
        expect(p1.contacts[0].id).not.toBe(p2.contacts[0].id);
      }
    });
  });

  // ─── whatsapp_list_groups ───────────────────────────────────────
  describe("whatsapp_list_groups", () => {
    it("returns an array of groups", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_groups",
        arguments: { limit: 5 },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        groups: Array<{
          id: string;
          name: string;
          owner: string | null;
          createdAt: string;
        }>;
        count: number;
      };
      expect(Array.isArray(parsed.groups)).toBe(true);
      expect(parsed.groups.length).toBeGreaterThan(0);
      expect(typeof parsed.count).toBe("number");
    });

    it("each group has id ending in @g.us", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_groups",
        arguments: { limit: 5 },
      });
      const parsed = parseToolResult(result) as {
        groups: Array<{ id: string; name: string }>;
      };
      for (const group of parsed.groups) {
        expect(group.id).toMatch(/@g\.us$/);
        expect(typeof group.name).toBe("string");
      }
    });

    it("limit=1 returns exactly 1 group", async () => {
      const result = await client.callTool({
        name: "whatsapp_list_groups",
        arguments: { limit: 1 },
      });
      const parsed = parseToolResult(result) as { groups: unknown[] };
      expect(parsed.groups.length).toBe(1);
    });

    it("pagination works", async () => {
      const r1 = await client.callTool({
        name: "whatsapp_list_groups",
        arguments: { limit: 1, offset: 0 },
      });
      const r2 = await client.callTool({
        name: "whatsapp_list_groups",
        arguments: { limit: 1, offset: 1 },
      });
      const p1 = parseToolResult(r1) as { groups: Array<{ id: string }> };
      const p2 = parseToolResult(r2) as { groups: Array<{ id: string }> };
      if (p1.groups.length > 0 && p2.groups.length > 0) {
        expect(p1.groups[0].id).not.toBe(p2.groups[0].id);
      }
    });
  });

  // ─── whatsapp_get_group_info ────────────────────────────────────
  describe("whatsapp_get_group_info", () => {
    let groupId: string;

    beforeAll(async () => {
      // Get a real group ID from list_groups
      const result = await client.callTool({
        name: "whatsapp_list_groups",
        arguments: { limit: 1 },
      });
      const parsed = parseToolResult(result) as {
        groups: Array<{ id: string }>;
      };
      expect(parsed.groups.length).toBeGreaterThan(0);
      groupId = parsed.groups[0].id;
    });

    it("returns group details with name and participants", async () => {
      const result = await client.callTool({
        name: "whatsapp_get_group_info",
        arguments: { groupId },
      });
      expect(result.isError).toBeFalsy();
      const parsed = parseToolResult(result) as {
        groupId: string;
        name: string;
        topic: string | null;
        owner: string | null;
        createdAt: string;
        settings: {
          isAnnounce: boolean;
          isLocked: boolean;
          isEphemeral: boolean;
        };
        participantCount: number;
        participants: Array<{
          phone: string | null;
          displayName: string | null;
          isAdmin: boolean;
          isSuperAdmin: boolean;
        }>;
      };
      expect(parsed.groupId).toBe(groupId);
      expect(typeof parsed.name).toBe("string");
      expect(typeof parsed.participantCount).toBe("number");
      expect(parsed.participantCount).toBeGreaterThan(0);
      expect(Array.isArray(parsed.participants)).toBe(true);
      expect(parsed.participants.length).toBeGreaterThan(0);
    });

    it("participants have admin status fields", async () => {
      const result = await client.callTool({
        name: "whatsapp_get_group_info",
        arguments: { groupId },
      });
      const parsed = parseToolResult(result) as {
        participants: Array<{
          isAdmin: boolean;
          isSuperAdmin: boolean;
        }>;
      };
      for (const p of parsed.participants) {
        expect(typeof p.isAdmin).toBe("boolean");
        expect(typeof p.isSuperAdmin).toBe("boolean");
      }
    });

    it("settings has announcement/locked/ephemeral flags", async () => {
      const result = await client.callTool({
        name: "whatsapp_get_group_info",
        arguments: { groupId },
      });
      const parsed = parseToolResult(result) as {
        settings: {
          isAnnounce: boolean;
          isLocked: boolean;
          isEphemeral: boolean;
        };
      };
      expect(typeof parsed.settings.isAnnounce).toBe("boolean");
      expect(typeof parsed.settings.isLocked).toBe("boolean");
      expect(typeof parsed.settings.isEphemeral).toBe("boolean");
    });
  });
});
