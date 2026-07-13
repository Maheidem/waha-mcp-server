import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { ApiClient } from "../../services/api-client.js";
import { parseStoredMediaUrl } from "../../tools/media.js";
import { extractSentMessageId } from "../../tools/messaging.js";
import { loadConfig } from "../../utils/config.js";
import { parseApiError } from "../../utils/errors.js";

describe("configuration and compatibility helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("validates API URLs and accepts an explicit zero send delay", () => {
    vi.stubEnv("WAHA_API_KEY", "key");
    vi.stubEnv("WAHA_API_URL", "http://localhost:8200/api/");
    vi.stubEnv("WAHA_SEND_DELAY_MS", "0");
    expect(loadConfig()).toMatchObject({
      apiUrl: "http://localhost:8200/api",
      sendDelayMs: 0,
    });

    vi.stubEnv("WAHA_API_URL", "file:///tmp/backend");
    expect(() => loadConfig()).toThrow(/http:\/\/ or https:\/\//);
    vi.stubEnv("WAHA_API_URL", "http://localhost:8200/api");
    vi.stubEnv("WAHA_SEND_DELAY_MS", "-1");
    expect(() => loadConfig()).toThrow(/non-negative integer/);
  });

  it("parses stored WAHA media URLs", () => {
    expect(parseStoredMediaUrl(
      "http://localhost:3000/api/files/default/voice%20note.oga?token=x",
    )).toEqual({ session: "default", fileId: "voice note.oga" });
    expect(parseStoredMediaUrl("not a URL")).toBeNull();
  });

  it("normalizes all common WAHA message id shapes", () => {
    expect(extractSentMessageId({ id: "plain" })).toBe("plain");
    expect(extractSentMessageId({ id: { _serialized: "serialized" } })).toBe("serialized");
    expect(extractSentMessageId({ key: { id: "key-id" } })).toBe("key-id");
    expect(extractSentMessageId({ _data: { key: { id: "data-key-id" } } })).toBe("data-key-id");
    expect(extractSentMessageId({ ok: true })).toBeNull();
  });

  it("redacts complete private IP addresses from errors and logs", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new AxiosError(
      "request failed",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status: 502,
        statusText: "Bad Gateway",
        headers: {},
        config: { headers: {} } as never,
        data: { detail: "provider http://10.0.0.1:8000 failed" },
      },
    );
    const message = parseApiError(error);
    expect(message).not.toContain("10.0.0.1");
    expect(message).toContain("<internal>");
    expect(log.mock.calls.flat().join(" ")).not.toContain("10.0.0.1");
  });

  it("serializes concurrent send throttles", async () => {
    const api = new ApiClient({
      apiUrl: "http://localhost:8200/api",
      apiKey: "key",
      session: "default",
      sendDelayMs: 20,
    });
    const times: number[] = [];
    await Promise.all([
      api.throttleSend().then(() => times.push(Date.now())),
      api.throttleSend().then(() => times.push(Date.now())),
      api.throttleSend().then(() => times.push(Date.now())),
    ]);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(15);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(15);
  });
});
