import axios, { type AxiosAdapter, type AxiosInstance } from "axios";

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
  private sendThrottle: Promise<void> = Promise.resolve();

  constructor(
    config: { apiUrl: string; apiKey: string; session: string; sendDelayMs: number },
    adapter?: AxiosAdapter,
  ) {
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
      ...(adapter ? { adapter } : {}),
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
    const response = await this.http.get(`/messages/${encodeURIComponent(id)}`);
    return response.data;
  }

  async listContacts(params?: {
    search?: string;
    chat_jid?: string;
    kind?: "all" | "person" | "group";
    limit?: number;
    offset?: number;
  }): Promise<StoreContact[]> {
    const response = await this.http.get<{ contacts: StoreContact[] }>("/contacts", { params });
    return response.data.contacts;
  }

  async getContact(contactId: string): Promise<StoreContactDetail> {
    // Backend resolves digits / *@c.us / *@lid → person detail; *@g.us → group detail.
    const response = await this.http.get<StoreContactDetail>(`/contacts/${encodeURIComponent(contactId)}`);
    return response.data;
  }

  async getContactGraph(phone: string): Promise<StoreContactGraph> {
    const response = await this.http.get<StoreContactGraph>(`/contacts/${encodeURIComponent(phone)}/graph`);
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
    const response = await this.http.get<StoreChatDetail>(`/chats/${encodeURIComponent(jid)}`);
    return response.data;
  }

  async getChatMembers(jid: string): Promise<unknown> {
    const response = await this.http.get(`/chats/${encodeURIComponent(jid)}/members`);
    return response.data;
  }

  async getChatSummary(jid: string, limit?: number): Promise<StoreChatSummary> {
    const response = await this.http.get<StoreChatSummary>(`/chats/${encodeURIComponent(jid)}/summary`, {
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
    const response = await this.http.get("/chats/live", {
      params: { session: this.session, ...params },
    });
    return response.data;
  }

  async readMessagesLive(contactId: string, params?: {
    limit?: number;
    offset?: number;
    downloadMedia?: boolean;
  }): Promise<unknown> {
    const response = await this.http.get(`/chats/${encodeURIComponent(contactId)}/messages/live`, {
      params: { session: this.session, ...params },
    });
    return response.data;
  }

  async markAsRead(contactId: string): Promise<unknown> {
    const response = await this.http.post(
      `/chats/${encodeURIComponent(contactId)}/messages/read`,
      undefined,
      { params: { session: this.session } },
    );
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
    const response = await this.http.get("/contacts/all", {
      params: { session: this.session, ...params },
    });
    return response.data;
  }

  async checkNumber(phone: string): Promise<{ numberExists: boolean; chatId: string }> {
    const response = await this.http.get<{ numberExists: boolean; chatId: string }>("/contacts/check", {
      params: { phone, session: this.session },
    });
    return response.data;
  }

  // ── Actions (proxied to WAHA) ──────────────────────────────────

  async sendText(body: {
    contact_id: string;
    text: string;
    session?: string;
    reply_to?: string;
  }): Promise<Record<string, unknown>> {
    const response = await this.http.post<Record<string, unknown>>("/messages/send", body);
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
    contact_id: string;
    message_id: string;
    text: string;
    session?: string;
  }): Promise<unknown> {
    const response = await this.http.put("/messages/edit", body);
    return response.data;
  }

  async deleteMessage(id: string, contactId?: string, session?: string): Promise<unknown> {
    const response = await this.http.delete(`/messages/${encodeURIComponent(id)}`, {
      params: { ...(contactId ? { contact_id: contactId } : {}), ...(session ? { session } : {}) },
    });
    return response.data;
  }

  async forwardMessage(body: {
    message_id: string;
    contact_id: string;
    session?: string;
  }): Promise<Record<string, unknown>> {
    const response = await this.http.post<Record<string, unknown>>("/messages/forward", body);
    return response.data;
  }

  async downloadMedia(session: string, fileId: string): Promise<{ data: Buffer; mimeType: string }> {
    const response = await this.http.get(
      `/media/${encodeURIComponent(session)}/${encodeURIComponent(fileId)}`,
      {
      responseType: "arraybuffer",
      headers: { Accept: "*/*" },
      },
    );
    return {
      data: Buffer.from(response.data as ArrayBuffer),
      mimeType: (response.headers["content-type"] as string) || "application/octet-stream",
    };
  }

  async transcribe(body: {
    message_id?: string;
    media_url?: string;
    language?: string;
    prompt?: string;
  }): Promise<unknown> {
    // The backend may walk multiple ASR fallbacks with a 120-second timeout
    // each, so the generic 30-second request timeout is too short here.
    const response = await this.http.post("/transcribe", body, { timeout: 600000 });
    return response.data;
  }

  async textToSpeech(body: {
    text: string;
    voice?: string;
    model?: string;
    response_format?: string;
  }): Promise<{ data: Buffer; mimeType: string }> {
    const response = await this.http.post<ArrayBuffer>("/tts", body, {
      responseType: "arraybuffer",
      headers: { Accept: "audio/*" },
      timeout: 90000,
    });
    return {
      data: Buffer.from(response.data),
      mimeType: (response.headers["content-type"] as string) || "audio/mpeg",
    };
  }

  // ── Conversation automation ──────────────────────────────────────

  async getAutoReply(contactId: string): Promise<AutoReplyState> {
    return this.get<AutoReplyState>(`/contacts/${encodeURIComponent(contactId)}/auto-reply`);
  }

  async setAutoReply(contactId: string, contextual?: boolean): Promise<AutoReplyState> {
    return this.put<AutoReplyState>(
      `/contacts/${encodeURIComponent(contactId)}/auto-reply`,
      contextual === undefined ? undefined : { contextual },
    );
  }

  async disableAutoReply(contactId: string): Promise<AutoReplyState> {
    return this.delete<AutoReplyState>(`/contacts/${encodeURIComponent(contactId)}/auto-reply`);
  }

  async listAutoReplies(): Promise<AutoReplyList> {
    return this.get<AutoReplyList>("/auto-replies");
  }

  async getMediaSettings(contactId: string): Promise<MediaSettingsResponse> {
    return this.get<MediaSettingsResponse>(
      `/contacts/${encodeURIComponent(contactId)}/media-settings`,
    );
  }

  async updateMediaSettings(
    contactId: string,
    settings: Partial<MediaSettings>,
  ): Promise<MediaSettingsResponse> {
    return this.put<MediaSettingsResponse>(
      `/contacts/${encodeURIComponent(contactId)}/media-settings`,
      settings as Record<string, unknown>,
    );
  }

  async disableMediaSettings(contactId: string): Promise<MediaSettingsResponse> {
    return this.delete<MediaSettingsResponse>(
      `/contacts/${encodeURIComponent(contactId)}/media-settings`,
    );
  }

  async getMediaHealth(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>("/media/health");
  }

  async getWorkerHealth(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>("/worker/health");
  }

  async getListenerHealth(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>("/listener/health");
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

  async importMessages(file: Buffer, filename: string, chatName?: string): Promise<{
    status: string;
    chat_name: string;
    chat_jid: string;
    total_parsed: number;
    inserted: number;
    skipped_duplicates: number;
    phones_created?: number;
    contacts_created?: number;
    senders: string[];
  }> {
    const formData = new FormData();
    const blob = new Blob([file as unknown as BlobPart], { type: "application/zip" });
    formData.append("file", blob, filename);
    const params = chatName ? { chat_name: chatName } : undefined;
    const response = await this.http.post("/messages/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      params,
    });
    return response.data;
  }

  // ── Health ─────────────────────────────────────────────────────

  async getHealth(): Promise<{ status: string; database?: boolean; waha_live?: boolean }> {
    const response = await this.http.get<{
      status: string;
      database?: boolean;
      waha_live?: boolean;
    }>("/health");
    return response.data;
  }

  // ── Rate limiting ──────────────────────────────────────────────

  /**
   * Enforce minimum delay between outbound messages to avoid WhatsApp detection.
   * Call this before any send operation.
   */
  async throttleSend(): Promise<void> {
    const turn = this.sendThrottle.then(async () => {
      const elapsed = Date.now() - this.lastSendTime;
      if (elapsed < this.sendDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.sendDelayMs - elapsed));
      }
      this.lastSendTime = Date.now();
    });
    this.sendThrottle = turn.catch(() => {});
    await turn;
  }
}

// ── Types (re-exported for convenience) ──────────────────────────

export interface StoreMessage {
  id: string;
  chat_jid: string;
  timestamp: string;
  body: string | null;
  body_contextual: string | null;
  context_note: string | null;
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

export interface AutoReplyState {
  id?: string;
  phone?: string;
  kind?: "person" | "group";
  found?: boolean;
  enabled: boolean;
  contextual?: boolean;
  status?: string;
}

export interface AutoReplyList {
  contacts: Array<{
    phone: string;
    display_name: string;
    person_name: string | null;
    push_name: string | null;
  }>;
  groups?: Array<{
    jid: string;
    display_name: string;
  }>;
}

export interface MediaSettings {
  capture_enabled: boolean;
  analyze_images: boolean;
  analyze_documents: boolean;
  whatsapp_reply_enabled: boolean;
  archive_mode: "off" | "review" | "auto";
  fixed_nextcloud_folder_id: number | null;
  include_media_in_recap: boolean;
  archive_confirmation_enabled: boolean;
  allow_sensitive_processing: boolean;
  ask_on_review: boolean;
}

export interface MediaSettingsResponse {
  status?: string;
  scope_type: "phone" | "chat";
  scope_id: string;
  found?: boolean;
  settings: MediaSettings & Record<string, unknown>;
  warnings?: string[];
}

export interface StoreMessageSearchResult {
  messages: StoreMessage[];
  total: number;
  has_more: boolean;
}

export interface StoreContact {
  kind?: "person" | "group";
  id?: string;                          // canonical: phone digits or *@g.us
  display_name?: string;
  phone?: string | null;
  push_name?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  message_count?: number;
  chats_count?: number | null;
  member_count?: number | null;
  last_message_at?: string | null;
  person_id?: number | null;
  person_name?: string | null;
  google_name?: string | null;
  email?: string | null;
  organization?: string | null;
}

export interface StoreContactDetail {
  kind: "person" | "group";
  id: string;
  display_name: string;
  // Person-only
  contact?: {
    phone: string;
    push_name: string | null;
    is_me: boolean;
    first_seen_at: string;
    last_seen_at: string;
    person_name: string | null;
    email: string | null;
    organization: string | null;
  };
  chats?: Array<{
    jid: string;
    chat_type: string;
    name: string | null;
    first_seen_at: string;
    last_seen_at: string;
    messages_in_chat: number;
  }>;
  jids?: string[];
  message_stats?: {
    total: number;
    first_message: string | null;
    last_message: string | null;
  };
  // Group-only
  chat?: {
    jid: string;
    chat_type: string;
    name: string | null;
    first_message_at: string | null;
    last_message_at: string | null;
    message_count: number;
  };
  members?: Array<{
    phone: string | null;
    sender_jid: string | null;
    role: string;
    first_seen_at: string;
    last_seen_at: string;
    display_name: string;
    push_name: string | null;
    person_name: string | null;
  }>;
  member_count?: number;
}

export interface StoreContactGraph {
  contact: {
    phone: string;
    push_name: string | null;
    person_name: string | null;
  };
  chats: Array<{
    jid: string;
    chat_type: string;
    name: string | null;
    message_count: number;
  }>;
  connections: Array<{
    phone: string;
    push_name: string | null;
    name: string | null;
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
    phone: string;
    name: string | null;
    message_count: number;
  }>;
}
