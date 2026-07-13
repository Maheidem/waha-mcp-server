import axios, {
  type AxiosAdapter,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiClient } from "../../services/api-client.js";
import { createServer as createMcpServer } from "../../server.js";

export interface CapturedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  apiKey?: string;
}

const SETTINGS = {
  capture_enabled: false,
  analyze_images: false,
  analyze_documents: false,
  whatsapp_reply_enabled: false,
  archive_mode: "off",
  fixed_nextcloud_folder_id: null,
  include_media_in_recap: false,
  archive_confirmation_enabled: false,
  allow_sensitive_processing: false,
  ask_on_review: false,
};

function response(
  config: AxiosRequestConfig,
  data: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
  status = 200,
): AxiosResponse {
  return {
    data,
    status,
    statusText: status < 400 ? "OK" : "Error",
    headers,
    config: config as AxiosResponse["config"],
  };
}

function parsedBody(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

export async function createBackendFixture() {
  const requests: CapturedRequest[] = [];

  const adapter: AxiosAdapter = async (config) => {
    const url = new URL(axios.getUri(config));
    const path = decodeURIComponent(url.pathname);
    const method = (config.method ?? "get").toUpperCase();
    const body = parsedBody(config.data);
    const apiKey = typeof config.headers?.get === "function"
      ? String(config.headers.get("X-API-Key") ?? "")
      : String((config.headers as Record<string, unknown> | undefined)?.["X-API-Key"] ?? "");
    requests.push({ method, path, query: url.searchParams, body, apiKey });

    if (method === "GET" && path === "/api/health") {
      return response(config, { status: "ok", database: true, waha_live: true });
    }
    if (method === "GET" && path === "/api/listener/health") {
      return response(config, { connected: true, events_total: 12, replies_sent: 3 });
    }
    if (method === "GET" && path === "/api/media/health") {
      return response(config, {
        worker: { worker_id: "worker-1", last_beat_age_seconds: 1, healthy: true },
        jobs: { completed: 9 },
        flags: { media_pipeline: true },
      });
    }
    if (method === "GET" && path === "/api/worker/health") {
      return response(config, { worker: { worker_id: "worker-1" }, healthy: true, queue: [] });
    }

    if (method === "GET" && path === "/api/auto-replies") {
      return response(config, {
        contacts: [{
          phone: "5524999999999",
          display_name: "Person",
          person_name: "Person",
          push_name: null,
        }],
        groups: [{ jid: "120363000000@g.us", display_name: "Group" }],
      });
    }
    if (path.endsWith("/auto-reply")) {
      const id = path.split("/").at(-2) ?? "";
      if (method === "PUT") {
        const contextual = Boolean((body as Record<string, unknown> | undefined)?.contextual);
        return response(config, {
          status: "ok",
          kind: id.endsWith("@g.us") ? "group" : "person",
          id,
          ...(id.endsWith("@g.us") ? {} : { phone: id }),
          enabled: true,
          contextual,
        });
      }
      if (method === "DELETE") {
        return response(config, { status: "ok", id, enabled: false });
      }
      return response(config, { id, found: true, enabled: true });
    }

    if (path.endsWith("/media-settings")) {
      const id = path.split("/").at(-2) ?? "";
      if (method === "PUT") {
        return response(config, {
          status: "ok",
          scope_type: id.endsWith("@g.us") ? "chat" : "phone",
          scope_id: id,
          settings: { ...SETTINGS, ...(body as object) },
          warnings: [],
        });
      }
      if (method === "DELETE") {
        return response(config, {
          status: "ok",
          scope_type: id.endsWith("@g.us") ? "chat" : "phone",
          scope_id: id,
          found: true,
          settings: SETTINGS,
        });
      }
      return response(config, {
        scope_type: id.endsWith("@g.us") ? "chat" : "phone",
        scope_id: id,
        found: false,
        settings: SETTINGS,
        warnings: [],
      });
    }

    if (method === "GET" && path === "/api/contacts") {
      return response(config, {
        contacts: [
          {
            kind: "person",
            id: "5524999999999",
            phone: "5524999999999",
            display_name: "Person",
            message_count: 7,
          },
          {
            kind: "person",
            id: "import_1234567890abcdef",
            phone: "import_1234567890abcdef",
            display_name: "Imported Sender",
            message_count: 2,
          },
          {
            kind: "group",
            id: "120363000000@g.us",
            display_name: "Group",
            message_count: 4,
            member_count: 3,
          },
        ],
      });
    }

    if (method === "GET" && path === "/api/messages/media_message") {
      return response(config, {
        id: "media_message",
        media_url: "http://localhost:3000/api/files/default/fake-oga.oga",
      });
    }
    if (method === "GET" && path === "/api/media/default/fake-oga.oga") {
      return response(config, Buffer.from([0x4f, 0x67, 0x67, 0x53]), {
        "content-type": "audio/ogg",
      });
    }
    if (method === "GET" && path === "/api/messages") {
      return response(config, {
        messages: [{
          id: "message-1",
          chat_jid: "5524999999999@c.us",
          timestamp: "2026-07-13T12:00:00+00:00",
          body: "raw transcript",
          body_contextual: "clean transcript",
          context_note: "corrected a proper noun",
          message_type: "audio",
          from_me: false,
          has_media: true,
          media_mimetype: "audio/ogg",
          ack: 1,
          is_revoked: false,
          is_edited: false,
          sender_name: "Person",
          sender_jid: "5524999999999@c.us",
        }],
        total: 1,
        has_more: false,
      });
    }
    if (method === "POST" && path.endsWith("/messages/read")) {
      return response(config, { success: true });
    }
    if (method === "POST" && path === "/api/transcribe") {
      return response(config, { text: "olá mundo", source: "transcribed" });
    }
    if (method === "POST" && path === "/api/tts") {
      return response(config, Buffer.from([0x49, 0x44, 0x33]), {
        "content-type": "audio/mpeg",
      });
    }
    if (method === "POST" && path === "/api/messages/import") {
      return response(config, {
        status: "ok",
        chat_name: "Imported chat",
        chat_jid: "import_1234567890abcdef@import",
        total_parsed: 5,
        inserted: 4,
        skipped_duplicates: 1,
        phones_created: 2,
        senders: ["A", "B"],
      });
    }
    if (method === "POST" && path === "/api/messages/send") {
      return response(config, {
        id: { _serialized: "nested-message-id" },
        timestamp: 1_789_000_000,
      });
    }
    if (method === "POST" && path === "/api/messages/forward") {
      return response(config, { _data: { key: { id: "forwarded-message-id" } } });
    }

    return response(config, { detail: `Unhandled ${method} ${path}` }, undefined, 404);
  };

  const config = {
    apiUrl: "http://fixture.invalid/api",
    apiKey: "fixture-key",
    session: "default",
    sendDelayMs: 0,
  };
  const api = new ApiClient(config, adapter);
  const mcpServer = createMcpServer(config, api);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await mcpServer.connect(serverTransport);
  const client = new Client(
    { name: "unit-test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(clientTransport);

  return {
    client,
    requests,
    async cleanup() {
      await client.close();
      await mcpServer.close();
    },
  };
}

export function parseTextResult(result: { content?: unknown }): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Tool result had no text content");
  return JSON.parse(text) as Record<string, unknown>;
}
