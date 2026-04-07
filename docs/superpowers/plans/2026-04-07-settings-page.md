# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Impostazioni" tab with a configurable metrics auto-refresh interval persisted in localStorage.

**Architecture:** A `useSettings` hook owns all localStorage I/O. App.tsx calls the hook and passes settings down as props. MetricsPage replaces its hardcoded `REFRESH_INTERVAL` constant with a `refreshInterval` prop. SettingsPage renders a radio group for interval selection.

**Tech Stack:** React 18, PatternFly 5, TypeScript (strict, `noUncheckedIndexedAccess: true`), Vitest + Testing Library, Playwright (E2E)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `webhook-ui/src/lib/useSettings.ts` | Hook: read/write `localStorage`, expose typed settings + updater |
| Create | `webhook-ui/src/__tests__/useSettings.test.ts` | Unit tests for the hook |
| Create | `webhook-ui/src/components/SettingsPage.tsx` | Settings form with radio group |
| Create | `webhook-ui/src/__tests__/SettingsPage.test.tsx` | Unit tests for SettingsPage |
| Modify | `webhook-ui/src/components/MetricsPage.tsx` | Remove constant, accept `refreshInterval` prop |
| Modify | `webhook-ui/src/__tests__/MetricsPage.test.tsx` | Pass `refreshInterval` prop in all tests |
| Modify | `webhook-ui/src/App.tsx` | Call `useSettings`, add tab, wire props |
| Create | `e2e/tests/06-settings.spec.ts` | E2E: tab navigation, radio change, localStorage persistence |

---

### Task 1: `useSettings` hook

**Files:**
- Create: `webhook-ui/src/lib/useSettings.ts`
- Create: `webhook-ui/src/__tests__/useSettings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `webhook-ui/src/__tests__/useSettings.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run src/__tests__/useSettings.test.ts`
Expected: FAIL — module `../lib/useSettings` not found

- [ ] **Step 3: Implement the hook**

Create `webhook-ui/src/lib/useSettings.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webhook-ui && npx vitest run src/__tests__/useSettings.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/lib/useSettings.ts webhook-ui/src/__tests__/useSettings.test.ts
git commit -m "feat: add useSettings hook with localStorage persistence"
```

---

### Task 2: `SettingsPage` component

**Files:**
- Create: `webhook-ui/src/components/SettingsPage.tsx`
- Create: `webhook-ui/src/__tests__/SettingsPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `webhook-ui/src/__tests__/SettingsPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '../components/SettingsPage';
import type { AppSettings } from '../lib/useSettings';

const defaultSettings: AppSettings = { metricsRefreshInterval: 10_000 };

describe('SettingsPage', () => {
  it('renders 4 radio options', () => {
    render(<SettingsPage settings={defaultSettings} onUpdate={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '5 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '10 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '60 secondi' })).toBeInTheDocument();
  });

  it('checks the radio matching current settings', () => {
    render(<SettingsPage settings={{ metricsRefreshInterval: 30_000 }} onUpdate={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '30 secondi' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '10 secondi' })).not.toBeChecked();
  });

  it('calls onUpdate with the new interval when a radio is clicked', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('radio', { name: '60 secondi' }));
    expect(onUpdate).toHaveBeenCalledWith({ metricsRefreshInterval: 60_000 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run src/__tests__/SettingsPage.test.tsx`
Expected: FAIL — module `../components/SettingsPage` not found

- [ ] **Step 3: Implement the component**

Create `webhook-ui/src/components/SettingsPage.tsx`:

```tsx
import {
  Card,
  CardBody,
  CardTitle,
  Form,
  FormGroup,
  Radio,
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
              fieldId="metrics-refresh-interval"
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
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webhook-ui && npx vitest run src/__tests__/SettingsPage.test.tsx`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/components/SettingsPage.tsx webhook-ui/src/__tests__/SettingsPage.test.tsx
git commit -m "feat: add SettingsPage with metrics refresh interval radio group"
```

---

### Task 3: Wire MetricsPage to accept `refreshInterval` prop

**Files:**
- Modify: `webhook-ui/src/components/MetricsPage.tsx:22-24,54-59`
- Modify: `webhook-ui/src/__tests__/MetricsPage.test.tsx`

- [ ] **Step 1: Update MetricsPage tests to pass `refreshInterval` prop**

In `webhook-ui/src/__tests__/MetricsPage.test.tsx`, change **every** `<MetricsPage api={api} />` to `<MetricsPage api={api} refreshInterval={10_000} />`.

There are 8 occurrences total (one in each `render()` call inside the 8 tests). Replace all of them.

- [ ] **Step 2: Add a test for interval change**

Append this test inside the existing `describe('MetricsPage', ...)` block in `webhook-ui/src/__tests__/MetricsPage.test.tsx`:

```tsx
  it('recreates interval when refreshInterval prop changes', async () => {
    const { rerender } = await act(async () => {
      return render(<MetricsPage api={api} refreshInterval={10_000} />);
    });
    await waitFor(() => screen.getAllByText('1000'));
    expect(api.getMetrics).toHaveBeenCalledTimes(1);

    // Change interval to 5s and advance by 5s
    await act(async () => {
      rerender(<MetricsPage api={api} refreshInterval={5_000} />);
    });
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    await waitFor(() => {
      expect(api.getMetrics).toHaveBeenCalledTimes(2);
    });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run src/__tests__/MetricsPage.test.tsx`
Expected: FAIL — `MetricsPage` does not accept `refreshInterval` prop (TS error) or the interval test fails because MetricsPage still uses the hardcoded constant

- [ ] **Step 4: Update MetricsPage to accept the prop**

In `webhook-ui/src/components/MetricsPage.tsx`:

1. Remove line 22: `const REFRESH_INTERVAL = 10_000;`

2. Change the function signature on line 24 from:
```ts
export function MetricsPage({ api }: { api: WebhookApiClient }) {
```
to:
```ts
export function MetricsPage({ api, refreshInterval }: { api: WebhookApiClient; refreshInterval: number }) {
```

3. Change line 56 from:
```ts
      intervalRef.current = setInterval(fetchMetrics, REFRESH_INTERVAL);
```
to:
```ts
      intervalRef.current = setInterval(fetchMetrics, refreshInterval);
```

4. Add `refreshInterval` to the dependency array on line 59. Change:
```ts
  }, [autoRefresh, fetchMetrics]);
```
to:
```ts
  }, [autoRefresh, fetchMetrics, refreshInterval]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd webhook-ui && npx vitest run src/__tests__/MetricsPage.test.tsx`
Expected: 9 tests PASS (8 existing + 1 new)

- [ ] **Step 6: Commit**

```bash
git add webhook-ui/src/components/MetricsPage.tsx webhook-ui/src/__tests__/MetricsPage.test.tsx
git commit -m "refactor: replace MetricsPage hardcoded interval with refreshInterval prop"
```

---

### Task 4: Wire App.tsx with settings tab and props

**Files:**
- Modify: `webhook-ui/src/App.tsx`

- [ ] **Step 1: Update App.tsx**

Replace `webhook-ui/src/App.tsx` with:

```tsx
import { useState } from 'react';
import { Page, PageSection, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import '@patternfly/react-core/dist/styles/base.css';
import { ErrorBoundary } from './ErrorBoundary';
import { WebhookTable } from './components/WebhookTable';
import { MetricsPage } from './components/MetricsPage';
import { SettingsPage } from './components/SettingsPage';
import { useSettings } from './lib/useSettings';
import { type WebhookApiClient } from './api/webhookApi';

interface AppProps {
  api: WebhookApiClient;
}

export function App({ api }: AppProps) {
  const [activeTab, setActiveTab] = useState<string | number>('webhooks');
  const { settings, updateSettings } = useSettings();

  return (
    <ErrorBoundary>
      <Page>
        <PageSection variant="light" type="tabs">
          <Tabs
            activeKey={activeTab}
            onSelect={(_event, key) => setActiveTab(key)}
            aria-label="Main navigation"
          >
            <Tab eventKey="webhooks" title={<TabTitleText>Webhooks</TabTitleText>} />
            <Tab eventKey="metrics" title={<TabTitleText>Metriche</TabTitleText>} />
            <Tab eventKey="settings" title={<TabTitleText>Impostazioni</TabTitleText>} />
          </Tabs>
        </PageSection>
        <PageSection>
          {activeTab === 'webhooks' && <WebhookTable api={api} />}
          {activeTab === 'metrics' && (
            <MetricsPage api={api} refreshInterval={settings.metricsRefreshInterval} />
          )}
          {activeTab === 'settings' && (
            <SettingsPage settings={settings} onUpdate={updateSettings} />
          )}
        </PageSection>
      </Page>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 2: Run the full unit test suite**

Run: `cd webhook-ui && npx vitest run`
Expected: All tests PASS (useSettings, SettingsPage, MetricsPage, and all other existing test files)

- [ ] **Step 3: Commit**

```bash
git add webhook-ui/src/App.tsx
git commit -m "feat: add Impostazioni tab wiring useSettings, SettingsPage, and MetricsPage"
```

---

### Task 5: E2E test

**Files:**
- Create: `e2e/tests/06-settings.spec.ts`

- [ ] **Step 1: Write E2E test**

Create `e2e/tests/06-settings.spec.ts`:

```ts
import { test, expect } from '../fixtures/ports';

test('Settings tab shows radio group with default selection', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  const settingsTab = page.getByRole('tab', { name: 'Impostazioni' });
  await expect(settingsTab).toBeVisible({ timeout: 15_000 });
  await settingsTab.click();

  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('radio', { name: '5 secondi' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '10 secondi' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '30 secondi' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '60 secondi' })).toBeVisible();

  // Default: 10 seconds
  await expect(page.getByRole('radio', { name: '10 secondi' })).toBeChecked();
});

test('Changing interval persists after page reload', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '10 secondi' })).toBeChecked({ timeout: 5_000 });

  // Change to 30 seconds
  await page.getByRole('radio', { name: '30 secondi' }).click();
  await expect(page.getByRole('radio', { name: '30 secondi' })).toBeChecked();

  // Reload and verify persistence
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '30 secondi' })).toBeChecked({ timeout: 5_000 });
});

test('Settings tab is accessible from metrics tab and back', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Navigate: Webhooks → Metriche → Impostazioni → Metriche
  await page.getByRole('tab', { name: 'Metriche' }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible({ timeout: 5_000 });

  await page.getByRole('tab', { name: 'Metriche' }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npm --prefix e2e test -- --project=chromium 06-settings`
Expected: 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/06-settings.spec.ts
git commit -m "test(e2e): add 06-settings spec for settings tab, radio group, and persistence"
```
