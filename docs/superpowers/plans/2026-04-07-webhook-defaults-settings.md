# Webhook Defaults in Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure default values (enabled, retry duration, retry interval) for new webhooks via the Settings page, pre-populating the create modal.

**Architecture:** Extend `AppSettings` with a nested `webhookDefaults` object. `useSettings` gets a one-level deep merge. `App.tsx` passes defaults through `WebhookTable` to `WebhookModal`. `SettingsPage` gets a second Card for webhook defaults.

**Tech Stack:** React 18, PatternFly 5, TypeScript (strict, `noUncheckedIndexedAccess: true`), Vitest, Testing Library, Playwright

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `webhook-ui/src/lib/useSettings.ts` | Modify | Add `WebhookDefaults` type, extend `AppSettings`, deep merge in `updateSettings`, validate in `readSettings` |
| `webhook-ui/src/__tests__/useSettings.test.ts` | Modify | Tests for new defaults, deep merge, per-field fallback |
| `webhook-ui/src/components/SettingsPage.tsx` | Modify | Add "Webhook — valori predefiniti" card with switch + 2 number inputs |
| `webhook-ui/src/__tests__/SettingsPage.test.tsx` | Modify | Tests for new card controls |
| `webhook-ui/src/components/WebhookModal.tsx` | Modify | Accept optional `defaults` prop, use in create mode |
| `webhook-ui/src/__tests__/WebhookModal.test.tsx` | Modify | Tests for defaults prop |
| `webhook-ui/src/components/WebhookTable.tsx` | Modify | Accept `defaults` prop, forward to `WebhookModal` |
| `webhook-ui/src/App.tsx` | Modify | Pass `settings.webhookDefaults` to `WebhookTable` |
| `e2e/tests/06-settings.spec.ts` | Modify | E2E tests for new settings + modal integration |
| `docs/user-guide/guide-en.md` | Modify | Update §7 Settings |
| `docs/user-guide/guide-it.md` | Modify | Update §7 Impostazioni |
| `e2e/take-screenshots.ts` | Modify | Retake screenshot 07 |

---

### Task 1: Extend `useSettings` — types, defaults, deep merge

**Files:**
- Modify: `webhook-ui/src/lib/useSettings.ts`
- Modify: `webhook-ui/src/__tests__/useSettings.test.ts`

- [ ] **Step 1: Write failing tests for new defaults and deep merge**

Add these tests to `webhook-ui/src/__tests__/useSettings.test.ts`:

```ts
it('returns defaults with webhookDefaults when localStorage is empty', () => {
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
```

Also update the first existing test `'returns defaults when localStorage is empty'` to include `webhookDefaults`:

```ts
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
```

Also update `'updateSettings merges patch and writes to localStorage'` expected value:

```ts
it('updateSettings merges patch and writes to localStorage', () => {
  const { result } = renderHook(() => useSettings());
  act(() => {
    result.current.updateSettings({ metricsRefreshInterval: 60_000 });
  });
  expect(result.current.settings.metricsRefreshInterval).toBe(60_000);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).metricsRefreshInterval).toBe(60_000);
});
```

Update `'falls back to defaults on malformed JSON'` and `'falls back to defaults on valid JSON that is not a settings object'` to expect the full object with `webhookDefaults`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run src/__tests__/useSettings.test.ts`
Expected: Multiple failures (missing `webhookDefaults` in type and defaults)

- [ ] **Step 3: Implement the changes in `useSettings.ts`**

Replace the entire file `webhook-ui/src/lib/useSettings.ts` with:

```ts
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
  if (
    typeof obj['enabled'] !== 'boolean' ||
    (obj['retryMaxElapsedSeconds'] !== null && typeof obj['retryMaxElapsedSeconds'] !== 'number') ||
    (obj['retryMaxIntervalSeconds'] !== null && typeof obj['retryMaxIntervalSeconds'] !== 'number')
  ) {
    return DEFAULTS.webhookDefaults;
  }
  return {
    enabled: obj['enabled'] as boolean,
    retryMaxElapsedSeconds: obj['retryMaxElapsedSeconds'] as number | null,
    retryMaxIntervalSeconds: obj['retryMaxIntervalSeconds'] as number | null,
  };
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
  updateSettings: (patch: Partial<AppSettings>) => void;
} {
  const [settings, setSettings] = useState<AppSettings>(readSettings);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webhook-ui && npx vitest run src/__tests__/useSettings.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/lib/useSettings.ts webhook-ui/src/__tests__/useSettings.test.ts
git commit -m "feat(settings): extend AppSettings with webhookDefaults and deep merge"
```

---

### Task 2: Add webhook defaults card to `SettingsPage`

**Files:**
- Modify: `webhook-ui/src/components/SettingsPage.tsx`
- Modify: `webhook-ui/src/__tests__/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing tests for the new card**

Update `webhook-ui/src/__tests__/SettingsPage.test.tsx`. First update the `defaultSettings` constant and add imports:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '../components/SettingsPage';
import type { AppSettings } from '../lib/useSettings';

const defaultSettings: AppSettings = {
  metricsRefreshInterval: 10_000,
  webhookDefaults: {
    enabled: true,
    retryMaxElapsedSeconds: null,
    retryMaxIntervalSeconds: null,
  },
};
```

Then add these tests inside the `describe` block (keep all existing tests, they still pass with updated `defaultSettings`):

```ts
it('renders webhook defaults card with switch and number inputs', () => {
  render(<SettingsPage settings={defaultSettings} onUpdate={vi.fn()} />);
  expect(screen.getByText('Webhook — valori predefiniti')).toBeInTheDocument();
  expect(screen.getByLabelText('Enabled by default')).toBeInTheDocument();
  expect(screen.getByLabelText('Max retry duration (seconds)')).toBeInTheDocument();
  expect(screen.getByLabelText('Max retry interval (seconds)')).toBeInTheDocument();
});

it('enabled switch reflects settings and calls onUpdate on toggle', () => {
  const onUpdate = vi.fn();
  render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
  const toggle = screen.getByLabelText('Enabled by default');
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  expect(onUpdate).toHaveBeenCalledWith({ webhookDefaults: { enabled: false } });
});

it('retry duration input calls onUpdate with number on valid input', () => {
  const onUpdate = vi.fn();
  render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
  const input = screen.getByLabelText('Max retry duration (seconds)');
  fireEvent.change(input, { target: { value: '600' } });
  fireEvent.blur(input);
  expect(onUpdate).toHaveBeenCalledWith({
    webhookDefaults: { retryMaxElapsedSeconds: 600 },
  });
});

it('retry duration input calls onUpdate with null when cleared', () => {
  const onUpdate = vi.fn();
  const settingsWithRetry: AppSettings = {
    ...defaultSettings,
    webhookDefaults: { ...defaultSettings.webhookDefaults, retryMaxElapsedSeconds: 600 },
  };
  render(<SettingsPage settings={settingsWithRetry} onUpdate={onUpdate} />);
  const input = screen.getByLabelText('Max retry duration (seconds)');
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input);
  expect(onUpdate).toHaveBeenCalledWith({
    webhookDefaults: { retryMaxElapsedSeconds: null },
  });
});

it('retry interval input calls onUpdate with number on valid input', () => {
  const onUpdate = vi.fn();
  render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
  const input = screen.getByLabelText('Max retry interval (seconds)');
  fireEvent.change(input, { target: { value: '120' } });
  fireEvent.blur(input);
  expect(onUpdate).toHaveBeenCalledWith({
    webhookDefaults: { retryMaxIntervalSeconds: 120 },
  });
});

it('retry input shows error on invalid value and does not call onUpdate', () => {
  const onUpdate = vi.fn();
  render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
  const input = screen.getByLabelText('Max retry duration (seconds)');
  fireEvent.change(input, { target: { value: '-5' } });
  fireEvent.blur(input);
  expect(onUpdate).not.toHaveBeenCalled();
});

it('retry input shows persisted value from settings', () => {
  const settingsWithRetry: AppSettings = {
    ...defaultSettings,
    webhookDefaults: {
      ...defaultSettings.webhookDefaults,
      retryMaxElapsedSeconds: 600,
      retryMaxIntervalSeconds: 120,
    },
  };
  render(<SettingsPage settings={settingsWithRetry} onUpdate={vi.fn()} />);
  expect(screen.getByLabelText('Max retry duration (seconds)')).toHaveValue(600);
  expect(screen.getByLabelText('Max retry interval (seconds)')).toHaveValue(120);
});
```

Also update the existing `'checks the radio matching current settings'` test to use full `AppSettings`:

```ts
it('checks the radio matching current settings', () => {
  render(
    <SettingsPage
      settings={{ metricsRefreshInterval: 30_000, webhookDefaults: defaultSettings.webhookDefaults }}
      onUpdate={vi.fn()}
    />,
  );
  expect(screen.getByRole('radio', { name: '30 secondi' })).toBeChecked();
  expect(screen.getByRole('radio', { name: '10 secondi' })).not.toBeChecked();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run src/__tests__/SettingsPage.test.tsx`
Expected: New tests FAIL (no webhook defaults card rendered yet)

- [ ] **Step 3: Implement the new card in `SettingsPage.tsx`**

Replace the entire file `webhook-ui/src/components/SettingsPage.tsx` with:

```tsx
import { useState } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Radio,
  Switch,
  TextInput,
  Title,
} from '@patternfly/react-core';
import type { AppSettings } from '../lib/useSettings';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
}

const INTERVAL_OPTIONS = [
  { label: '5 secondi', value: 5_000 },
  { label: '10 secondi', value: 10_000 },
  { label: '30 secondi', value: 30_000 },
  { label: '60 secondi', value: 60_000 },
] as const;

function RetryInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | null;
  placeholder: string;
  onChange: (val: number | null) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  const [error, setError] = useState('');

  const handleBlur = () => {
    if (local.trim() === '') {
      setError('');
      onChange(null);
      return;
    }
    const n = Number(local);
    if (!Number.isInteger(n) || n < 1) {
      setError('Must be a positive integer');
      return;
    }
    setError('');
    onChange(n);
  };

  return (
    <FormGroup label={label} fieldId={label}>
      <TextInput
        id={label}
        aria-label={label}
        type="number"
        value={local}
        onChange={(_e, val) => {
          setLocal(val);
          if (error) setError('');
        }}
        onBlur={handleBlur}
        validated={error ? 'error' : 'default'}
        placeholder={placeholder}
      />
      {error && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{error}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

export function SettingsPage({ settings, onUpdate }: SettingsPageProps) {
  return (
    <>
      <Title headingLevel="h1" size="xl" style={{ marginBottom: 16 }}>
        Impostazioni
      </Title>
      <Card>
        <CardTitle>Metriche</CardTitle>
        <CardBody>
          <Form>
            <FormGroup
              label="Intervallo auto-refresh"
              role="group"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <Radio
                  key={opt.value}
                  id={`interval-${opt.value}`}
                  name="metrics-refresh-interval"
                  label={opt.label}
                  isChecked={settings.metricsRefreshInterval === opt.value}
                  onChange={() => onUpdate({ metricsRefreshInterval: opt.value })}
                />
              ))}
            </FormGroup>
          </Form>
        </CardBody>
      </Card>
      <Card style={{ marginTop: 16 }}>
        <CardTitle>Webhook — valori predefiniti</CardTitle>
        <CardBody>
          <Form>
            <FormGroup label="Enabled by default" fieldId="default-enabled">
              <Switch
                id="default-enabled"
                aria-label="Enabled by default"
                isChecked={settings.webhookDefaults.enabled}
                onChange={(_e, val) =>
                  onUpdate({ webhookDefaults: { enabled: val } })
                }
              />
            </FormGroup>
            <RetryInput
              label="Max retry duration (seconds)"
              value={settings.webhookDefaults.retryMaxElapsedSeconds}
              placeholder="900 (default server)"
              onChange={(val) =>
                onUpdate({ webhookDefaults: { retryMaxElapsedSeconds: val } })
              }
            />
            <RetryInput
              label="Max retry interval (seconds)"
              value={settings.webhookDefaults.retryMaxIntervalSeconds}
              placeholder="180 (default server)"
              onChange={(val) =>
                onUpdate({ webhookDefaults: { retryMaxIntervalSeconds: val } })
              }
            />
          </Form>
        </CardBody>
      </Card>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webhook-ui && npx vitest run src/__tests__/SettingsPage.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/components/SettingsPage.tsx webhook-ui/src/__tests__/SettingsPage.test.tsx
git commit -m "feat(settings): add webhook defaults card with enabled switch and retry inputs"
```

---

### Task 3: Accept `defaults` prop in `WebhookModal`

**Files:**
- Modify: `webhook-ui/src/components/WebhookModal.tsx`
- Modify: `webhook-ui/src/__tests__/WebhookModal.test.tsx`

- [ ] **Step 1: Write failing tests for defaults prop**

Add these tests to `webhook-ui/src/__tests__/WebhookModal.test.tsx`. First add the import for `WebhookDefaults`:

```ts
import type { WebhookDefaults } from '../lib/useSettings';
```

Then add these tests inside the `describe` block:

```ts
it('create mode with defaults prop uses default values', () => {
  const defaults: WebhookDefaults = {
    enabled: false,
    retryMaxElapsedSeconds: 600,
    retryMaxIntervalSeconds: 120,
  };
  render(
    <WebhookModal mode="create" isOpen defaults={defaults} onSave={onSave} onClose={onClose} />,
  );

  // Enabled switch should be off
  expect(screen.getByLabelText(/enabled/i)).not.toBeChecked();
  // Retry fields should be pre-populated
  expect(screen.getByLabelText('Max retry duration (seconds)')).toHaveValue(600);
  expect(screen.getByLabelText('Max retry interval (seconds)')).toHaveValue(120);
});

it('create mode without defaults prop uses hardcoded defaults', () => {
  render(
    <WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />,
  );

  expect(screen.getByLabelText(/enabled/i)).toBeChecked();
  expect(screen.getByLabelText('Max retry duration (seconds)')).toHaveValue(null);
  expect(screen.getByLabelText('Max retry interval (seconds)')).toHaveValue(null);
});

it('edit mode ignores defaults prop', () => {
  const webhook: Webhook = {
    id: '1',
    url: 'https://example.com/hook',
    algorithm: 'HmacSHA256',
    enabled: true,
    eventTypes: ['access.LOGIN'],
    circuitState: 'CLOSED',
    failureCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    retryMaxElapsedSeconds: 300,
    retryMaxIntervalSeconds: 60,
  };
  const defaults: WebhookDefaults = {
    enabled: false,
    retryMaxElapsedSeconds: 600,
    retryMaxIntervalSeconds: 120,
  };
  render(
    <WebhookModal
      mode="edit"
      isOpen
      webhook={webhook}
      defaults={defaults}
      onSave={onSave}
      onClose={onClose}
    />,
  );

  // Should use webhook values, not defaults
  expect(screen.getByLabelText(/enabled/i)).toBeChecked();
  expect(screen.getByLabelText('Max retry duration (seconds)')).toHaveValue(300);
  expect(screen.getByLabelText('Max retry interval (seconds)')).toHaveValue(60);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run src/__tests__/WebhookModal.test.tsx`
Expected: FAIL — `defaults` prop not accepted yet

- [ ] **Step 3: Implement defaults prop in `WebhookModal.tsx`**

In `webhook-ui/src/components/WebhookModal.tsx`, add the import at the top:

```ts
import type { WebhookDefaults } from '../lib/useSettings';
```

Update the `WebhookModalProps` interface to add `defaults`:

```ts
interface WebhookModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  webhook?: Webhook;
  secretConfigured?: boolean | null;
  defaults?: WebhookDefaults;
  onSave: (data: WebhookInput) => Promise<void>;
  onClose: () => void;
}
```

Update the destructuring in the component function:

```ts
export function WebhookModal({ mode, isOpen, webhook, secretConfigured, defaults, onSave, onClose }: WebhookModalProps) {
```

Update the `useEffect` that initializes state. Replace the `else` branch (create mode, lines 69-77) with:

```ts
    } else {
      setUrl('');
      setEnabled(defaults?.enabled ?? true);
      setSecret('');
      setAlgorithm('HmacSHA256');
      setEventTypes([]);
      setRetryMaxElapsed(
        defaults?.retryMaxElapsedSeconds != null ? String(defaults.retryMaxElapsedSeconds) : '',
      );
      setRetryMaxInterval(
        defaults?.retryMaxIntervalSeconds != null ? String(defaults.retryMaxIntervalSeconds) : '',
      );
    }
```

Add `defaults` to the useEffect dependency array:

```ts
  }, [mode, webhook, defaults, isOpen]);
```

Also add `aria-label` attributes to the retry `TextInput` components so tests can query them. On the retry max elapsed `TextInput` (around line 236), add:

```tsx
<TextInput
  id="retryMaxElapsed"
  aria-label="Max retry duration (seconds)"
  type="number"
  ...
```

On the retry max interval `TextInput` (around line 258), add:

```tsx
<TextInput
  id="retryMaxInterval"
  aria-label="Max retry interval (seconds)"
  type="number"
  ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webhook-ui && npx vitest run src/__tests__/WebhookModal.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/components/WebhookModal.tsx webhook-ui/src/__tests__/WebhookModal.test.tsx
git commit -m "feat(modal): accept defaults prop for create mode pre-population"
```

---

### Task 4: Wire defaults through `WebhookTable` and `App.tsx`

**Files:**
- Modify: `webhook-ui/src/components/WebhookTable.tsx`
- Modify: `webhook-ui/src/App.tsx`

- [ ] **Step 1: Add `defaults` prop to `WebhookTable`**

In `webhook-ui/src/components/WebhookTable.tsx`, add import:

```ts
import type { WebhookDefaults } from '../lib/useSettings';
```

Change the component signature from:

```ts
export function WebhookTable({ api }: { api: WebhookApiClient }) {
```

To:

```ts
export function WebhookTable({ api, defaults }: { api: WebhookApiClient; defaults?: WebhookDefaults }) {
```

Add `defaults={defaults}` to **both** `<WebhookModal>` instances.

First instance (empty state, around line 186):

```tsx
<WebhookModal
  mode="create"
  isOpen={modalOpen}
  defaults={defaults}
  onSave={handleSave}
  onClose={() => setModalOpen(false)}
/>
```

Second instance (main table, around line 340):

```tsx
<WebhookModal
  mode={modalMode}
  isOpen={modalOpen}
  webhook={editingWebhook}
  secretConfigured={secretStatus}
  defaults={modalMode === 'create' ? defaults : undefined}
  onSave={handleSave}
  onClose={() => setModalOpen(false)}
/>
```

- [ ] **Step 2: Pass `defaults` from `App.tsx`**

In `webhook-ui/src/App.tsx`, change line 34:

```tsx
{activeTab === 'webhooks' && <WebhookTable api={api} />}
```

To:

```tsx
{activeTab === 'webhooks' && (
  <WebhookTable api={api} defaults={settings.webhookDefaults} />
)}
```

- [ ] **Step 3: Run all unit tests to verify nothing breaks**

Run: `cd webhook-ui && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add webhook-ui/src/components/WebhookTable.tsx webhook-ui/src/App.tsx
git commit -m "feat: wire webhook defaults from settings through table to modal"
```

---

### Task 5: Update E2E tests

**Files:**
- Modify: `e2e/tests/06-settings.spec.ts`

- [ ] **Step 1: Add E2E tests for webhook defaults**

Append these tests to `e2e/tests/06-settings.spec.ts`:

```ts
test('Webhook defaults card is visible with switch and inputs', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByText('Webhook — valori predefiniti')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel('Enabled by default')).toBeVisible();
  await expect(page.getByLabel('Max retry duration (seconds)')).toBeVisible();
  await expect(page.getByLabel('Max retry interval (seconds)')).toBeVisible();
});

test('Toggling enabled default off pre-populates create modal', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Set enabled default to off
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByLabel('Enabled by default')).toBeVisible({ timeout: 5_000 });
  await page.getByLabel('Enabled by default').click();

  // Open create modal
  await page.getByRole('tab', { name: 'Webhooks' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /create webhook/i }).click();
  await page.waitForSelector('[role="dialog"]');

  // Enabled should be off in the modal
  const enabledSwitch = page.locator('#enabled');
  await expect(enabledSwitch).not.toBeChecked();

  await page.keyboard.press('Escape');
});

test('Setting retry duration persists and pre-populates create modal', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Set retry duration
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  const retryInput = page.getByLabel('Max retry duration (seconds)');
  await expect(retryInput).toBeVisible({ timeout: 5_000 });
  await retryInput.fill('600');
  await retryInput.blur();

  // Reload and verify persistence
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByLabel('Max retry duration (seconds)')).toHaveValue('600', { timeout: 5_000 });

  // Open create modal and verify pre-population
  await page.getByRole('tab', { name: 'Webhooks' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /create webhook/i }).click();
  await page.waitForSelector('[role="dialog"]');
  await expect(page.locator('#retryMaxElapsed')).toHaveValue('600');

  await page.keyboard.press('Escape');
});
```

- [ ] **Step 2: Run E2E tests**

Run: `cd e2e && npx playwright test tests/06-settings.spec.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/06-settings.spec.ts
git commit -m "test(e2e): add tests for webhook defaults settings"
```

---

### Task 6: Update user guides and screenshot

**Files:**
- Modify: `docs/user-guide/guide-en.md`
- Modify: `docs/user-guide/guide-it.md`
- Modify: `e2e/take-screenshots.ts`

- [ ] **Step 1: Update the English guide §7**

In `docs/user-guide/guide-en.md`, replace the content of section 7 (from `## 7. Settings` to end of file) with:

```markdown
## 7. Settings

![Settings page](screenshots/07-settings-page.png)

The **Impostazioni** tab exposes UI configuration options that are persisted in the browser's `localStorage` across sessions.

### Metrics auto-refresh interval

Controls how often the Metrics page automatically polls the `/metrics` endpoint when **Auto-refresh** is enabled.

| Option | Value |
|--------|-------|
| 5 secondi | 5 s |
| **10 secondi** *(default)* | 10 s |
| 30 secondi | 30 s |
| 60 secondi | 60 s |

### Webhook defaults

Default values applied when creating a new webhook. Existing webhooks are not affected.

| Setting | Default | Description |
|---------|---------|-------------|
| **Enabled by default** | On | Whether new webhooks start active (delivering events) immediately after creation |
| **Max retry duration (seconds)** | Empty (server default: 900) | Total time window for retry attempts |
| **Max retry interval (seconds)** | Empty (server default: 180) | Maximum back-off interval between retry attempts |

All changes take effect immediately — no save required. Settings persist after a page reload.
```

- [ ] **Step 2: Update the Italian guide §7**

In `docs/user-guide/guide-it.md`, replace the content of section 7 (from `## 7. Impostazioni` to end of file) with:

```markdown
## 7. Impostazioni

![Pagina impostazioni](screenshots/07-settings-page.png)

Il tab **Impostazioni** espone le opzioni di configurazione dell'interfaccia, persistite nel `localStorage` del browser tra una sessione e l'altra.

### Intervallo auto-refresh metriche

Controlla la frequenza con cui la pagina Metriche interroga automaticamente l'endpoint `/metrics` quando l'**Auto-refresh** è abilitato.

| Opzione | Valore |
|---------|--------|
| 5 secondi | 5 s |
| **10 secondi** *(default)* | 10 s |
| 30 secondi | 30 s |
| 60 secondi | 60 s |

### Webhook — valori predefiniti

Valori predefiniti applicati alla creazione di un nuovo webhook. I webhook esistenti non vengono modificati.

| Impostazione | Default | Descrizione |
|--------------|---------|-------------|
| **Enabled by default** | Attivo | Se i nuovi webhook iniziano attivi (consegnano eventi) subito dopo la creazione |
| **Max retry duration (seconds)** | Vuoto (default server: 900) | Finestra temporale totale per i tentativi di retry |
| **Max retry interval (seconds)** | Vuoto (default server: 180) | Intervallo massimo di back-off tra i tentativi di retry |

Le modifiche hanno effetto immediato — non è richiesto alcun salvataggio. Le impostazioni persistono al ricaricamento della pagina.
```

- [ ] **Step 3: Retake screenshot 07**

No changes needed to `e2e/take-screenshots.ts` — the existing step 07 navigates to the Impostazioni tab and takes a full-page screenshot, which will now include the new card.

Run: `cd e2e && npx ts-node --project tsconfig.json take-screenshots.ts`
Expected: `07-settings-page.png` regenerated with the new "Webhook — valori predefiniti" card visible.

- [ ] **Step 4: Commit**

```bash
git add docs/user-guide/guide-en.md docs/user-guide/guide-it.md docs/user-guide/screenshots/07-settings-page.png
git commit -m "docs: update user guides with webhook defaults settings section"
```
