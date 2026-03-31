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
  const session = process.env.WAHA_SESSION || DEFAULT_SESSION;
  const sendDelayMs = parseInt(process.env.WAHA_SEND_DELAY_MS || "", 10) || DEFAULT_SEND_DELAY_MS;

  return { apiUrl, apiKey, session, sendDelayMs };
}
