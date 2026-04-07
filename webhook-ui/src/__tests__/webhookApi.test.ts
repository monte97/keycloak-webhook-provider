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

  it('getSends() fetches sends with max param', async () => {
    const sends = [{ id: 's1', success: true, httpStatus: 200 }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sends), { status: 200 }),
    );

    const result = await api.getSends('abc', { max: 50 });

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks/abc/sends?first=0&max=50',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    expect(result).toEqual(sends);
  });

  it('getSends() appends success=false when requested', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await api.getSends('abc', { max: 50, success: false });

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks/abc/sends?first=0&max=50&success=false',
      expect.anything(),
    );
  });

  it('resendFailed() POSTs to resend-failed with hours param', async () => {
    const result = { resent: 3, failed: 0, skipped: 0 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(result), { status: 200 }),
    );

    const res = await api.resendFailed('abc', 24);

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks/abc/resend-failed?hours=24',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res).toEqual(result);
  });

  it('getMetrics() fetches raw text from /metrics', async () => {
    const raw = '# HELP webhook_dispatches_total\nwebhook_dispatches_total{realm="master",success="true"} 42\n';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(raw, { status: 200 }),
    );

    const result = await api.getMetrics();

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks/metrics',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    expect(result).toBe(raw);
  });

  it('getMetrics() throws ApiError on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('unauthorized', { status: 401 })),
    );
    await expect(api.getMetrics()).rejects.toThrow(ApiError);
    await expect(api.getMetrics()).rejects.toMatchObject({ status: 401 });
  });
});
