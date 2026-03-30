import axios, { type AxiosInstance } from "axios";
import type { WahaConfig } from "../types.js";

/**
 * HTTP client for the WAHA REST API.
 * All methods throw on error — callers handle via parseWahaError().
 */
export class WahaClient {
  private readonly http: AxiosInstance;
  readonly session: string;
  readonly baseUrl: string;
  private lastSendTime = 0;
  private readonly sendDelayMs: number;

  constructor(config: WahaConfig) {
    this.session = config.session;
    this.baseUrl = config.apiUrl;
    this.sendDelayMs = config.sendDelayMs;

    this.http = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Api-Key": config.apiKey,
      },
    });
  }

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
