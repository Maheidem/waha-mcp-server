import axios, { type AxiosInstance } from "axios";
import type {
  MessageStoreConfig,
  StoreMessageSearchResult,
  StoreContact,
  StoreContactDetail,
  StoreContactGraph,
  StoreChat,
  StoreChatDetail,
  StoreChatSummary,
  StoreStats,
} from "../types.js";

/**
 * HTTP client for the Message Store REST API (:8200).
 * All methods throw on error — callers handle via parseStoreError().
 */
export class MessageStoreClient {
  private readonly http: AxiosInstance;

  constructor(config: MessageStoreConfig) {
    this.http = axios.create({
      baseURL: config.url,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-API-Key": config.apiKey,
      },
    });
  }

  // ── Messages ────────────────────────────────────────────────────

  async searchMessages(params: {
    chat_jid?: string;
    sender?: string;
    search?: string;
    since?: string;
    until?: string;
    type?: string;
    from_me?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<StoreMessageSearchResult> {
    const response = await this.http.get<StoreMessageSearchResult>("/messages", { params });
    return response.data;
  }

  // ── Contacts ────────────────────────────────────────────────────

  async listContacts(params?: {
    search?: string;
    chat_jid?: string;
    limit?: number;
    offset?: number;
  }): Promise<StoreContact[]> {
    const response = await this.http.get<{ contacts: StoreContact[] }>("/contacts", { params });
    return response.data.contacts;
  }

  async getContact(id: number): Promise<StoreContactDetail> {
    const response = await this.http.get<StoreContactDetail>(`/contacts/${id}`);
    return response.data;
  }

  async getContactGraph(id: number): Promise<StoreContactGraph> {
    const response = await this.http.get<StoreContactGraph>(`/contacts/${id}/graph`);
    return response.data;
  }

  // ── Chats ───────────────────────────────────────────────────────

  async listChats(params?: {
    type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<StoreChat[]> {
    const response = await this.http.get<{ chats: StoreChat[] }>("/chats", { params });
    return response.data.chats;
  }

  async getChat(jid: string): Promise<StoreChatDetail> {
    const response = await this.http.get<StoreChatDetail>(`/chats/${jid}`);
    return response.data;
  }

  async getChatSummary(jid: string, limit?: number): Promise<StoreChatSummary> {
    const response = await this.http.get<StoreChatSummary>(`/chats/${jid}/summary`, {
      params: limit ? { limit } : undefined,
    });
    return response.data;
  }

  // ── Stats & Health ──────────────────────────────────────────────

  async getStats(): Promise<StoreStats> {
    const response = await this.http.get<StoreStats>("/stats");
    return response.data;
  }

  async getHealth(): Promise<{ status: string }> {
    const response = await this.http.get<{ status: string }>("/health");
    return response.data;
  }
}
