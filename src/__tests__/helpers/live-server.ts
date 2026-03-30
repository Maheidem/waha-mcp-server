import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import type { WahaConfig } from "../../types.js";

// ─── Test contacts ──────────────────────────────────────────────────
export const SELF_CHAT_ID = "5524992272331@c.us";
export const MARIANA_CHAT_ID = "5524992790596@c.us";
export const SELF_PHONE = "5524992272331";
export const SELF_PUSH_NAME = "Marcos Heidemann";

// ─── Shared state for cross-test data passing ───────────────────────
export interface TestState {
  selfSentMessageId?: string;
  selfReplyMessageId?: string;
  marianaSentMessageId?: string;
  latestMarianaMessageId?: string;
}

export const sharedState: TestState = {};

// ─── Server lifecycle ───────────────────────────────────────────────
export interface LiveServer {
  client: Client;
  cleanup: () => Promise<void>;
}

export function loadTestConfig(): WahaConfig {
  const apiUrl = process.env.WAHA_API_URL;
  const apiKey = process.env.WAHA_API_KEY;
  if (!apiUrl || !apiKey) {
    throw new Error(
      "Integration tests require WAHA_API_URL and WAHA_API_KEY environment variables"
    );
  }
  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    apiKey,
    session: process.env.WAHA_SESSION || "default",
    sendDelayMs: 100, // Faster for tests (still safe with small test volume)
  };
}

export async function createLiveServer(): Promise<LiveServer> {
  const config = loadTestConfig();
  const server = createServer(config);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: "waha-integration-test", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(clientTransport);

  const cleanup = async () => {
    await client.close();
    await server.close();
  };

  return { client, cleanup };
}

// ─── Result parsing helpers ─────────────────────────────────────────
export function parseToolResult(result: { content?: unknown }): unknown {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text);
}

export function getToolText(result: { content?: unknown }): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0].text;
}

/**
 * Generate a unique test marker for identifying test messages.
 */
export function testMarker(): string {
  return `[WAHA-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}]`;
}
