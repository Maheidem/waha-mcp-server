import { DEFAULT_API_URL, DEFAULT_SESSION, DEFAULT_SEND_DELAY_MS } from "../constants.js";
import type { WahaConfig, TranscriptionConfig } from "../types.js";

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

  // Transcription is optional — only configure if API key is provided
  let transcription: TranscriptionConfig | undefined;
  const transcriptionApiKey = process.env.WAHA_TRANSCRIPTION_API_KEY;
  if (transcriptionApiKey) {
    transcription = {
      url: (process.env.WAHA_TRANSCRIPTION_URL || "https://api.openai.com/v1/audio/transcriptions").replace(/\/+$/, ""),
      apiKey: transcriptionApiKey,
      model: process.env.WAHA_TRANSCRIPTION_MODEL || "whisper-1",
      language: process.env.WAHA_TRANSCRIPTION_LANGUAGE || undefined,
    };
  }

  return { apiUrl, apiKey, session, sendDelayMs, transcription };
}
