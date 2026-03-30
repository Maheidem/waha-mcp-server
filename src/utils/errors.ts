import axios from "axios";
import type { WahaErrorResponse } from "../types.js";

/**
 * Parse WAHA API errors into user-friendly messages.
 */
export function parseWahaError(error: unknown): string {
  console.error("[waha-mcp] Error:", sanitizeForLog(error));

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as WahaErrorResponse | undefined;
    const wahaMsg = data?.message || data?.exception?.message || "";

    if (!error.response) {
      return "Cannot reach WAHA server. Is the container running?";
    }

    switch (status) {
      case 401:
        return "WAHA API key rejected. Check WAHA_API_KEY environment variable.";
      case 404:
        return `Resource not found: ${wahaMsg || "Check the session name or chat ID."}`;
      case 422:
        return `Invalid request: ${wahaMsg}`;
      case 500:
        return `WAHA server error: ${wahaMsg || "Internal error"}`;
      default:
        return `WAHA API error (${status}): ${wahaMsg || error.message}`;
    }
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Unknown error: ${String(error)}`;
}

/**
 * Strip internal details from error before logging.
 * Removes error.config (contains auth headers) and internal IPs.
 */
function sanitizeForLog(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? "no response";
    const msg = (error.response?.data as Record<string, unknown>)?.message ?? error.message;
    return `[${status}] ${msg}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Remove internal IP addresses from user-facing error messages */
function stripInternalIps(message: string): string {
  return message.replace(/\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}(:\d+)?\b/g, "<internal>");
}

/**
 * Parse Message Store API errors into user-friendly messages.
 * Sanitized: no internal IPs, no auth headers in logs.
 */
export function parseStoreError(error: unknown): string {
  console.error("[message-store] Error:", sanitizeForLog(error));

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as Record<string, unknown> | undefined;
    const detail = data?.detail ?? data?.message ?? "";
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail);

    if (!error.response) {
      return "Cannot reach Message Store API. Is it running?";
    }

    switch (status) {
      case 401:
        return "Message Store API key rejected. Check WAHA_STORE_API_KEY.";
      case 404:
        return `Not found: ${stripInternalIps(msg) || "Check the ID or JID."}`;
      case 422:
        return `Invalid request: ${stripInternalIps(msg)}`;
      case 500:
        return `Message Store error: ${stripInternalIps(msg) || "Internal error"}`;
      default:
        return stripInternalIps(`Message Store API error (${status}): ${msg || error.message}`);
    }
  }

  if (error instanceof Error) {
    return stripInternalIps(`Error: ${error.message}`);
  }

  return stripInternalIps(`Unknown error: ${String(error)}`);
}

/**
 * Format an error as an MCP error response.
 */
export function mcpError(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
