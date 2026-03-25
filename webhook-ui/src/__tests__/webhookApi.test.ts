import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebhookApi } from '../api/webhookApi';
import type { WebhookInput } from '../api/types';
import { ApiError } from '../api/types';

const mockUpdateToken = vi.fn().mockResolvedValue(true);
const mockKeycloak = { token: 'test-token', updateToken: mockUpdateToken } as any;

describe('webhookApi', () => {
  let api: ReturnType<typeof createWebhookApi>;

  beforeEach(() => {
    vi.restoreAllMocks();
    api = createWebhookApi('/auth', 'my-realm', mockKeycloak);
  });

  it('list() fetches webhooks with correct URL and auth header', async () => {
    const webhooks = [{ id: '1', url: 'http://test.com', enabled: true }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(webhooks), { status: 200 }),
    );

    const result = await api.list();

    expect(mockUpdateToken).toHaveBeenCalledWith(30);
    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks?first=0&max=100',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
    expect(result).toEqual(webhooks);
  });

  it('create() POSTs with JSON body', async () => {
    const input: WebhookInput = {
      url: 'http://test.com/hook',
      enabled: true,
      eventTypes: ['access.LOGIN'],
    };
    const created = { id: '2', ...input };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(created), { status: 201 }),
    );

    const result = await api.create(input);

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result).toEqual(created);
  });

  it('throws ApiError on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('forbidden', { status: 403 })),
    );

    await expect(api.list()).rejects.toThrow(ApiError);
    await expect(api.list()).rejects.toMatchObject({ status: 403 });
  });

  it('delete() sends DELETE request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await api.delete('abc');

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks/abc',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('resetCircuit() POSTs to circuit/reset', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await api.resetCircuit('abc');

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks/abc/circuit/reset',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
