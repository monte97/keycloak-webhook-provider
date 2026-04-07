import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '../lib/useSettings';

const STORAGE_KEY = 'webhook-admin-ui-settings';

beforeEach(() => {
  localStorage.clear();
});

describe('useSettings', () => {
  it('returns defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings).toEqual({ metricsRefreshInterval: 10_000 });
  });

  it('reads persisted value from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ metricsRefreshInterval: 30_000 }));
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.metricsRefreshInterval).toBe(30_000);
  });

  it('updateSettings merges patch and writes to localStorage', () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.updateSettings({ metricsRefreshInterval: 60_000 });
    });
    expect(result.current.settings.metricsRefreshInterval).toBe(60_000);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      metricsRefreshInterval: 60_000,
    });
  });

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json!!!');
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings).toEqual({ metricsRefreshInterval: 10_000 });
  });
});
