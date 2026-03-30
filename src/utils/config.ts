import { DEFAULT_API_URL, DEFAULT_SESSION, DEFAULT_SEND_DELAY_MS } from "../constants.js";
import type { WahaConfig, TranscriptionConfig, MessageStoreConfig } from "../types.js";

/**
 * Load and validate config from environment variables.
 * Throws immediately if required vars are missing (fail-fast).
 */
export function loadConfig(): WahaConfig {
  const apiKey = process.env.WAHA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "WAHA_API_KEY environment variable is required. " +
      "Set it in your MCP server config or .env file."
    );
  }

  const apiUrl = (process.env.WAHA_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
  const session = process.env.WAHA_SESSION || DEFAULT_SESSION;
  const sendDelayMs = parseInt(process.env.WAHA_SEND_DELAY_MS || "", 10) || DEFAULT_SEND_DELAY_MS;

  // Transcription is optional — activates if URL or API key is set.
  // Defaults to self-hosted Speaches (Whisper) service.
  let transcription: TranscriptionConfig | undefined;
  const transcriptionUrl = process.env.WAHA_TRANSCRIPTION_URL;
  const transcriptionApiKey = process.env.WAHA_TRANSCRIPTION_API_KEY;
  if (transcriptionUrl || transcriptionApiKey) {
    transcription = {
      url: (transcriptionUrl || "http://192.168.31.154:8100/v1/audio/transcriptions").replace(/\/+$/, ""),
      apiKey: transcriptionApiKey || "not-needed",
      model: process.env.WAHA_TRANSCRIPTION_MODEL || "deepdml/faster-whisper-large-v3-turbo-ct2",
      language: process.env.WAHA_TRANSCRIPTION_LANGUAGE || "pt",
    };
  }

  // Message Store is optional — only configure if URL is provided
  let store: MessageStoreConfig | undefined;
  const storeUrl = process.env.WAHA_STORE_URL;
  if (storeUrl) {
    const storeApiKey = process.env.WAHA_STORE_API_KEY;
    if (!storeApiKey) {
      throw new Error(
        "WAHA_STORE_API_KEY is required when WAHA_STORE_URL is set. " +
        "Set it in your MCP server config or .env file."
      );
    }
    store = {
      url: storeUrl.replace(/\/+$/, ""),
      apiKey: storeApiKey,
    };
  }

  return { apiUrl, apiKey, session, sendDelayMs, transcription, store };
}
