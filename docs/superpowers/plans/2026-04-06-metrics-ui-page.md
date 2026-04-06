# Metrics UI Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Metrics page to the webhook admin UI showing 4 metric cards (dispatches, events received, retries, queue pending) and raw Prometheus text, accessible via a horizontal tab.

**Architecture:** Parse Prometheus text on the frontend — no backend changes. New `parseMetrics` pure function extracts values via regex. New `MetricsPage` component renders cards + raw text with auto-refresh. `App.tsx` gets PatternFly `Tabs` for navigation between Webhooks and Metriche.

**Tech Stack:** React 18, PatternFly 5, TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, Testing Library

---

### Task 1: parseMetrics — pure parsing function with tests

**Files:**
- Create: `webhook-ui/src/lib/parseMetrics.ts`
- Create: `webhook-ui/src/__tests__/parseMetrics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `webhook-ui/src/__tests__/parseMetrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseMetrics } from '../lib/parseMetrics';

const REALISTIC_PROMETHEUS = `# HELP webhook_events_received_total Keycloak events received and enqueued for dispatch
# TYPE webhook_events_received_total counter
webhook_events_received_total{realm="master",event_type="access.LOGIN"} 800.0
webhook_events_received_total{realm="master",event_type="admin.USER-CREATE"} 200.0
# HELP webhook_dispatches_total HTTP send attempts completed
# TYPE webhook_dispatches_total counter
webhook_dispatches_total{realm="master",success="true"} 950.0
webhook_dispatches_total{realm="master",success="false"} 50.0
# HELP webhook_retries_total Retries scheduled via exponential backoff
# TYPE webhook_retries_total counter
webhook_retries_total{realm="master"} 43.0
# HELP webhook_retries_exhausted_total Retry chains terminated without success
# TYPE webhook_retries_exhausted_total counter
webhook_retries_exhausted_total{realm="master"} 3.0
# HELP webhook_queue_pending Tasks currently pending in the executor
# TYPE webhook_queue_pending gauge
webhook_queue_pending 0.0
`;

describe('parseMetrics', () => {
  it('parses realistic Prometheus text', () => {
    const m = parseMetrics(REALISTIC_PROMETHEUS);
    expect(m.dispatches).toBe(1000);
    expect(m.successRate).toBeCloseTo(95.0);
    expect(m.eventsReceived).toBe(1000);
    expect(m.retries).toBe(43);
    expect(m.exhausted).toBe(3);
    expect(m.queuePending).toBe(0);
  });

  it('returns null for missing metric lines', () => {
    const partial = `webhook_dispatches_total{realm="master",success="true"} 10.0
webhook_dispatches_total{realm="master",success="false"} 0.0
`;
    const m = parseMetrics(partial);
    expect(m.dispatches).toBe(10);
    expect(m.successRate).toBeCloseTo(100.0);
    expect(m.eventsReceived).toBeNull();
    expect(m.retries).toBeNull();
    expect(m.exhausted).toBeNull();
    expect(m.queuePending).toBeNull();
  });

  it('returns all null for empty string', () => {
    const m = parseMetrics('');
    expect(m.dispatches).toBeNull();
    expect(m.successRate).toBeNull();
    expect(m.eventsReceived).toBeNull();
    expect(m.retries).toBeNull();
    expect(m.exhausted).toBeNull();
    expect(m.queuePending).toBeNull();
  });

  it('computes successRate when only success="true" exists', () => {
    const text = `webhook_dispatches_total{realm="master",success="true"} 50.0\n`;
    const m = parseMetrics(text);
    expect(m.dispatches).toBe(50);
    expect(m.successRate).toBeCloseTo(100.0);
  });

  it('handles zero dispatches without dividing by zero', () => {
    const text = `webhook_dispatches_total{realm="master",success="true"} 0.0
webhook_dispatches_total{realm="master",success="false"} 0.0
`;
    const m = parseMetrics(text);
    expect(m.dispatches).toBe(0);
    expect(m.successRate).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run src/__tests__/parseMetrics.test.ts`
Expected: FAIL — module `../lib/parseMetrics` not found.

- [ ] **Step 3: Implement parseMetrics**

Create `webhook-ui/src/lib/parseMetrics.ts`:

```ts
export interface ParsedMetrics {
  dispatches: number | null;
  successRate: number | null;
  eventsReceived: number | null;
  retries: number | null;
  exhausted: number | null;
  queuePending: number | null;
}

function sumMetric(raw: string, name: string): number | null {
  const regex = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+(\\S+)`, 'gm');
  let total = 0;
  let found = false;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const val = parseFloat(match[1]!);
    if (!isNaN(val)) {
      total += val;
      found = true;
    }
  }
  return found ? total : null;
}

function sumMetricByLabel(
  raw: string,
  name: string,
  labelKey: string,
  labelValue: string,
): number | null {
  const regex = new RegExp(
    `^${name}\\{[^}]*${labelKey}="${labelValue}"[^}]*\\}\\s+(\\S+)`,
    'gm',
  );
  let total = 0;
  let found = false;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const val = parseFloat(match[1]!);
    if (!isNaN(val)) {
      total += val;
      found = true;
    }
  }
  return found ? total : null;
}

export function parseMetrics(raw: string): ParsedMetrics {
  const dispatches = sumMetric(raw, 'webhook_dispatches_total');
  const successCount = sumMetricByLabel(
    raw,
    'webhook_dispatches_total',
    'success',
    'true',
  );

  let successRate: number | null = null;
  if (dispatches !== null && dispatches > 0 && successCount !== null) {
    successRate = (successCount / dispatches) * 100;
  }

  return {
    dispatches,
    successRate,
    eventsReceived: sumMetric(raw, 'webhook_events_received_total'),
    retries: sumMetric(raw, 'webhook_retries_total'),
    exhausted: sumMetric(raw, 'webhook_retries_exhausted_total'),
    queuePending: sumMetric(raw, 'webhook_queue_pending'),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webhook-ui && npx vitest run src/__tests__/parseMetrics.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/lib/parseMetrics.ts webhook-ui/src/__tests__/parseMetrics.test.ts
git commit -m "feat: add parseMetrics pure function for Prometheus text parsing"
```

---

### Task 2: webhookApi — add getMetrics method

**Files:**
- Modify: `webhook-ui/src/api/webhookApi.ts`
- Modify: `webhook-ui/src/__tests__/webhookApi.test.ts`

**Context:** The existing `request<T>` helper always calls `res.json()`. The `/metrics` endpoint returns `text/plain`, so `getMetrics` needs to call `res.text()` directly instead of going through the generic `request` helper.

- [ ] **Step 1: Write the failing test**

In `webhook-ui/src/__tests__/webhookApi.test.ts`, add this test at the end of the `describe('webhookApi', ...)` block (after the `resendFailed` test, before the closing `});`):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webhook-ui && npx vitest run src/__tests__/webhookApi.test.ts`
Expected: FAIL — `api.getMetrics is not a function`.

- [ ] **Step 3: Implement getMetrics**

In `webhook-ui/src/api/webhookApi.ts`, add this method at the end of the return object (after `resendSingle`, before the closing `};`):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webhook-ui && npx vitest run src/__tests__/webhookApi.test.ts`
Expected: all tests PASS (including the new `getMetrics` test).

- [ ] **Step 5: Update mock APIs in existing test files**

The `WebhookApiClient` type now includes `getMetrics`. Update existing test mocks so TypeScript is satisfied.

In `webhook-ui/src/__tests__/WebhookTable.test.tsx`, add `getMetrics` to the `createMockApi` return object (after `resendFailed`):

```ts
    resendFailed: vi.fn().mockResolvedValue({ resent: 0, failed: 0, skipped: 0 }),
    getMetrics: vi.fn().mockResolvedValue(''),
  };
```

In `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx`, add `getMetrics` to the `makeApi` default return object (after `resendSingle`):

```ts
    resendSingle: vi.fn().mockResolvedValue({ httpStatus: 200, success: true, durationMs: 10 }),
    getMetrics: vi.fn().mockResolvedValue(''),
    ...overrides,
```

- [ ] **Step 6: Run all frontend tests**

Run: `cd webhook-ui && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add webhook-ui/src/api/webhookApi.ts \
       webhook-ui/src/__tests__/webhookApi.test.ts \
       webhook-ui/src/__tests__/WebhookTable.test.tsx \
       webhook-ui/src/__tests__/DeliveryDrawer.test.tsx
git commit -m "feat: add getMetrics API method for raw Prometheus text"
```

---

### Task 3: MetricsPage component with tests

**Files:**
- Create: `webhook-ui/src/components/MetricsPage.tsx`
- Create: `webhook-ui/src/__tests__/MetricsPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `webhook-ui/src/__tests__/MetricsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MetricsPage } from '../components/MetricsPage';
import type { WebhookApiClient } from '../api/webhookApi';

const SAMPLE_METRICS = `# HELP webhook_events_received_total Keycloak events received
# TYPE webhook_events_received_total counter
webhook_events_received_total{realm="master",event_type="access.LOGIN"} 1000.0
# HELP webhook_dispatches_total HTTP send attempts completed
# TYPE webhook_dispatches_total counter
webhook_dispatches_total{realm="master",success="true"} 950.0
webhook_dispatches_total{realm="master",success="false"} 50.0
# HELP webhook_retries_total Retries scheduled via exponential backoff
# TYPE webhook_retries_total counter
webhook_retries_total{realm="master"} 43.0
# HELP webhook_retries_exhausted_total Retry chains terminated without success
# TYPE webhook_retries_exhausted_total counter
webhook_retries_exhausted_total{realm="master"} 3.0
# HELP webhook_queue_pending Tasks currently pending in the executor
# TYPE webhook_queue_pending gauge
webhook_queue_pending 0.0
`;

function makeApi(overrides: Partial<WebhookApiClient> = {}): WebhookApiClient {
  return {
    list: vi.fn(),
    count: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getSecretStatus: vi.fn(),
    test: vi.fn(),
    getCircuit: vi.fn(),
    resetCircuit: vi.fn(),
    getSends: vi.fn(),
    resendFailed: vi.fn(),
    resendSingle: vi.fn(),
    getMetrics: vi.fn().mockResolvedValue(SAMPLE_METRICS),
    ...overrides,
  } as unknown as WebhookApiClient;
}

describe('MetricsPage', () => {
  let api: WebhookApiClient;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    api = makeApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows spinner on initial load', () => {
    api = makeApi({ getMetrics: vi.fn().mockReturnValue(new Promise(() => {})) });
    render(<MetricsPage api={api} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows 4 metric cards after fetch resolves', async () => {
    await act(async () => {
      render(<MetricsPage api={api} />);
    });

    await waitFor(() => {
      expect(screen.getByText('1000')).toBeInTheDocument(); // dispatches
    });
    expect(screen.getByText('1000')).toBeInTheDocument(); // events received (same value)
    expect(screen.getByText('43')).toBeInTheDocument(); // retries
    expect(screen.getByText('0')).toBeInTheDocument(); // queue pending
    expect(screen.getByText(/95\.0% success/)).toBeInTheDocument();
  });

  it('shows error alert on fetch failure', async () => {
    api = makeApi({ getMetrics: vi.fn().mockRejectedValue(new Error('Network error')) });
    await act(async () => {
      render(<MetricsPage api={api} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('Aggiorna button triggers a new fetch', async () => {
    await act(async () => {
      render(<MetricsPage api={api} />);
    });
    await waitFor(() => screen.getByText('1000'));

    expect(api.getMetrics).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /aggiorna/i }));

    await waitFor(() => {
      expect(api.getMetrics).toHaveBeenCalledTimes(2);
    });
  });

  it('auto-refresh toggle off cancels the interval', async () => {
    await act(async () => {
      render(<MetricsPage api={api} />);
    });
    await waitFor(() => screen.getByText('1000'));

    // Toggle off
    fireEvent.click(screen.getByLabelText(/auto-refresh/i));

    // Advance timer — should NOT trigger another fetch
    const callsBefore = (api.getMetrics as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(api.getMetrics).toHaveBeenCalledTimes(callsBefore);
  });

  it('auto-refresh fires fetch after interval', async () => {
    await act(async () => {
      render(<MetricsPage api={api} />);
    });
    await waitFor(() => screen.getByText('1000'));

    expect(api.getMetrics).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    await waitFor(() => {
      expect(api.getMetrics).toHaveBeenCalledTimes(2);
    });
  });

  it('shows dashes for missing metrics', async () => {
    api = makeApi({ getMetrics: vi.fn().mockResolvedValue('') });
    await act(async () => {
      render(<MetricsPage api={api} />);
    });

    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(4);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run src/__tests__/MetricsPage.test.ts`
Expected: FAIL — module `../components/MetricsPage` not found.

- [ ] **Step 3: Implement MetricsPage**

Create `webhook-ui/src/components/MetricsPage.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button,
  Switch,
  Spinner,
  Alert,
  Card,
  CardBody,
  CardTitle,
  ExpandableSection,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Title,
  Grid,
  GridItem,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import type { WebhookApiClient } from '../api/webhookApi';
import { parseMetrics, type ParsedMetrics } from '../lib/parseMetrics';

const REFRESH_INTERVAL = 10_000;

export function MetricsPage({ api }: { api: WebhookApiClient }) {
  const [metrics, setMetrics] = useState<ParsedMetrics | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchMetrics = useCallback(async () => {
    try {
      const raw = await api.getMetrics();
      setRawText(raw);
      setMetrics(parseMetrics(raw));
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchMetrics, REFRESH_INTERVAL);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, fetchMetrics]);

  const fmt = (val: number | null): string => (val !== null ? String(val) : '—');

  if (loading) {
    return <Spinner aria-label="Loading metrics" />;
  }

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Title headingLevel="h1" size="xl">
              Metriche
            </Title>
          </ToolbarItem>
          <ToolbarItem align={{ default: 'alignRight' }}>
            <Switch
              id="auto-refresh-toggle"
              label="Auto-refresh"
              isChecked={autoRefresh}
              onChange={(_event, checked) => setAutoRefresh(checked)}
              aria-label="Auto-refresh"
            />
          </ToolbarItem>
          <ToolbarItem>
            <Button variant="secondary" icon={<SyncAltIcon />} onClick={fetchMetrics}>
              Aggiorna
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {error && <Alert variant="danger" title={error} isInline style={{ marginBottom: 16 }} />}

      <Grid hasGutter>
        <GridItem span={6}>
          <Card isCompact>
            <CardTitle>Dispatches</CardTitle>
            <CardBody>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(metrics?.dispatches ?? null)}</div>
              <div
                style={{
                  color:
                    metrics?.successRate !== null && metrics?.successRate !== undefined
                      ? '#3e8635'
                      : undefined,
                }}
              >
                {metrics?.successRate !== null && metrics?.successRate !== undefined
                  ? `${metrics.successRate.toFixed(1)}% success`
                  : '—'}
              </div>
            </CardBody>
          </Card>
        </GridItem>
        <GridItem span={6}>
          <Card isCompact>
            <CardTitle>Events received</CardTitle>
            <CardBody>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {fmt(metrics?.eventsReceived ?? null)}
              </div>
              <div>across all types</div>
            </CardBody>
          </Card>
        </GridItem>
        <GridItem span={6}>
          <Card isCompact>
            <CardTitle>Retries</CardTitle>
            <CardBody>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(metrics?.retries ?? null)}</div>
              <div
                style={{
                  color:
                    metrics?.exhausted !== null &&
                    metrics?.exhausted !== undefined &&
                    metrics.exhausted > 0
                      ? '#f0ab00'
                      : '#3e8635',
                }}
              >
                {metrics?.exhausted !== null && metrics?.exhausted !== undefined
                  ? `${metrics.exhausted} exhausted`
                  : '—'}
              </div>
            </CardBody>
          </Card>
        </GridItem>
        <GridItem span={6}>
          <Card isCompact>
            <CardTitle>Queue pending</CardTitle>
            <CardBody>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {fmt(metrics?.queuePending ?? null)}
              </div>
              <div
                style={{
                  color:
                    metrics?.queuePending !== null &&
                    metrics?.queuePending !== undefined &&
                    metrics.queuePending > 0
                      ? '#f0ab00'
                      : '#3e8635',
                }}
              >
                {metrics?.queuePending !== null &&
                metrics?.queuePending !== undefined &&
                metrics.queuePending > 0
                  ? `${metrics.queuePending} pending`
                  : 'idle'}
              </div>
            </CardBody>
          </Card>
        </GridItem>
      </Grid>

      <ExpandableSection toggleText="Raw Prometheus" style={{ marginTop: 16 }}>
        <pre
          style={{
            background: '#f5f5f5',
            border: '1px solid #e8e8e8',
            borderRadius: 4,
            padding: 12,
            fontSize: 12,
            overflow: 'auto',
            maxHeight: 400,
          }}
        >
          {rawText || 'No data'}
        </pre>
      </ExpandableSection>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd webhook-ui && npx vitest run src/__tests__/MetricsPage.test.tsx`
Expected: all 7 tests PASS.

- [ ] **Step 5: Run all frontend tests**

Run: `cd webhook-ui && npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add webhook-ui/src/components/MetricsPage.tsx \
       webhook-ui/src/__tests__/MetricsPage.test.tsx
git commit -m "feat: add MetricsPage component with auto-refresh and metric cards"
```

---

### Task 4: App.tsx — add Tabs navigation

**Files:**
- Modify: `webhook-ui/src/App.tsx`

- [ ] **Step 1: Replace App.tsx with tabbed version**

Replace the entire content of `webhook-ui/src/App.tsx` with:

```tsx
import { useState } from 'react';
import { Page, PageSection, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import '@patternfly/react-core/dist/styles/base.css';
import { ErrorBoundary } from './ErrorBoundary';
import { WebhookTable } from './components/WebhookTable';
import { MetricsPage } from './components/MetricsPage';
import { type WebhookApiClient } from './api/webhookApi';

interface AppProps {
  api: WebhookApiClient;
}

export function App({ api }: AppProps) {
  const [activeTab, setActiveTab] = useState<string | number>('webhooks');

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
          </Tabs>
        </PageSection>
        <PageSection>
          {activeTab === 'webhooks' && <WebhookTable api={api} />}
          {activeTab === 'metrics' && <MetricsPage api={api} />}
        </PageSection>
      </Page>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 2: Run all frontend tests**

Run: `cd webhook-ui && npx vitest run`
Expected: all tests PASS. The `WebhookTable` tests render `WebhookTable` directly (not via `App`), so they're unaffected.

- [ ] **Step 3: Run a full build to verify TypeScript compilation**

Run: `cd webhook-ui && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add webhook-ui/src/App.tsx
git commit -m "feat: add tab navigation between Webhooks and Metriche in App.tsx"
```
