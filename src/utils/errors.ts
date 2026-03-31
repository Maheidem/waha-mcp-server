import axios from "axios";

/**
 * Parse API errors into user-friendly messages.
 * Sanitized: no internal IPs, no auth headers in logs.
 */
export function parseApiError(error: unknown): string {
  console.error("[waha-mcp] Error:", sanitizeForLog(error));

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as Record<string, unknown> | undefined;
    const detail = data?.detail ?? data?.message ?? data?.exception ?? "";
    const msg = typeof detail === "string"
      ? detail
      : typeof detail === "object" && detail !== null && "message" in (detail as Record<string, unknown>)
        ? String((detail as Record<string, unknown>).message)
        : JSON.stringify(detail);

    if (!error.response) {
      return "Cannot reach API server. Is the Message Store running?";
    }

    switch (status) {
      case 401:
        return "API key rejected. Check WAHA_API_KEY environment variable.";
      case 404:
        return `Not found: ${stripInternalIps(msg) || "Check the ID or JID."}`;
      case 422:
        return `Invalid request: ${stripInternalIps(msg)}`;
      case 500:
        return `API server error: ${stripInternalIps(msg) || "Internal error"}`;
      default:
        return stripInternalIps(`API error (${status}): ${msg || error.message}`);
    }
  }

  if (error instanceof Error) {
    return stripInternalIps(`Error: ${error.message}`);
  }

  return stripInternalIps(`Unknown error: ${String(error)}`);
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
 * Format an error as an MCP error response.
 */
export function mcpError(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
