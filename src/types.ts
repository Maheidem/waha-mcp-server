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

/** Config loaded from environment variables */
export interface WahaConfig {
  apiUrl: string;
  apiKey: string;
  session: string;
  sendDelayMs: number;
}
