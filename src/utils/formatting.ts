/**
 * Convert a Unix timestamp (seconds) to ISO 8601 string.
 */
export function formatTimestamp(ts: number): string {
  if (!ts || ts <= 0) return "unknown";
  // WAHA timestamps are in seconds
  return new Date(ts * 1000).toISOString();
}

/**
 * Extract a display-friendly name from a chat ID.
 * "5511999999999@c.us" → "5511999999999"
 * "120363123456@g.us" → "120363123456 (group)"
 */
export function formatChatId(chatId: string): string {
  if (chatId.endsWith("@g.us")) {
    return chatId.replace("@g.us", "") + " (group)";
  }
  return chatId.replace("@c.us", "");
}

/**
 * Extract the message body/text from a WAHA message.
 * Handles text, vCards, and other types gracefully.
 */
export function extractMessageBody(msg: {
  body?: string;
  vCards?: string[];
  hasMedia: boolean;
  type?: string;
}): string {
  if (msg.body) return msg.body;
  if (msg.vCards && msg.vCards.length > 0) return "[Contact card]";
  if (msg.hasMedia) return `[Media: ${msg.type || "file"}]`;
  return "[No text content]";
}

/**
 * Strip the verbose _data field from messages to save context window.
 */
export function stripMessageData<T extends { _data?: unknown }>(msg: T): Omit<T, "_data"> {
  const { _data, ...clean } = msg;
  return clean;
}
