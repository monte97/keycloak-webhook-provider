# Delivery History Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a side drawer to the webhook UI that opens on row click and shows circuit breaker state, delivery history, and resend/reset actions.

**Architecture:** `DeliveryDrawer` is a pure panel component (`DrawerPanelContent`) that owns its own data loading via `api.getSends()` and `api.getCircuit()`. `WebhookTable` wraps its existing table in a PatternFly `<Drawer>` and controls `drawerWebhook` state. All backend endpoints already exist; this is frontend-only work.

**Tech Stack:** React 18, TypeScript, PatternFly v5 (`@patternfly/react-core`, `@patternfly/react-table`), Vitest + Testing Library.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `webhook-ui/src/api/types.ts` | Add `WebhookSend`, `ResendResult` |
| Modify | `webhook-ui/src/api/webhookApi.ts` | Add `getSends()`, `resendFailed()` |
| Modify | `webhook-ui/src/__tests__/webhookApi.test.ts` | Tests for new API methods |
| **Create** | `webhook-ui/src/components/DeliveryDrawer.tsx` | Panel: circuit state + sends table + actions |
| **Create** | `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx` | Unit tests for DeliveryDrawer |
| Modify | `webhook-ui/src/components/WebhookTable.tsx` | Wrap with Drawer, add row click → open drawer |

---

## Task 1: Add WebhookSend and ResendResult types

**Files:**
- Modify: `webhook-ui/src/api/types.ts`

- [ ] **Append the two interfaces** to the end of `types.ts` (before `export class ApiError`):

```ts
export interface WebhookSend {
  id: string;
  webhookId: string;
  webhookEventId: string;
  eventType: string;
  httpStatus: number;
  success: boolean;
  retries: number;
  sentAt: string;
  lastAttemptAt: string;
}

export interface ResendResult {
  resent: number;
  failed: number;
  skipped: number;
}
```

- [ ] **Commit:**

```bash
git add webhook-ui/src/api/types.ts
git commit -m "feat(ui): add WebhookSend and ResendResult types"
```

---

## Task 2: Add getSends and resendFailed to API client

**Files:**
- Modify: `webhook-ui/src/api/webhookApi.ts`
- Modify: `webhook-ui/src/__tests__/webhookApi.test.ts`

- [ ] **Write failing tests** — append inside the existing `describe('webhookApi', ...)` block in `webhookApi.test.ts`:

```ts
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
```

- [ ] **Run tests to verify they fail:**

```bash
cd webhook-ui && npm test -- --reporter=verbose 2>&1 | grep -A 2 "getSends\|resendFailed"
```

Expected: 3 FAIL — `api.getSends is not a function` / `api.resendFailed is not a function`.

- [ ] **Update the import line** at the top of `webhookApi.ts` to include the new types:

```ts
import type {
  Webhook,
  WebhookInput,
  SecretStatus,
  CircuitState,
  TestResult,
  WebhookSend,
  ResendResult,
} from './types';
```

- [ ] **Add the two methods** inside the returned object in `webhookApi.ts`, after the existing `resetCircuit` method:

```ts
getSends(
  id: string,
  params: { max?: number; success?: boolean } = {},
): Promise<WebhookSend[]> {
  const { max = 50, success } = params;
  const qs =
    success !== undefined
      ? `?first=0&max=${max}&success=${success}`
      : `?first=0&max=${max}`;
  return request(`/${id}/sends${qs}`);
},
resendFailed(id: string, hours = 24): Promise<ResendResult> {
  return request(`/${id}/resend-failed?hours=${hours}`, { method: 'POST' });
},
```

- [ ] **Run tests to verify they pass:**

```bash
cd webhook-ui && npm test -- --reporter=verbose 2>&1 | grep -A 2 "getSends\|resendFailed"
```

Expected: 3 PASS.

- [ ] **Commit:**

```bash
git add webhook-ui/src/api/webhookApi.ts webhook-ui/src/__tests__/webhookApi.test.ts
git commit -m "feat(ui): add getSends and resendFailed to API client"
```

---

## Task 3: Write failing tests for DeliveryDrawer

**Files:**
- Create: `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx`

- [ ] **Create the test file:**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeliveryDrawer } from '../components/DeliveryDrawer';
import type { Webhook, WebhookSend, CircuitState } from '../api/types';
import type { WebhookApiClient } from '../api/webhookApi';

const webhook: Webhook = {
  id: 'w1',
  url: 'https://example.com/hook',
  algorithm: 'HmacSHA256',
  enabled: true,
  eventTypes: ['*'],
  circuitState: 'CLOSED',
  failureCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
};

const successSend: WebhookSend = {
  id: 's1',
  webhookId: 'w1',
  webhookEventId: 'e1',
  eventType: 'USER',
  httpStatus: 200,
  success: true,
  retries: 0,
  sentAt: new Date(Date.now() - 60_000).toISOString(),
  lastAttemptAt: new Date(Date.now() - 60_000).toISOString(),
};

const failedSend: WebhookSend = {
  id: 's2',
  webhookId: 'w1',
  webhookEventId: 'e2',
  eventType: 'USER',
  httpStatus: 503,
  success: false,
  retries: 5,
  sentAt: new Date(Date.now() - 300_000).toISOString(),
  lastAttemptAt: new Date(Date.now() - 60_000).toISOString(),
};

const closedCircuit: CircuitState = {
  state: 'CLOSED',
  failureCount: 0,
  lastFailureAt: null,
  failureThreshold: 5,
  openSeconds: 60,
};

const openCircuit: CircuitState = {
  state: 'OPEN',
  failureCount: 5,
  lastFailureAt: new Date(Date.now() - 30_000).toISOString(),
  failureThreshold: 5,
  openSeconds: 60,
};

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
    getCircuit: vi.fn().mockResolvedValue(closedCircuit),
    resetCircuit: vi.fn().mockResolvedValue(undefined),
    getSends: vi.fn().mockResolvedValue([successSend, failedSend]),
    resendFailed: vi.fn().mockResolvedValue({ resent: 1, failed: 0, skipped: 0 }),
    ...overrides,
  } as unknown as WebhookApiClient;
}

describe('DeliveryDrawer', () => {
  let api: WebhookApiClient;
  const onClose = vi.fn();
  const onCircuitReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    api = makeApi();
  });

  it('renders sends table with success and failed rows', async () => {
    render(
      <DeliveryDrawer
        webhook={webhook}
        api={api}
        onClose={onClose}
        onCircuitReset={onCircuitReset}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText('503')).toBeInTheDocument();
    });
    expect(api.getSends).toHaveBeenCalledWith('w1', { max: 50 });
    expect(api.getCircuit).toHaveBeenCalledWith('w1');
  });

  it('renders circuit state', async () => {
    render(
      <DeliveryDrawer
        webhook={webhook}
        api={api}
        onClose={onClose}
        onCircuitReset={onCircuitReset}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('CLOSED')).toBeInTheDocument();
    });
    expect(screen.getByText(/0 failures/i)).toBeInTheDocument();
  });

  it('shows Reset circuit button when circuit is OPEN', async () => {
    api = makeApi({ getCircuit: vi.fn().mockResolvedValue(openCircuit) });
    render(
      <DeliveryDrawer
        webhook={webhook}
        api={api}
        onClose={onClose}
        onCircuitReset={onCircuitReset}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset circuit/i })).toBeInTheDocument();
    });
  });

  it('does not show Reset circuit button when circuit is CLOSED', async () => {
    render(
      <DeliveryDrawer
        webhook={webhook}
        api={api}
        onClose={onClose}
        onCircuitReset={onCircuitReset}
      />,
    );

    await waitFor(() => screen.getByText('CLOSED'));
    expect(screen.queryByRole('button', { name: /reset circuit/i })).not.toBeInTheDocument();
  });

  it('Failed filter button calls getSends with success=false', async () => {
    render(
      <DeliveryDrawer
        webhook={webhook}
        api={api}
        onClose={onClose}
        onCircuitReset={onCircuitReset}
      />,
    );

    await waitFor(() => screen.getByText('200'));
    fireEvent.click(screen.getByRole('button', { name: /^failed$/i }));

    await waitFor(() => {
      expect(api.getSends).toHaveBeenCalledWith('w1', { max: 50, success: false });
    });
  });

  it('Resend failed (24h) button calls resendFailed and reloads sends', async () => {
    render(
      <DeliveryDrawer
        webhook={webhook}
        api={api}
        onClose={onClose}
        onCircuitReset={onCircuitReset}
      />,
    );

    await waitFor(() => screen.getByText('200'));
    fireEvent.click(screen.getByRole('button', { name: /resend failed/i }));

    await waitFor(() => {
      expect(api.resendFailed).toHaveBeenCalledWith('w1', 24);
    });
    // Reloads sends after resend
    expect(api.getSends).toHaveBeenCalledTimes(2);
  });

  it('Reset circuit button calls resetCircuit and onCircuitReset', async () => {
    api = makeApi({ getCircuit: vi.fn().mockResolvedValue(openCircuit) });
    render(
      <DeliveryDrawer
        webhook={webhook}
        api={api}
        onClose={onClose}
        onCircuitReset={onCircuitReset}
      />,
    );

    await waitFor(() => screen.getByRole('button', { name: /reset circuit/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset circuit/i }));

    await waitFor(() => {
      expect(api.resetCircuit).toHaveBeenCalledWith('w1');
      expect(onCircuitReset).toHaveBeenCalledWith('w1');
    });
  });

  it('shows inline error when getSends rejects', async () => {
    api = makeApi({ getSends: vi.fn().mockRejectedValue(new Error('Network error')) });
    render(
      <DeliveryDrawer
        webhook={webhook}
        api={api}
        onClose={onClose}
        onCircuitReset={onCircuitReset}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('renders nothing when webhook is null', () => {
    const { container } = render(
      <DeliveryDrawer
        webhook={null}
        api={api}
        onClose={onClose}
        onCircuitReset={onCircuitReset}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Run tests to verify they fail:**

```bash
cd webhook-ui && npm test -- DeliveryDrawer.test --reporter=verbose 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module '../components/DeliveryDrawer'`.

- [ ] **Commit the test file:**

```bash
git add webhook-ui/src/__tests__/DeliveryDrawer.test.tsx
git commit -m "test(ui): add DeliveryDrawer tests (failing)"
```

---

## Task 4: Implement DeliveryDrawer

**Files:**
- Create: `webhook-ui/src/components/DeliveryDrawer.tsx`

- [ ] **Create the component:**

```tsx
import { useState, useEffect } from 'react';
import {
  DrawerPanelContent,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
  Button,
  Spinner,
  Alert,
  Label,
  Title,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import type { Webhook, WebhookSend, CircuitState } from '../api/types';
import type { WebhookApiClient } from '../api/webhookApi';

interface DeliveryDrawerProps {
  webhook: Webhook | null;
  api: WebhookApiClient;
  onClose: () => void;
  onCircuitReset: (id: string) => void;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function DeliveryDrawer({
  webhook,
  api,
  onClose,
  onCircuitReset,
}: DeliveryDrawerProps) {
  const [sends, setSends] = useState<WebhookSend[]>([]);
  const [circuit, setCircuit] = useState<CircuitState | null>(null);
  const [loadingSends, setLoadingSends] = useState(false);
  const [loadingCircuit, setLoadingCircuit] = useState(false);
  const [sendsError, setSendsError] = useState<string | null>(null);
  const [circuitError, setCircuitError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'failed'>('all');
  const [resending, setResending] = useState(false);
  const [resettingCircuit, setResettingCircuit] = useState(false);

  useEffect(() => {
    if (!webhook) return;
    setFilter('all');
    loadSends(webhook.id, 'all');
    loadCircuit(webhook.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook?.id]);

  const loadSends = async (id: string, f: 'all' | 'failed') => {
    setLoadingSends(true);
    setSendsError(null);
    try {
      const params =
        f === 'failed' ? { max: 50, success: false as const } : { max: 50 };
      setSends(await api.getSends(id, params));
    } catch (e) {
      setSendsError(
        e instanceof Error ? e.message : 'Failed to load delivery history',
      );
    } finally {
      setLoadingSends(false);
    }
  };

  const loadCircuit = async (id: string) => {
    setLoadingCircuit(true);
    setCircuitError(null);
    try {
      setCircuit(await api.getCircuit(id));
    } catch (e) {
      setCircuitError(
        e instanceof Error ? e.message : 'Failed to load circuit state',
      );
    } finally {
      setLoadingCircuit(false);
    }
  };

  const handleFilterAll = () => {
    setFilter('all');
    if (webhook) loadSends(webhook.id, 'all');
  };

  const handleFilterFailed = () => {
    setFilter('failed');
    if (webhook) loadSends(webhook.id, 'failed');
  };

  const handleResendFailed = async () => {
    if (!webhook) return;
    setResending(true);
    try {
      await api.resendFailed(webhook.id, 24);
      await loadSends(webhook.id, filter);
    } catch (e) {
      setSendsError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResending(false);
    }
  };

  const handleResetCircuit = async () => {
    if (!webhook) return;
    setResettingCircuit(true);
    try {
      await api.resetCircuit(webhook.id);
      await loadCircuit(webhook.id);
      onCircuitReset(webhook.id);
    } catch (e) {
      setCircuitError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setResettingCircuit(false);
    }
  };

  if (!webhook) return null;

  return (
    <DrawerPanelContent minSize="420px">
      <DrawerHead>
        <Title
          headingLevel="h2"
          size="md"
          style={{ wordBreak: 'break-all' }}
        >
          {webhook.url}
        </Title>
        <DrawerActions>
          <DrawerCloseButton onClick={onClose} />
        </DrawerActions>
      </DrawerHead>

      <div style={{ padding: '0 24px 24px' }}>
        {/* Circuit breaker section */}
        <Title headingLevel="h3" size="sm" style={{ marginBottom: 8 }}>
          Circuit breaker
        </Title>
        {loadingCircuit && (
          <Spinner size="sm" aria-label="Loading circuit state" />
        )}
        {circuitError && (
          <Alert
            variant="danger"
            isInline
            title={circuitError}
            style={{ marginBottom: 8 }}
          />
        )}
        {circuit && !loadingCircuit && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <Label
              color={
                circuit.state === 'CLOSED'
                  ? 'green'
                  : circuit.state === 'OPEN'
                    ? 'red'
                    : 'gold'
              }
            >
              {circuit.state}
            </Label>
            <span>{circuit.failureCount} failures</span>
            {circuit.lastFailureAt && (
              <span>last: {formatRelative(circuit.lastFailureAt)}</span>
            )}
            {circuit.state !== 'CLOSED' && (
              <Button
                variant="secondary"
                size="sm"
                isLoading={resettingCircuit}
                onClick={handleResetCircuit}
              >
                Reset circuit
              </Button>
            )}
          </div>
        )}

        {/* Delivery history section */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Title headingLevel="h3" size="sm">
            Delivery history
          </Title>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex' }}>
              <Button
                variant={filter === 'all' ? 'primary' : 'secondary'}
                size="sm"
                onClick={handleFilterAll}
              >
                All
              </Button>
              <Button
                variant={filter === 'failed' ? 'primary' : 'secondary'}
                size="sm"
                onClick={handleFilterFailed}
              >
                Failed
              </Button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              isLoading={resending}
              onClick={handleResendFailed}
            >
              Resend failed (24h)
            </Button>
          </div>
        </div>

        {loadingSends && <Spinner size="sm" aria-label="Loading sends" />}
        {sendsError && <Alert variant="danger" isInline title={sendsError} />}
        {!loadingSends && !sendsError && (
          <Table aria-label="Delivery history" variant="compact">
            <Thead>
              <Tr>
                <Th>Status</Th>
                <Th>HTTP</Th>
                <Th>Retries</Th>
                <Th>Sent at</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sends.length === 0 ? (
                <Tr>
                  <Td
                    colSpan={4}
                    style={{ textAlign: 'center', color: '#6a6e73' }}
                  >
                    No deliveries found
                  </Td>
                </Tr>
              ) : (
                sends.map((s) => (
                  <Tr key={s.id}>
                    <Td dataLabel="Status">
                      <Label color={s.success ? 'green' : 'red'}>
                        {s.success ? '✓' : '✗'}
                      </Label>
                    </Td>
                    <Td dataLabel="HTTP">{s.httpStatus}</Td>
                    <Td dataLabel="Retries">{s.retries}</Td>
                    <Td dataLabel="Sent at">{formatRelative(s.sentAt)}</Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        )}
      </div>
    </DrawerPanelContent>
  );
}
```

- [ ] **Run DeliveryDrawer tests:**

```bash
cd webhook-ui && npm test -- DeliveryDrawer.test --reporter=verbose 2>&1 | tail -30
```

Expected: all 9 tests PASS.

- [ ] **Run full test suite to check for regressions:**

```bash
cd webhook-ui && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Commit:**

```bash
git add webhook-ui/src/components/DeliveryDrawer.tsx
git commit -m "feat(ui): implement DeliveryDrawer component"
```

---

## Task 5: Integrate drawer into WebhookTable

**Files:**
- Modify: `webhook-ui/src/components/WebhookTable.tsx`

- [ ] **Add Drawer imports** to the existing `@patternfly/react-core` import block:

```tsx
import {
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Button,
  EmptyState,
  EmptyStateHeader,
  EmptyStateBody,
  EmptyStateIcon,
  Alert,
  AlertGroup,
  AlertActionCloseButton,
  Modal,
  ModalVariant,
  Switch,
  Tooltip,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  Title,
  Drawer,
  DrawerContent,
  DrawerContentBody,
} from '@patternfly/react-core';
```

- [ ] **Add `DeliveryDrawer` import** after the existing component imports:

```tsx
import { DeliveryDrawer } from './DeliveryDrawer';
```

- [ ] **Add `drawerWebhook` state** inside `WebhookTable`, after existing state declarations:

```tsx
const [drawerWebhook, setDrawerWebhook] = useState<Webhook | null>(null);
```

- [ ] **Update `fetchWebhooks`** to keep the drawer webhook in sync with fresh data (so the URL shown in the drawer header stays current on poll):

```tsx
const fetchWebhooks = useCallback(async () => {
  try {
    const data = await api.list();
    setWebhooks(data);
    setDrawerWebhook((prev) =>
      prev ? (data.find((w) => w.id === prev.id) ?? prev) : null,
    );
  } catch {
    // Silently fail on poll errors
  } finally {
    setLoading(false);
  }
}, [api]);
```

- [ ] **Replace the main `return (` block** (the one that starts after the empty-state guard, beginning with `return (` then `<>`) with the following. The `AlertGroup`, modals, and `WebhookModal` remain outside the `Drawer`; only the toolbar + table go inside `DrawerContentBody`. Add `onClick={(e) => e.stopPropagation()}` to the Enabled and Actions cells to prevent row-click from firing when toggling or opening the kebab menu:

```tsx
return (
  <>
    <AlertGroup isToast isLiveRegion>
      {alerts.map((a) => (
        <Alert
          key={a.key}
          variant={a.variant}
          title={a.title}
          actionClose={
            <AlertActionCloseButton
              onClose={() => setAlerts((prev) => prev.filter((x) => x.key !== a.key))}
            />
          }
        />
      ))}
    </AlertGroup>

    <Drawer isExpanded={drawerWebhook !== null} position="right">
      <DrawerContent
        panelContent={
          <DeliveryDrawer
            webhook={drawerWebhook}
            api={api}
            onClose={() => setDrawerWebhook(null)}
            onCircuitReset={handleCircuitReset}
          />
        }
      >
        <DrawerContentBody>
          <Toolbar>
            <ToolbarContent>
              <ToolbarItem>
                <Title headingLevel="h1" size="xl">
                  Webhooks
                </Title>
              </ToolbarItem>
              <ToolbarItem align={{ default: 'alignRight' }}>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleCreate}>
                  Create webhook
                </Button>
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>

          <Table aria-label="Webhooks">
            <Thead>
              <Tr>
                <Th>URL</Th>
                <Th>Enabled</Th>
                <Th>Circuit</Th>
                <Th>Events</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {webhooks.map((wh) => (
                <Tr
                  key={wh.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDrawerWebhook(wh)}
                >
                  <Td dataLabel="URL">
                    <Tooltip content={wh.url}>
                      <span
                        style={{
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'inline-block',
                        }}
                      >
                        {wh.url}
                      </span>
                    </Tooltip>
                  </Td>
                  <Td dataLabel="Enabled" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      isChecked={wh.enabled}
                      onChange={() => handleToggleEnabled(wh)}
                      isDisabled={readOnly}
                      aria-label={`Toggle ${wh.url}`}
                    />
                  </Td>
                  <Td dataLabel="Circuit">
                    <CircuitBadge
                      state={wh.circuitState}
                      failureCount={wh.failureCount}
                      webhookId={wh.id}
                      onReset={handleCircuitReset}
                    />
                  </Td>
                  <Td dataLabel="Events">
                    <Tooltip content={wh.eventTypes.join(', ')}>
                      <span>
                        {wh.eventTypes.length} event
                        {wh.eventTypes.length !== 1 ? 's' : ''}
                      </span>
                    </Tooltip>
                  </Td>
                  <Td dataLabel="Actions" onClick={(e) => e.stopPropagation()}>
                    <Dropdown
                      isOpen={openKebab === wh.id}
                      onSelect={() => setOpenKebab(null)}
                      onOpenChange={(open) => setOpenKebab(open ? wh.id : null)}
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef}
                          variant="plain"
                          onClick={() =>
                            setOpenKebab(openKebab === wh.id ? null : wh.id)
                          }
                          aria-label="Actions"
                        >
                          <EllipsisVIcon />
                        </MenuToggle>
                      )}
                      popperProps={{ position: 'right' }}
                    >
                      <DropdownList>
                        <DropdownItem key="edit" onClick={() => handleEdit(wh)}>
                          Edit
                        </DropdownItem>
                        <DropdownItem key="test" onClick={() => handleTest(wh)}>
                          Test ping
                        </DropdownItem>
                        <DropdownItem
                          key="delete"
                          onClick={() => setDeleteTarget(wh)}
                          isDanger
                        >
                          Delete
                        </DropdownItem>
                      </DropdownList>
                    </Dropdown>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>

    <WebhookModal
      mode={modalMode}
      isOpen={modalOpen}
      webhook={editingWebhook}
      secretConfigured={secretStatus}
      onSave={handleSave}
      onClose={() => setModalOpen(false)}
    />

    <Modal
      variant={ModalVariant.small}
      title="Delete webhook"
      isOpen={deleteTarget !== null}
      onClose={() => setDeleteTarget(null)}
      actions={[
        <Button key="delete" variant="danger" onClick={handleDelete}>
          Delete
        </Button>,
        <Button key="cancel" variant="link" onClick={() => setDeleteTarget(null)}>
          Cancel
        </Button>,
      ]}
    >
      Delete webhook to <strong>{deleteTarget?.url}</strong>? This cannot be undone.
    </Modal>
  </>
);
```

- [ ] **Run full test suite:**

```bash
cd webhook-ui && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Commit:**

```bash
git add webhook-ui/src/components/WebhookTable.tsx
git commit -m "feat(ui): integrate delivery history drawer into webhook table"
```

---

## Task 6: Build and smoke test

- [ ] **TypeScript build:**

```bash
cd webhook-ui && npm run build 2>&1 | tail -20
```

Expected: build completes with no errors, `dist/` created.

- [ ] **If any TS errors**, fix them and re-run build. Then commit the fix:

```bash
git add webhook-ui/src/
git commit -m "fix(ui): resolve TS build errors in DeliveryDrawer integration"
```

- [ ] **Run the demo stack** and verify the drawer opens when clicking a webhook row, shows delivery history and circuit state, and the filter/resend/reset buttons work:

```bash
cd demo && make up
# wait ~90s, then open the Webhook Admin UI URL from: make urls
```

Click any webhook row → confirm drawer opens on the right with sends table and circuit section.
