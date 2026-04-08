import type {
  Webhook,
  WebhookInput,
  SecretStatus,
  CircuitState,
  TestResult,
  WebhookSend,
  ResendResult,
  SendResult,
  RotateSecretRequest,
  RotateSecretResponse,
  SendPayload,
} from './types';
import { ApiError } from './types';

interface KeycloakInstance {
  token?: string;
  updateToken(minValidity: number): Promise<boolean>;
}

export function createWebhookApi(basePath: string, realm: string, keycloak: KeycloakInstance) {
  const baseUrl = `${basePath}/realms/${realm}/webhooks`;

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    await keycloak.updateToken(30);
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${keycloak.token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(res.status, body);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  return {
    list(first = 0, max = 100): Promise<Webhook[]> {
      return request(`?first=${first}&max=${max}`);
    },
    count(): Promise<number> {
      return request('/count');
    },
    get(id: string): Promise<Webhook> {
      return request(`/${id}`);
    },
    create(data: WebhookInput): Promise<Webhook> {
      return request('', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<WebhookInput>): Promise<Webhook> {
      return request(`/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<void> {
      return request(`/${id}`, { method: 'DELETE' });
    },
    getSecretStatus(id: string): Promise<SecretStatus> {
      return request(`/${id}/secret`);
    },
    test(id: string): Promise<TestResult> {
      return request(`/${id}/test`, { method: 'POST' });
    },
    getCircuit(id: string): Promise<CircuitState> {
      return request(`/${id}/circuit`);
    },
    resetCircuit(id: string): Promise<void> {
      return request(`/${id}/circuit/reset`, { method: 'POST' });
    },
    rotateSecret(id: string, req: RotateSecretRequest): Promise<RotateSecretResponse> {
      return request(`/${id}/rotate-secret`, {
        method: 'POST',
        body: JSON.stringify(req),
      });
    },
    completeRotation(id: string): Promise<void> {
      return request(`/${id}/complete-rotation`, { method: 'POST' });
    },
    getSends(
      id: string,
      params: { first?: number; max?: number; success?: boolean } = {},
    ): Promise<WebhookSend[]> {
      const { first = 0, max = 50, success } = params;
      const qs =
        success !== undefined
          ? `?first=${first}&max=${max}&success=${success}`
          : `?first=${first}&max=${max}`;
      return request(`/${id}/sends${qs}`);
    },
    resendFailed(id: string, hours = 24): Promise<ResendResult> {
      return request(`/${id}/resend-failed?hours=${hours}`, { method: 'POST' });
    },
    resendSingle(webhookId: string, sendId: string, force = false): Promise<SendResult> {
      return request(`/${webhookId}/sends/${sendId}/resend?force=${force}`, { method: 'POST' });
    },
    getSendPayload(webhookId: string, sendId: string): Promise<SendPayload> {
      return request(`/${webhookId}/sends/${sendId}/payload`);
    },
    async getMetrics(): Promise<string> {
      await keycloak.updateToken(30);
      const res = await fetch(`${baseUrl}/metrics`, {
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
        },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new ApiError(res.status, body);
      }
      return res.text();
    },
  };
}

export type WebhookApiClient = ReturnType<typeof createWebhookApi>;
