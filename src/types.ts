/** WAHA session info from GET /api/sessions */
export interface WahaSession {
  name: string;
  status: string;
  config: unknown;
  me: WahaMe | null;
  presence: string;
  timestamps: {
    activity: number;
  };
}

/** Authenticated account info */
export interface WahaMe {
  id: string;
  pushName: string;
  lid?: string;
  jid?: string;
}

/** Chat from GET /api/{session}/chats */
export interface WahaChat {
  id: string;
  name: string;
  conversationTimestamp: number;
}

/** Chat overview from GET /api/{session}/chats/overview */
export interface WahaChatOverview {
  id: string;
  name: string;
  conversationTimestamp: number;
  picture?: string | null;
  lastMessage?: {
    id: string;
    body?: string;
    timestamp: number;
    from: string;
    fromMe: boolean;
    hasMedia: boolean;
  } | null;
}

/** Message from GET /api/{session}/chats/{chatId}/messages */
export interface WahaMessage {
  id: string;
  timestamp: number;
  from: string;
  fromMe: boolean;
  to: string | null;
  body?: string;
  hasMedia: boolean;
  ack: number | null;
  ackName: string;
  replyTo: unknown;
  _data?: unknown;
  /** For non-text messages */
  type?: string;
  /** vCard contacts */
  vCards?: string[];
  /** Location data */
  location?: unknown;
  /** Media info (when downloadMedia=true) */
  media?: {
    url: string;
    mimetype: string;
    filename?: string;
  } | null;
}

/** Response from POST /api/sendText */
export interface WahaSendResult {
  id: string;
  timestamp: number;
}

/** Response from GET /api/contacts/check-exists */
export interface WahaCheckExistsResult {
  numberExists: boolean;
  chatId: string;
}

/** Contact from GET /api/contacts/all */
export interface WahaContact {
  id: string;
  name: string;
  pushName: string;
  shortName: string;
  isMe: boolean;
  isGroup: boolean;
  isBusiness: boolean;
}

/** WAHA API error response shape */
export interface WahaErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  exception?: {
    message: string;
    name: string;
  };
}

/** Transcription service config (optional) */
export interface TranscriptionConfig {
  url: string;
  apiKey: string;
  model: string;
  language?: string;
}

/** Message Store API config (optional) */
export interface MessageStoreConfig {
  url: string;
  apiKey: string;
}

// ── Message Store API response types ─────────────────────────────

/** Message from the Message Store API */
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

/** Paginated message search response */
export interface StoreMessageSearchResult {
  messages: StoreMessage[];
  total: number;
  has_more: boolean;
}

/** Contact from the Message Store list endpoint */
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

/** Contact detail with chats and message stats */
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

/** Contact graph — shared groups and mutual connections */
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

/** Chat from the Message Store list endpoint */
export interface StoreChat {
  jid: string;
  chat_type: string;
  name: string | null;
  message_count: number;
  first_message_at: string;
  last_message_at: string;
  member_count: number;
}

/** Chat detail with members */
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

/** Chat summary — chat info + recent messages */
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

/** Stats overview from the Message Store */
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

/** Config loaded from environment variables */
export interface WahaConfig {
  apiUrl: string;
  apiKey: string;
  session: string;
  sendDelayMs: number;
  transcription?: TranscriptionConfig;
  store?: MessageStoreConfig;
}
