import axios, { type AxiosInstance } from "axios";

/**
 * Unified HTTP client for the Message Store API (:8200).
 * All reads come from PostgreSQL, all writes proxy to WAHA.
 * Methods throw on error — callers handle via parseApiError().
 */
export class ApiClient {
  private readonly http: AxiosInstance;
  readonly session: string;
  readonly baseUrl: string;
  private lastSendTime = 0;
  private readonly sendDelayMs: number;

  constructor(config: { apiUrl: string; apiKey: string; session: string; sendDelayMs: number }) {
    this.session = config.session;
    this.baseUrl = config.apiUrl;
    this.sendDelayMs = config.sendDelayMs;

    this.http = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-API-Key": config.apiKey,
      },
    });
  }

  // ── Generic HTTP helpers (for edge cases) ──────────────────────

  async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    const response = await this.http.get<T>(path, { params });
    return response.data;
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const response = await this.http.post<T>(path, body);
    return response.data;
  }

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const response = await this.http.put<T>(path, body);
    return response.data;
  }

  async delete<T>(path: string, params?: Record<string, string>): Promise<T> {
    const response = await this.http.delete<T>(path, { params });
    return response.data;
  }

  // ── Data (from PostgreSQL) ─────────────────────────────────────

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

  async getMessage(id: string): Promise<unknown> {
    const response = await this.http.get(`/messages/${id}`);
    return response.data;
  }

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

  async getChatMembers(jid: string): Promise<unknown> {
    const response = await this.http.get(`/chats/${jid}/members`);
    return response.data;
  }

  async getChatSummary(jid: string, limit?: number): Promise<StoreChatSummary> {
    const response = await this.http.get<StoreChatSummary>(`/chats/${jid}/summary`, {
      params: limit ? { limit } : undefined,
    });
    return response.data;
  }

  async getStats(): Promise<StoreStats> {
    const response = await this.http.get<StoreStats>("/stats");
    return response.data;
  }

  // ── Live Data (proxied to WAHA) ────────────────────────────────

  async listChatsLive(params?: {
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const response = await this.http.get("/chats/live", { params });
    return response.data;
  }

  async readMessagesLive(chatId: string, params?: {
    limit?: number;
    offset?: number;
    downloadMedia?: boolean;
  }): Promise<unknown> {
    const response = await this.http.get(`/chats/${chatId}/messages/live`, { params });
    return response.data;
  }

  async markAsRead(chatId: string): Promise<unknown> {
    const response = await this.http.post(`/chats/${chatId}/messages/read`);
    return response.data;
  }

  async getSessionStatus(): Promise<unknown> {
    const response = await this.http.get("/session/status");
    return response.data;
  }

  async getAccount(): Promise<unknown> {
    const response = await this.http.get("/account");
    return response.data;
  }

  async listContactsLive(params?: {
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const response = await this.http.get("/contacts/all", { params });
    return response.data;
  }

  async checkNumber(phone: string): Promise<{ numberExists: boolean; chatId: string }> {
    const response = await this.http.get<{ numberExists: boolean; chatId: string }>("/contacts/check", {
      params: { phone },
    });
    return response.data;
  }

  async listGroups(params?: {
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const response = await this.http.get("/groups", { params });
    return response.data;
  }

  async getGroupInfo(groupId: string): Promise<unknown> {
    const response = await this.http.get(`/groups/${groupId}`);
    return response.data;
  }

  // ── Actions (proxied to WAHA) ──────────────────────────────────

  async sendText(body: {
    chat_id: string;
    text: string;
    session?: string;
    reply_to?: string;
  }): Promise<{ id: string; timestamp?: number }> {
    const response = await this.http.post<{ id: string; timestamp?: number }>("/messages/send", body);
    return response.data;
  }

  async react(body: {
    message_id: string;
    reaction: string;
    session?: string;
  }): Promise<unknown> {
    const response = await this.http.post("/messages/react", body);
    return response.data;
  }

  async editMessage(body: {
    message_id: string;
    text: string;
    session?: string;
  }): Promise<unknown> {
    const response = await this.http.put("/messages/edit", body);
    return response.data;
  }

  async deleteMessage(id: string, session?: string): Promise<unknown> {
    const response = await this.http.delete(`/messages/${id}`, {
      params: session ? { session } : undefined,
    });
    return response.data;
  }

  async forwardMessage(body: {
    message_id: string;
    chat_id: string;
    session?: string;
  }): Promise<{ id: string; timestamp?: number }> {
    const response = await this.http.post<{ id: string; timestamp?: number }>("/messages/forward", body);
    return response.data;
  }

  async downloadMedia(session: string, fileId: string): Promise<{ data: Buffer; mimeType: string }> {
    const response = await this.http.get(`/media/${session}/${fileId}`, {
      responseType: "arraybuffer",
      headers: { Accept: "*/*" },
    });
    return {
      data: Buffer.from(response.data as ArrayBuffer),
      mimeType: (response.headers["content-type"] as string) || "application/octet-stream",
    };
  }

  async transcribe(body: {
    message_id?: string;
    media_url?: string;
    language?: string;
  }): Promise<unknown> {
    const response = await this.http.post("/transcribe", body);
    return response.data;
  }

  // ── Enrichment ─────────────────────────────────────────────────

  async syncContacts(): Promise<unknown> {
    const response = await this.http.post("/contacts/sync");
    return response.data;
  }

  async importContacts(file: Buffer | Blob): Promise<unknown> {
    const formData = new FormData();
    const blob = file instanceof Blob
      ? file
      : new Blob([file as unknown as BlobPart], { type: "text/csv" });
    formData.append("file", blob, "contacts.csv");
    const response = await this.http.post("/contacts/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  }

  // ── Health ─────────────────────────────────────────────────────

  async getHealth(): Promise<{ status: string }> {
    const response = await this.http.get<{ status: string }>("/health");
    return response.data;
  }

  // ── Rate limiting ──────────────────────────────────────────────

  /**
   * Enforce minimum delay between outbound messages to avoid WhatsApp detection.
   * Call this before any send operation.
   */
  async throttleSend(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastSendTime;
    if (elapsed < this.sendDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.sendDelayMs - elapsed));
    }
    this.lastSendTime = Date.now();
  }
}

// ── Types (re-exported for convenience) ──────────────────────────

export interface StoreMessage {
  id: string;
  chat_jid: string;
  timestamp: string;
  body: string | null;
  message_type: string;
  from_me: boolean;
  has_media: boolean;
  media_mimetype: string | null;
  ack: number | null;
  is_revoked: boolean;
  is_edited: boolean;
  sender_name: string | null;
  sender_jid: string;
}

export interface StoreMessageSearchResult {
  messages: StoreMessage[];
  total: number;
  has_more: boolean;
}

export interface StoreContact {
  id: number;
  jid: string;
  phone: string | null;
  push_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  message_count: number;
  chats_count: number;
  google_name: string | null;
  email: string | null;
  organization: string | null;
}

export interface StoreContactDetail {
  contact: {
    id: number;
    jid: string;
    phone: string | null;
    push_name: string | null;
    is_me: boolean;
    first_seen_at: string;
    last_seen_at: string;
    google_name: string | null;
    email: string | null;
    organization: string | null;
  };
  chats: Array<{
    jid: string;
    chat_type: string;
    name: string | null;
    first_seen_at: string;
    last_seen_at: string;
    messages_in_chat: number;
  }>;
  message_stats: {
    total: number;
    first_message: string;
    last_message: string;
  };
}

export interface StoreContactGraph {
  contact: {
    id: number;
    jid: string;
    phone: string | null;
    push_name: string | null;
    is_me: boolean;
    first_seen_at: string;
    last_seen_at: string;
  };
  chats: Array<{
    jid: string;
    chat_type: string;
    name: string | null;
    message_count: number;
  }>;
  connections: Array<{
    id: number;
    push_name: string | null;
    jid: string;
    phone: string | null;
    shared_groups: number;
  }>;
}

export interface StoreChat {
  jid: string;
  chat_type: string;
  name: string | null;
  message_count: number;
  first_message_at: string;
  last_message_at: string;
  member_count: number;
}

export interface StoreChatDetail {
  chat: {
    jid: string;
    chat_type: string;
    name: string | null;
    first_message_at: string;
    last_message_at: string;
    message_count: number;
  };
  members: Array<{
    id: number;
    push_name: string | null;
    jid: string;
    phone: string | null;
    role: string;
    messages_in_chat: number;
  }>;
}

export interface StoreChatSummary {
  chat: {
    jid: string;
    chat_type: string;
    name: string | null;
    first_message_at: string;
    last_message_at: string;
    message_count: number;
  };
  messages: Array<{
    timestamp: string;
    body: string | null;
    message_type: string;
    from_me: boolean;
    has_media: boolean;
    media_mimetype: string | null;
    is_revoked: boolean;
    is_edited: boolean;
    sender_name: string | null;
  }>;
}

export interface StoreStats {
  total_messages: number;
  total_contacts: number;
  total_chats: number;
  groups: number;
  dms: number;
  messages_today: number;
  messages_week: number;
  top_chats: Array<{
    jid: string;
    chat_type: string;
    name: string | null;
    message_count: number;
    last_message_at: string;
  }>;
  top_contacts: Array<{
    push_name: string | null;
    jid: string;
    message_count: number;
  }>;
}
