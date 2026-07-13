import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import packageJson from "../../../package.json";
import { createBackendFixture, parseTextResult } from "./backend-fixture.js";

describe("current backend contract", () => {
  let fixture: Awaited<ReturnType<typeof createBackendFixture>>;

  beforeAll(async () => {
    fixture = await createBackendFixture();
  });

  afterAll(async () => {
    await fixture?.cleanup();
  });

  it("reports the package version and registers the complete tool surface", async () => {
    expect(fixture.client.getServerVersion()?.version).toBe(packageJson.version);
    const listed = await fixture.client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toHaveLength(28);
    expect(names).toEqual(expect.arrayContaining([
      "whatsapp_auto_reply_status",
      "whatsapp_media_settings_get",
      "whatsapp_media_settings_update",
      "whatsapp_media_settings_disable",
      "whatsapp_automation_health",
      "whatsapp_generate_speech",
    ]));
  });

  it("supports contextual group auto-reply and keeps the legacy phone alias", async () => {
    const enabled = await fixture.client.callTool({
      name: "whatsapp_auto_reply_enable",
      arguments: { contactId: "120363000000@g.us", contextual: true },
    });
    expect(enabled.isError).toBeFalsy();
    expect(parseTextResult(enabled)).toMatchObject({
      contactId: "120363000000@g.us",
      kind: "group",
      enabled: true,
      contextual: true,
    });
    expect(fixture.requests.at(-1)).toMatchObject({
      method: "PUT",
      path: "/api/contacts/120363000000@g.us/auto-reply",
      body: { contextual: true },
      apiKey: "fixture-key",
    });

    const legacy = await fixture.client.callTool({
      name: "whatsapp_auto_reply_status",
      arguments: { phone: "5524999999999" },
    });
    expect(legacy.isError).toBeFalsy();
    expect(parseTextResult(legacy)).toMatchObject({
      contactId: "5524999999999",
      enabled: true,
    });
  });

  it("normalizes people and groups returned by the auto-reply list", async () => {
    const result = await fixture.client.callTool({
      name: "whatsapp_auto_reply_list",
      arguments: {},
    });
    const parsed = parseTextResult(result) as {
      count: number;
      autoReplies: Array<{ kind: string; contactId: string }>;
    };
    expect(parsed.count).toBe(2);
    expect(parsed.autoReplies).toEqual([
      { kind: "person", contactId: "5524999999999", displayName: "Person" },
      { kind: "group", contactId: "120363000000@g.us", displayName: "Group" },
    ]);
  });

  it("maps camelCase media settings to the backend contract", async () => {
    const result = await fixture.client.callTool({
      name: "whatsapp_media_settings_update",
      arguments: {
        contactId: "5524999999999",
        captureEnabled: true,
        archiveMode: "review",
        askOnReview: true,
        fixedNextcloudFolderId: null,
      },
    });
    expect(result.isError).toBeFalsy();
    expect(fixture.requests.at(-1)?.body).toEqual({
      capture_enabled: true,
      archive_mode: "review",
      fixed_nextcloud_folder_id: null,
      ask_on_review: true,
    });
    expect(parseTextResult(result)).toMatchObject({
      scope_type: "phone",
      settings: { capture_enabled: true, archive_mode: "review", ask_on_review: true },
    });

    const empty = await fixture.client.callTool({
      name: "whatsapp_media_settings_update",
      arguments: { contactId: "5524999999999" },
    });
    expect(empty.isError).toBe(true);
  });

  it("combines backend, listener, media, and worker health", async () => {
    const result = await fixture.client.callTool({
      name: "whatsapp_automation_health",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseTextResult(result) as {
      status: string;
      probes: Record<string, { available: boolean }>;
    };
    expect(parsed.status).toBe("healthy");
    expect(Object.keys(parsed.probes)).toEqual(["backend", "listener", "media", "worker"]);
    expect(Object.values(parsed.probes).every((probe) => probe.available)).toBe(true);
  });

  it("surfaces contextual message fields and marks store reads as read", async () => {
    const result = await fixture.client.callTool({
      name: "whatsapp_read_messages",
      arguments: { contactId: "5524999999999", limit: 1, markAsRead: true },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseTextResult(result) as {
      markedAsRead: boolean;
      messages: Array<Record<string, unknown>>;
    };
    expect(parsed.markedAsRead).toBe(true);
    expect(parsed.messages[0]).toMatchObject({
      body: "raw transcript",
      contextualBody: "clean transcript",
      contextNote: "corrected a proper noun",
    });
    expect(fixture.requests.at(-1)).toMatchObject({
      method: "POST",
      path: "/api/chats/5524999999999/messages/read",
    });
  });

  it("does not send live read receipts for imported history", async () => {
    const requestCount = fixture.requests.length;
    const result = await fixture.client.callTool({
      name: "whatsapp_read_messages",
      arguments: {
        contactId: "import_1234567890abcdef@import",
        limit: 1,
        markAsRead: true,
      },
    });
    expect(result.isError).toBeFalsy();
    expect(parseTextResult(result)).toMatchObject({
      source: "message-store",
      markedAsRead: false,
      markAsReadWarning: expect.stringContaining("Imported history"),
    });
    expect(fixture.requests.slice(requestCount).some(
      (request) => request.path.endsWith("/messages/read"),
    )).toBe(false);
  });

  it("filters imported pseudo-contacts that cannot target live tools", async () => {
    const result = await fixture.client.callTool({
      name: "whatsapp_list_contacts",
      arguments: { kind: "all" },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseTextResult(result) as {
      contacts: Array<{ id: string }>;
      historyOnlyExcluded: number;
      hasMore: boolean | null;
    };
    expect(parsed.contacts.map((contact) => contact.id)).toEqual([
      "5524999999999",
      "120363000000@g.us",
    ]);
    expect(parsed.historyOnlyExcluded).toBe(1);
    expect(parsed.hasMore).toBeNull();
  });

  it("resolves media from the stored media_url instead of the message id", async () => {
    const result = await fixture.client.callTool({
      name: "whatsapp_download_media",
      arguments: { contactId: "5524999999999", messageId: "media_message" },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<Record<string, unknown>>;
    expect(content[0]).toMatchObject({ type: "audio", mimeType: "audio/ogg" });
    expect(fixture.requests.at(-1)).toMatchObject({
      method: "GET",
      path: "/api/media/default/fake-oga.oga",
    });
  });

  it("passes transcription language and prompt and reports the backend source", async () => {
    const result = await fixture.client.callTool({
      name: "whatsapp_transcribe_audio",
      arguments: {
        contactId: "5524999999999",
        messageId: "voice-message",
        language: "pt",
        prompt: "Marcos, WAHA",
      },
    });
    expect(result.isError).toBeFalsy();
    expect(fixture.requests.at(-1)?.body).toEqual({
      message_id: "voice-message",
      language: "pt",
      prompt: "Marcos, WAHA",
    });
    expect(parseTextResult(result)).toMatchObject({
      transcription: "olá mundo",
      languageHint: "pt",
      source: "transcribed",
    });
  });

  it("sends requested transcriptions as unquoted follow-ups", async () => {
    const result = await fixture.client.callTool({
      name: "whatsapp_transcribe_audio",
      arguments: {
        contactId: "5524999999999",
        messageId: "voice-message",
        replyWithTranscription: true,
      },
    });
    expect(result.isError).toBeFalsy();
    expect(parseTextResult(result)).toMatchObject({
      replySent: true,
      replyMessageId: "nested-message-id",
    });
    expect(fixture.requests.at(-1)).toMatchObject({
      method: "POST",
      path: "/api/messages/send",
      body: {
        contact_id: "5524999999999",
        session: "default",
      },
    });
    expect(fixture.requests.at(-1)?.body).not.toHaveProperty("reply_to");
  });

  it("returns generated speech as inline audio", async () => {
    const result = await fixture.client.callTool({
      name: "whatsapp_generate_speech",
      arguments: { text: "Olá", voice: "pf_dora", responseFormat: "mp3" },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<Record<string, unknown>>;
    expect(content[0]).toMatchObject({ type: "audio", mimeType: "audio/mpeg" });
    expect(fixture.requests.at(-1)?.body).toEqual({
      text: "Olá",
      voice: "pf_dora",
      response_format: "mp3",
    });
  });

  it("normalizes nested WAHA message ids and refuses unsupported quote sends", async () => {
    const sent = await fixture.client.callTool({
      name: "whatsapp_send_text",
      arguments: { contactId: "5524999999999", text: "hello" },
    });
    expect(parseTextResult(sent)).toMatchObject({
      status: "sent",
      messageId: "nested-message-id",
    });

    const requestCount = fixture.requests.length;
    const quote = await fixture.client.callTool({
      name: "whatsapp_send_text",
      arguments: { contactId: "5524999999999", text: "reply", replyTo: "message-1" },
    });
    expect(quote.isError).toBe(true);
    expect(fixture.requests).toHaveLength(requestCount);
  });

  it("maps the backend phones_created import result", async () => {
    const directory = await mkdtemp(join(tmpdir(), "waha-mcp-test-"));
    const filePath = join(directory, "chat.txt");
    await writeFile(filePath, "[01/01/26, 10:00:00] A: hello\n");
    try {
      const result = await fixture.client.callTool({
        name: "whatsapp_import_chat",
        arguments: { filePath },
      });
      expect(result.isError).toBeFalsy();
      expect(parseTextResult(result)).toMatchObject({
        chatJid: "import_1234567890abcdef@import",
        phonesCreated: 2,
        contactsCreated: 2,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
