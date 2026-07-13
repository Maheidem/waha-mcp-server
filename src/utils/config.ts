import { DEFAULT_API_URL, DEFAULT_SESSION, DEFAULT_SEND_DELAY_MS } from "../constants.js";
import type { WahaConfig } from "../types.js";

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
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw new Error("WAHA_API_URL must be a valid http:// or https:// URL.");
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error("WAHA_API_URL must use http:// or https://.");
  }
  const session = process.env.WAHA_SESSION || DEFAULT_SESSION;
  const rawSendDelay = process.env.WAHA_SEND_DELAY_MS;
  const sendDelayMs = rawSendDelay === undefined
    ? DEFAULT_SEND_DELAY_MS
    : Number(rawSendDelay);
  if (!Number.isInteger(sendDelayMs) || sendDelayMs < 0) {
    throw new Error("WAHA_SEND_DELAY_MS must be a non-negative integer.");
  }

  return { apiUrl, apiKey, session, sendDelayMs };
}
