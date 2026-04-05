export interface Webhook {
  id: string;
  url: string;
  algorithm: string;
  enabled: boolean;
  eventTypes: string[];
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  createdAt: string;
  retryMaxElapsedSeconds?: number;
  retryMaxIntervalSeconds?: number;
}

export interface WebhookInput {
  url: string;
  secret?: string;
  algorithm?: string;
  enabled: boolean;
  eventTypes: string[];
  retryMaxElapsedSeconds?: number;
  retryMaxIntervalSeconds?: number;
}

export interface SecretStatus {
  type: 'secret';
  configured: boolean;
}

export interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureAt: string | null;
  failureThreshold: number;
  openSeconds: number;
}

export interface TestResult {
  httpStatus: number;
  success: boolean;
  durationMs: number;
}

export interface WebhookSend {
  id: string;
  webhookId: string;
  webhookEventId: string;
  eventType: string;
  httpStatus: number;
  success: boolean;
  retries: number;
  sentAt: string;
  lastAttemptAt: string;
}

export interface ResendResult {
  resent: number;
  failed: number;
  skipped: number;
}

export interface SendResult {
  httpStatus: number;
  success: boolean;
  durationMs: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API error ${status}: ${body}`);
    this.name = 'ApiError';
  }
}
