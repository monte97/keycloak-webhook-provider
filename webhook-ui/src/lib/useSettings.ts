import { useState, useCallback } from 'react';

export interface AppSettings {
  metricsRefreshInterval: number;
}

const STORAGE_KEY = 'webhook-admin-ui-settings';

const DEFAULTS: AppSettings = {
  metricsRefreshInterval: 10_000,
};

function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'metricsRefreshInterval' in parsed) {
      return { ...DEFAULTS, ...(parsed as Partial<AppSettings>) };
    }
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings(): {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
} {
  const [settings, setSettings] = useState<AppSettings>(readSettings);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
