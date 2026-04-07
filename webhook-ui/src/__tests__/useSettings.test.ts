import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings, STORAGE_KEY } from '../lib/useSettings';

beforeEach(() => {
  localStorage.clear();
});

describe('useSettings', () => {
  it('returns defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings).toEqual({
      metricsRefreshInterval: 10_000,
      webhookDefaults: {
        enabled: true,
        retryMaxElapsedSeconds: null,
        retryMaxIntervalSeconds: null,
      },
    });
  });

  it('reads persisted metricsRefreshInterval from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ metricsRefreshInterval: 30_000 }));
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.metricsRefreshInterval).toBe(30_000);
  });

  it('updateSettings merges metricsRefreshInterval patch and writes to localStorage', () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.updateSettings({ metricsRefreshInterval: 60_000 });
    });
    expect(result.current.settings.metricsRefreshInterval).toBe(60_000);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).metricsRefreshInterval).toBe(60_000);
  });

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json!!!');
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings).toEqual({
      metricsRefreshInterval: 10_000,
      webhookDefaults: {
        enabled: true,
        retryMaxElapsedSeconds: null,
        retryMaxIntervalSeconds: null,
      },
    });
  });

  it('falls back to defaults on valid JSON that is not a settings object', () => {
    localStorage.setItem(STORAGE_KEY, '42');
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings).toEqual({
      metricsRefreshInterval: 10_000,
      webhookDefaults: {
        enabled: true,
        retryMaxElapsedSeconds: null,
        retryMaxIntervalSeconds: null,
      },
    });
  });

  it('deep merges webhookDefaults without losing sibling fields', () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.updateSettings({ webhookDefaults: { enabled: false } });
    });
    expect(result.current.settings.webhookDefaults).toEqual({
      enabled: false,
      retryMaxElapsedSeconds: null,
      retryMaxIntervalSeconds: null,
    });
  });

  it('reads persisted webhookDefaults from localStorage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        metricsRefreshInterval: 10_000,
        webhookDefaults: {
          enabled: false,
          retryMaxElapsedSeconds: 600,
          retryMaxIntervalSeconds: 120,
        },
      }),
    );
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.webhookDefaults).toEqual({
      enabled: false,
      retryMaxElapsedSeconds: 600,
      retryMaxIntervalSeconds: 120,
    });
  });

  it('falls back to default webhookDefaults when nested value is malformed', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        metricsRefreshInterval: 10_000,
        webhookDefaults: { enabled: 'not-a-boolean' },
      }),
    );
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.webhookDefaults).toEqual({
      enabled: true,
      retryMaxElapsedSeconds: null,
      retryMaxIntervalSeconds: null,
    });
  });

  it('falls back to default webhookDefaults when key is missing', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ metricsRefreshInterval: 30_000 }),
    );
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.metricsRefreshInterval).toBe(30_000);
    expect(result.current.settings.webhookDefaults).toEqual({
      enabled: true,
      retryMaxElapsedSeconds: null,
      retryMaxIntervalSeconds: null,
    });
  });

  it('accepts webhookDefaults with only enabled set, defaulting absent retry fields to null', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ webhookDefaults: { enabled: false } }),
    );
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.webhookDefaults).toEqual({
      enabled: false,
      retryMaxElapsedSeconds: null,
      retryMaxIntervalSeconds: null,
    });
  });
});
