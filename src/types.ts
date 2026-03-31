/** Config loaded from environment variables */
export interface WahaConfig {
  apiUrl: string;
  apiKey: string;
  session: string;
  sendDelayMs: number;
}

// Store types are co-located with ApiClient in services/api-client.ts.
// Re-export for convenience if needed externally.
export type {
  StoreMessage,
  StoreMessageSearchResult,
  StoreContact,
  StoreContactDetail,
  StoreContactGraph,
  StoreChat,
  StoreChatDetail,
  StoreChatSummary,
  StoreStats,
} from "./services/api-client.js";
