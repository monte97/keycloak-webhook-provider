import { useState, useCallback } from 'react';

export interface WebhookDefaults {
  enabled: boolean;
  retryMaxElapsedSeconds: number | null;
  retryMaxIntervalSeconds: number | null;
}

export interface AppSettings {
  metricsRefreshInterval: number;
  webhookDefaults: WebhookDefaults;
}

export type AppSettingsPatch = Omit<Partial<AppSettings>, 'webhookDefaults'> & {
  webhookDefaults?: Partial<WebhookDefaults>;
};

export const STORAGE_KEY = 'webhook-admin-ui-settings';

const DEFAULTS: AppSettings = {
  metricsRefreshInterval: 10_000,
  webhookDefaults: {
    enabled: true,
    retryMaxElapsedSeconds: null,
    retryMaxIntervalSeconds: null,
  },
};

function validateWebhookDefaults(raw: unknown): WebhookDefaults {
  if (typeof raw !== 'object' || raw === null) return DEFAULTS.webhookDefaults;
  const obj = raw as Record<string, unknown>;

  const enabled =
    typeof obj['enabled'] === 'boolean' ? obj['enabled'] : DEFAULTS.webhookDefaults.enabled;

  const retryMaxElapsedSeconds =
    obj['retryMaxElapsedSeconds'] === null || obj['retryMaxElapsedSeconds'] === undefined
      ? null
      : typeof obj['retryMaxElapsedSeconds'] === 'number'
        ? obj['retryMaxElapsedSeconds']
        : DEFAULTS.webhookDefaults.retryMaxElapsedSeconds;

  const retryMaxIntervalSeconds =
    obj['retryMaxIntervalSeconds'] === null || obj['retryMaxIntervalSeconds'] === undefined
      ? null
      : typeof obj['retryMaxIntervalSeconds'] === 'number'
        ? obj['retryMaxIntervalSeconds']
        : DEFAULTS.webhookDefaults.retryMaxIntervalSeconds;

  return { enabled, retryMaxElapsedSeconds, retryMaxIntervalSeconds };
}

function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const obj = parsed as Record<string, unknown>;
    return {
      metricsRefreshInterval:
        typeof obj['metricsRefreshInterval'] === 'number'
          ? obj['metricsRefreshInterval']
          : DEFAULTS.metricsRefreshInterval,
      webhookDefaults: validateWebhookDefaults(obj['webhookDefaults']),
    };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings(): {
  settings: AppSettings;
  updateSettings: (patch: AppSettingsPatch) => void;
} {
  const [settings, setSettings] = useState<AppSettings>(readSettings);

  const updateSettings = useCallback((patch: AppSettingsPatch) => {
    setSettings((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof AppSettingsPatch)[]) {
        const patchVal = patch[key];
        if (patchVal !== undefined) {
          const prevVal = prev[key];
          if (
            typeof patchVal === 'object' &&
            patchVal !== null &&
            !Array.isArray(patchVal) &&
            typeof prevVal === 'object' &&
            prevVal !== null
          ) {
            (next as Record<string, unknown>)[key] = { ...prevVal, ...patchVal };
          } else {
            (next as Record<string, unknown>)[key] = patchVal;
          }
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
