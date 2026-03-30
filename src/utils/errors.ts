import axios from "axios";
import type { WahaErrorResponse } from "../types.js";

/**
 * Parse WAHA API errors into user-friendly messages.
 */
export function parseWahaError(error: unknown): string {
  console.error("[waha-mcp] Raw error:", error);

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as WahaErrorResponse | undefined;
    const wahaMsg = data?.message || data?.exception?.message || "";

    if (!error.response) {
      const url = error.config?.baseURL || "";
      return `Cannot reach WAHA server at ${url}. Is the container running?`;
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
 * Format an error as an MCP error response.
 */
export function mcpError(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
