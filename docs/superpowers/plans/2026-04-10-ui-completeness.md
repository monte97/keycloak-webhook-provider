# UI Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 4 frontend gaps — events tab in DeliveryDrawer, webhook list pagination, createdAt display in drawer, rotation expiry display in drawer.

**Architecture:** Frontend-only changes. No backend modifications. All changes follow existing PatternFly v5 patterns. DeliveryDrawer gains a Tabs layout; WebhookTable gains paginated list calls.

**Tech Stack:** React, PatternFly v5, Vitest + Testing Library, Playwright (e2e).

---

## File Map

| File | Change |
|------|--------|
| `webhook-ui/src/api/types.ts` | Add `WebhookEvent` interface |
| `webhook-ui/src/api/webhookApi.ts` | Add `getEvents` method |
| `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx` | Update mock + new tests for events tab, createdAt, rotation expiry |
| `webhook-ui/src/components/DeliveryDrawer.tsx` | Events tab, createdAt, rotation expiry |
| `webhook-ui/src/__tests__/WebhookTable.test.tsx` | New pagination tests |
| `webhook-ui/src/components/WebhookTable.tsx` | Paginated list calls + Prev/Next controls |
| `e2e/tests/10-ui-completeness.spec.ts` | New e2e test |

---

### Task 1: Add WebhookEvent type and getEvents API method

**Files:**
- Modify: `webhook-ui/src/api/types.ts`
- Modify: `webhook-ui/src/api/webhookApi.ts`
- Modify: `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx` (update mock to include new methods)

This task has no new failing tests — it's a foundational data-layer step. The component tests in Tasks 2 and 3 will validate it. Run the existing suite after to confirm nothing breaks.

- [ ] **Step 1: Add `WebhookEvent` to `types.ts`**

In `webhook-ui/src/api/types.ts`, add after the `SendPayload` interface (after line 83):

```ts
export interface WebhookEvent {
  id: string;
  realmId: string;
  eventType: 'USER' | 'ADMIN';
  kcEventId: string | null;
  eventObject: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add `getEvents` to `webhookApi.ts`**

In `webhook-ui/src/api/webhookApi.ts`, add `WebhookEvent` to the import block (line 1–14):

```ts
import type {
  Webhook,
  WebhookInput,
  SecretStatus,
  CircuitState,
  TestResult,
  WebhookSend,
  ResendResult,
  SendResult,
  RotateSecretRequest,
  RotateSecretResponse,
  SendPayload,
  RealmSettings,
  WebhookEvent,
} from './types';
```

Then add `getEvents` in the returned object, after `getSendPayload` (after line 102):

```ts
    getEvents(
      id: string,
      params: { first?: number; max?: number } = {},
    ): Promise<WebhookEvent[]> {
      const { first = 0, max = 20 } = params;
      return request(`/${id}/events?first=${first}&max=${max}`);
    },
```

- [ ] **Step 3: Update `makeApi` mock in `DeliveryDrawer.test.tsx`**

In `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx`, add `WebhookEvent` to the import (line 5):

```ts
import type { Webhook, WebhookSend, CircuitState, WebhookEvent } from '../api/types';
```

Then add the two missing methods to `makeApi` (after `completeRotation`, before `...overrides`):

```ts
    getSendPayload: vi.fn().mockResolvedValue({ eventObject: '{"realmId":"demo"}' }),
    getEvents: vi.fn().mockResolvedValue([]),
    getRealmSettings: vi.fn(),
    updateRealmSettings: vi.fn(),
```

The full updated `makeApi` body becomes:

```ts
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
    resendSingle: vi.fn().mockResolvedValue({ httpStatus: 200, success: true, durationMs: 10 }),
    getMetrics: vi.fn().mockResolvedValue(''),
    rotateSecret: vi.fn().mockResolvedValue({ newSecret: 'abc123', rotationExpiresAt: null, mode: 'graceful' }),
    completeRotation: vi.fn().mockResolvedValue(undefined),
    getSendPayload: vi.fn().mockResolvedValue({ eventObject: '{"realmId":"demo"}' }),
    getEvents: vi.fn().mockResolvedValue([]),
    getRealmSettings: vi.fn(),
    updateRealmSettings: vi.fn(),
    ...overrides,
  } as unknown as WebhookApiClient;
}
```

- [ ] **Step 4: Run existing tests to verify nothing broke**

```bash
cd webhook-ui && npm test -- --run
```

Expected: all existing tests pass (currently 111).

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/api/types.ts webhook-ui/src/api/webhookApi.ts webhook-ui/src/__tests__/DeliveryDrawer.test.tsx
git commit -m "feat: add WebhookEvent type and getEvents API method"
```

---

### Task 2: Events tab in DeliveryDrawer (TDD)

**Files:**
- Modify: `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx` (new tests)
- Modify: `webhook-ui/src/components/DeliveryDrawer.tsx` (implementation)

- [ ] **Step 1: Write failing tests**

Add a new `describe('Events tab', ...)` block at the end of `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx`, before the closing `});` of the outer describe:

```ts
  describe('Events tab', () => {
    const mockEvent: WebhookEvent = {
      id: 'ev1',
      realmId: 'demo',
      eventType: 'USER',
      kcEventId: 'kc1',
      eventObject: '{"realmId":"demo","type":"LOGIN"}',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    };

    it('renders Delivery history and Events tabs', async () => {
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /delivery history/i }));
      expect(screen.getByRole('tab', { name: /events/i })).toBeInTheDocument();
    });

    it('getEvents is NOT called on drawer open', async () => {
      const getEvents = vi.fn().mockResolvedValue([]);
      const localApi = makeApi({ getEvents });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /delivery history/i }));
      expect(getEvents).not.toHaveBeenCalled();
    });

    it('clicking Events tab calls getEvents with first=0 and max=pageSize', async () => {
      const getEvents = vi.fn().mockResolvedValue([mockEvent]);
      const localApi = makeApi({ getEvents });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /events/i }));
      fireEvent.click(screen.getByRole('tab', { name: /events/i }));
      await waitFor(() => {
        expect(getEvents).toHaveBeenCalledWith('w1', { first: 0, max: 50 });
      });
    });

    it('renders event rows with eventType and relative time', async () => {
      const localApi = makeApi({ getEvents: vi.fn().mockResolvedValue([mockEvent]) });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /events/i }));
      fireEvent.click(screen.getByRole('tab', { name: /events/i }));
      await waitFor(() => {
        expect(screen.getByText('USER')).toBeInTheDocument();
        expect(screen.getByText(/ago/)).toBeInTheDocument();
      });
    });

    it('clicking Payload on event row opens PayloadPreviewModal', async () => {
      const localApi = makeApi({ getEvents: vi.fn().mockResolvedValue([mockEvent]) });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /events/i }));
      fireEvent.click(screen.getByRole('tab', { name: /events/i }));
      await waitFor(() => screen.getByText('USER'));
      fireEvent.click(screen.getByRole('button', { name: /^payload$/i }));
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /event payload/i })).toBeInTheDocument();
      });
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd webhook-ui && npm test -- --run --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|Events tab)"
```

Expected: 5 new tests fail with "Unable to find role='tab'" or similar.

- [ ] **Step 3: Implement the Events tab in `DeliveryDrawer.tsx`**

Replace the full content of `webhook-ui/src/components/DeliveryDrawer.tsx` with:

```tsx
import { useState, useEffect, useRef } from 'react';
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
  Modal,
  ModalVariant,
  Checkbox,
  Tabs,
  Tab,
  TabTitleText,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import type { Webhook, WebhookSend, CircuitState, WebhookEvent } from '../api/types';
import type { WebhookApiClient } from '../api/webhookApi';
import { SecretRotationModal } from './SecretRotationModal';
import { SecretDisclosureModal } from './SecretDisclosureModal';
import { PayloadPreviewModal } from './PayloadPreviewModal';

interface DeliveryDrawerProps {
  webhook: Webhook | null;
  api: WebhookApiClient;
  onClose: () => void;
  onCircuitReset: (id: string) => void;
  onWebhookChange?: () => void;
  pageSize: number;
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
  onWebhookChange,
  pageSize,
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
  const [resendingSendId, setResendingSendId] = useState<string | null>(null);
  const [confirmResendId, setConfirmResendId] = useState<string | null>(null);
  const [forceResend, setForceResend] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const prevPageSizeRef = useRef(pageSize);

  const [rotationModalMode, setRotationModalMode] = useState<'graceful' | 'emergency' | null>(null);
  const [disclosedSecret, setDisclosedSecret] = useState<string | null>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);

  const [payloadEventObject, setPayloadEventObject] = useState<string | null>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [loadingPayloadId, setLoadingPayloadId] = useState<string | null>(null);

  // Events tab state
  const [activeTab, setActiveTab] = useState<string>('deliveries');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  const isRotating = !!webhook?.hasSecondarySecret;

  useEffect(() => {
    if (!webhook) return;
    setFilter('all');
    setCurrentPage(1);
    setActiveTab('deliveries');
    setEventsPage(1);
    setEventsLoaded(false);
    setEvents([]);
    loadSends(webhook.id, 'all', 1);
    loadCircuit(webhook.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook?.id]);

  useEffect(() => {
    if (prevPageSizeRef.current === pageSize) return;
    prevPageSizeRef.current = pageSize;
    if (!webhook) return;
    setCurrentPage(1);
    loadSends(webhook.id, filter, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  const loadSends = async (id: string, f: 'all' | 'failed', page: number) => {
    setLoadingSends(true);
    setSendsError(null);
    try {
      const first = (page - 1) * pageSize;
      const params =
        f === 'failed'
          ? { first, max: pageSize, success: false as const }
          : { first, max: pageSize };
      const result = await api.getSends(id, params);
      setSends(result);
      setHasMore(result.length === pageSize);
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

  const loadEvents = async (id: string, page: number) => {
    setLoadingEvents(true);
    setEventsError(null);
    try {
      const first = (page - 1) * pageSize;
      const result = await api.getEvents(id, { first, max: pageSize });
      setEvents(result);
      setEventsHasMore(result.length === pageSize);
      setEventsLoaded(true);
    } catch (e) {
      setEventsError(e instanceof Error ? e.message : 'Failed to load events');
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleTabChange = (_event: React.MouseEvent<HTMLElement>, tabKey: string | number) => {
    const key = String(tabKey);
    setActiveTab(key);
    if (key === 'events' && !eventsLoaded && webhook) {
      loadEvents(webhook.id, 1);
    }
  };

  const handleFilterAll = () => {
    setFilter('all');
    setCurrentPage(1);
    if (webhook) loadSends(webhook.id, 'all', 1);
  };

  const handleFilterFailed = () => {
    setFilter('failed');
    setCurrentPage(1);
    if (webhook) loadSends(webhook.id, 'failed', 1);
  };

  const handleResendFailed = async () => {
    if (!webhook) return;
    setResending(true);
    try {
      await api.resendFailed(webhook.id, 24);
      await loadSends(webhook.id, filter, currentPage);
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

  const handleResendSingle = async (sendId: string) => {
    if (!webhook) return;
    if (circuit?.state === 'OPEN') {
      setConfirmResendId(sendId);
      setForceResend(false);
      return;
    }
    setResendingSendId(sendId);
    try {
      await api.resendSingle(webhook.id, sendId, false);
      await loadSends(webhook.id, filter, currentPage);
    } catch (e) {
      setSendsError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResendingSendId(null);
    }
  };

  const handleConfirmResend = async () => {
    if (!webhook || !confirmResendId) return;
    setConfirmResendId(null);
    setResendingSendId(confirmResendId);
    try {
      await api.resendSingle(webhook.id, confirmResendId, forceResend);
      await loadSends(webhook.id, filter, currentPage);
    } catch (e) {
      setSendsError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResendingSendId(null);
    }
  };

  const handleRotate = async (args: { graceDays?: number }) => {
    if (!webhook) return;
    setRotationError(null);
    try {
      const resp = await api.rotateSecret(webhook.id, {
        mode: rotationModalMode!,
        graceDays: args.graceDays,
      });
      setRotationModalMode(null);
      setDisclosedSecret(resp.newSecret);
      onWebhookChange?.();
    } catch (e) {
      setRotationError(String(e));
    }
  };

  const handleCompleteRotation = async () => {
    if (!webhook) return;
    try {
      await api.completeRotation(webhook.id);
      onWebhookChange?.();
    } catch (e) {
      setRotationError(String(e));
    }
  };

  const handleViewPayload = async (sendId: string) => {
    setLoadingPayloadId(sendId);
    setPayloadEventObject(null);
    setPayloadError(null);
    try {
      const result = await api.getSendPayload(webhook!.id, sendId);
      setPayloadEventObject(result.eventObject);
    } catch (e) {
      setPayloadError(e instanceof Error ? e.message : 'Failed to load payload');
    } finally {
      setLoadingPayloadId(null);
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
        <div style={{ fontSize: '0.875rem', color: '#6a6e73', marginTop: 4 }}>
          Created {formatRelative(webhook.createdAt)}
        </div>
        <DrawerActions>
          <DrawerCloseButton onClick={onClose} />
        </DrawerActions>
      </DrawerHead>

      <div style={{ padding: '0 24px 24px' }}>
        {/* Secret section */}
        <div style={{ marginBottom: 'var(--pf-v5-global--spacer--md)' }}>
          <strong>Secret</strong>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isRotating ? (
              <Label color="green">Active</Label>
            ) : (
              <>
                <Label color="orange">Rotating</Label>
                {webhook.rotationExpiresAt && (
                  <span style={{ fontSize: '0.875rem', color: '#6a6e73' }}>
                    expires {formatRelative(webhook.rotationExpiresAt)}
                  </span>
                )}
              </>
            )}
          </div>
          <div style={{ marginTop: '8px', display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              onClick={() => setRotationModalMode('graceful')}
              isDisabled={isRotating}
            >
              Rotate secret
            </Button>
            {isRotating && (
              <Button variant="secondary" onClick={handleCompleteRotation}>
                Complete rotation now
              </Button>
            )}
            <Button variant="danger" onClick={() => setRotationModalMode('emergency')}>
              Emergency rotate
            </Button>
          </div>
          {rotationError && (
            <div style={{ color: 'red', marginTop: '8px' }}>{rotationError}</div>
          )}
        </div>

        {/* Circuit breaker section */}
        <Title headingLevel="h3" size="md" style={{ marginBottom: 8 }}>
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

        {/* Tabs: Deliveries / Events */}
        <Tabs activeKey={activeTab} onSelect={handleTabChange} style={{ marginTop: 8 }}>
          <Tab eventKey="deliveries" title={<TabTitleText>Delivery history</TabTitleText>}>
            <div style={{ paddingTop: 12 }}>
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
                <>
                  <Table aria-label="Delivery history" variant="compact">
                    <Thead>
                      <Tr>
                        <Th>Status</Th>
                        <Th>HTTP</Th>
                        <Th>Retries</Th>
                        <Th>Sent at</Th>
                        <Th>Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {sends.length === 0 ? (
                        <Tr>
                          <Td
                            colSpan={5}
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
                            <Td dataLabel="Actions">
                              <Button
                                variant="link"
                                size="sm"
                                isLoading={resendingSendId === s.id}
                                isDisabled={resendingSendId !== null || confirmResendId !== null}
                                onClick={() => handleResendSingle(s.id)}
                              >
                                Resend
                              </Button>
                              <Button
                                variant="link"
                                size="sm"
                                isLoading={loadingPayloadId === s.id}
                                isDisabled={loadingPayloadId !== null}
                                onClick={() => handleViewPayload(s.id)}
                              >
                                Payload
                              </Button>
                            </Td>
                          </Tr>
                        ))
                      )}
                    </Tbody>
                  </Table>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <Button
                      variant="secondary"
                      isDisabled={currentPage === 1 || loadingSends}
                      onClick={() => {
                        const p = currentPage - 1;
                        setCurrentPage(p);
                        loadSends(webhook.id, filter, p);
                      }}
                    >
                      ← Prev
                    </Button>
                    <span>Pagina {currentPage}</span>
                    <Button
                      variant="secondary"
                      isDisabled={!hasMore || loadingSends}
                      onClick={() => {
                        const p = currentPage + 1;
                        setCurrentPage(p);
                        loadSends(webhook.id, filter, p);
                      }}
                    >
                      Next →
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Tab>

          <Tab eventKey="events" title={<TabTitleText>Events</TabTitleText>}>
            <div style={{ paddingTop: 12 }}>
              {loadingEvents && <Spinner size="sm" aria-label="Loading events" />}
              {eventsError && <Alert variant="danger" isInline title={eventsError} />}
              {!loadingEvents && !eventsError && eventsLoaded && (
                <>
                  <Table aria-label="Event history" variant="compact">
                    <Thead>
                      <Tr>
                        <Th>Event type</Th>
                        <Th>Captured at</Th>
                        <Th>Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {events.length === 0 ? (
                        <Tr>
                          <Td
                            colSpan={3}
                            style={{ textAlign: 'center', color: '#6a6e73' }}
                          >
                            No events found
                          </Td>
                        </Tr>
                      ) : (
                        events.map((ev) => (
                          <Tr key={ev.id}>
                            <Td dataLabel="Event type">{ev.eventType}</Td>
                            <Td dataLabel="Captured at">{formatRelative(ev.createdAt)}</Td>
                            <Td dataLabel="Actions">
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => setPayloadEventObject(ev.eventObject)}
                              >
                                Payload
                              </Button>
                            </Td>
                          </Tr>
                        ))
                      )}
                    </Tbody>
                  </Table>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <Button
                      variant="secondary"
                      isDisabled={eventsPage === 1 || loadingEvents}
                      onClick={() => {
                        const p = eventsPage - 1;
                        setEventsPage(p);
                        loadEvents(webhook.id, p);
                      }}
                    >
                      ← Prev
                    </Button>
                    <span>Pagina {eventsPage}</span>
                    <Button
                      variant="secondary"
                      isDisabled={!eventsHasMore || loadingEvents}
                      onClick={() => {
                        const p = eventsPage + 1;
                        setEventsPage(p);
                        loadEvents(webhook.id, p);
                      }}
                    >
                      Next →
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Tab>
        </Tabs>
      </div>

      {confirmResendId !== null && (
        <Modal
          variant={ModalVariant.small}
          title="Confirm resend"
          isOpen
          onClose={() => setConfirmResendId(null)}
          actions={[
            <Button key="confirm" variant="primary" onClick={handleConfirmResend}>
              Confirm resend
            </Button>,
            <Button key="cancel" variant="link" onClick={() => setConfirmResendId(null)}>
              Cancel
            </Button>,
          ]}
        >
          <Alert
            variant="warning"
            isInline
            title="The circuit breaker is currently OPEN. The endpoint may still be unreachable."
            style={{ marginBottom: 16 }}
          />
          <Checkbox
            id="force-resend"
            label="Force send anyway"
            isChecked={forceResend}
            onChange={(_event, checked) => setForceResend(checked)}
          />
        </Modal>
      )}

      {rotationModalMode && (
        <SecretRotationModal
          mode={rotationModalMode}
          isOpen
          onConfirm={handleRotate}
          onClose={() => setRotationModalMode(null)}
        />
      )}

      {disclosedSecret && (
        <SecretDisclosureModal
          isOpen
          newSecret={disclosedSecret}
          onClose={() => setDisclosedSecret(null)}
        />
      )}

      {(payloadEventObject !== null || payloadError !== null) && (
        <PayloadPreviewModal
          isOpen
          eventObject={payloadEventObject}
          errorMessage={payloadError}
          onClose={() => {
            setPayloadEventObject(null);
            setPayloadError(null);
          }}
        />
      )}
    </DrawerPanelContent>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd webhook-ui && npm test -- --run
```

Expected: all tests pass (at least 116 — 111 previous + 5 new).

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/components/DeliveryDrawer.tsx webhook-ui/src/__tests__/DeliveryDrawer.test.tsx
git commit -m "feat(ui): add Events tab to DeliveryDrawer"
```

---

### Task 3: createdAt and rotation expiry in DeliveryDrawer (TDD)

**Files:**
- Modify: `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx` (new tests)
- No implementation change needed — Task 2 already includes the implementation.

The implementation for this task was included in the full DeliveryDrawer rewrite in Task 2 (the `Created {formatRelative(webhook.createdAt)}` div in DrawerHead, and the rotation expiry span in the secret section). This task just adds the test coverage.

- [ ] **Step 1: Write failing tests (run before Task 2 implementation is complete)**

If implementing tasks sequentially, this step may already pass after Task 2. Add these tests BEFORE Task 2 implementation to observe the red state. Add inside `describe('DeliveryDrawer', ...)` at the end:

```ts
  describe('createdAt and rotation info', () => {
    it('shows "Created" date in drawer header', async () => {
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('200'));
      expect(screen.getByText(/created/i)).toBeInTheDocument();
    });

    it('shows rotation expiry when rotationExpiresAt is set', async () => {
      const rotatingWebhook: Webhook = {
        ...webhook,
        hasSecondarySecret: true,
        rotationExpiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        rotationStartedAt: new Date(Date.now() - 60_000).toISOString(),
      };
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={rotatingWebhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('200'));
      expect(screen.getByText(/expires/i)).toBeInTheDocument();
    });

    it('does not show rotation expiry when rotationExpiresAt is null', async () => {
      const rotatingWebhook: Webhook = {
        ...webhook,
        hasSecondarySecret: true,
        rotationExpiresAt: null,
        rotationStartedAt: new Date(Date.now() - 60_000).toISOString(),
      };
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={rotatingWebhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('200'));
      expect(screen.queryByText(/expires/i)).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass (implementation already in Task 2)**

```bash
cd webhook-ui && npm test -- --run
```

Expected: all tests pass (at least 119 — previous + 3 new).

- [ ] **Step 3: Commit**

```bash
git add webhook-ui/src/__tests__/DeliveryDrawer.test.tsx
git commit -m "test(ui): add tests for createdAt and rotation expiry in DeliveryDrawer"
```

---

### Task 4: Webhook list pagination (TDD)

**Files:**
- Modify: `webhook-ui/src/__tests__/WebhookTable.test.tsx` (new tests)
- Modify: `webhook-ui/src/components/WebhookTable.tsx` (implementation)

- [ ] **Step 1: Write failing pagination tests**

Add a new `describe('pagination', ...)` block at the end of `webhook-ui/src/__tests__/WebhookTable.test.tsx`, before the closing `});`:

```ts
  describe('pagination', () => {
    it('calls api.list with first=0 and max=20 on initial load', async () => {
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      expect(api.list).toHaveBeenCalledWith(0, 20);
    });

    it('Next button is disabled when result has fewer than 20 items', async () => {
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      await screen.findByText('https://api.example.com/webhook');
      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('Next button is enabled when result has exactly 20 items', async () => {
      const twentyWebhooks = Array.from({ length: 20 }, (_, i) => ({
        ...mockWebhooks[0]!,
        id: String(i),
        url: `https://example.com/hook-${i}`,
      }));
      api = createMockApi(twentyWebhooks);
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      await screen.findByText('https://example.com/hook-0');
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });

    it('Prev button is disabled on page 1', async () => {
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      await screen.findByText('https://api.example.com/webhook');
      expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    });

    it('clicking Next calls api.list with first=20 and max=20', async () => {
      const twentyWebhooks = Array.from({ length: 20 }, (_, i) => ({
        ...mockWebhooks[0]!,
        id: String(i),
        url: `https://example.com/hook-${i}`,
      }));
      api = createMockApi(twentyWebhooks);
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      await screen.findByText('https://example.com/hook-0');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
      });
      await waitFor(() => {
        expect(api.list).toHaveBeenCalledWith(20, 20);
      });
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd webhook-ui && npm test -- --run --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|pagination)"
```

Expected: 5 new pagination tests fail (api.list called with wrong args, buttons not found).

- [ ] **Step 3: Implement pagination in `WebhookTable.tsx`**

Add `PAGE_SIZE` constant and `currentPageRef` import after the existing imports. Replace the opening of the `WebhookTable` function body through the `fetchWebhooks` callback and its `useEffect`, keeping everything else unchanged:

```tsx
const PAGE_SIZE = 20;

export function WebhookTable({ api, defaults, pageSize }: { api: WebhookApiClient; defaults?: WebhookDefaults; pageSize: number }) {
  const alertKeyRef = useRef(0);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingWebhook, setEditingWebhook] = useState<Webhook | undefined>();
  const [secretStatus, setSecretStatus] = useState<boolean | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [openKebab, setOpenKebab] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [drawerWebhook, setDrawerWebhook] = useState<Webhook | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const currentPageRef = useRef(1);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchWebhooks = useCallback(async (page?: number) => {
    const p = page ?? currentPageRef.current;
    try {
      const first = (p - 1) * PAGE_SIZE;
      const data = await api.list(first, PAGE_SIZE);
      setWebhooks(data);
      setHasMore(data.length === PAGE_SIZE);
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

The `useEffect` and the rest of the function body remain the same, except:
- Change `if (loading) return null;` condition to also allow through when on page > 1 with no results:

```tsx
  if (loading) return null;

  if (webhooks.length === 0 && currentPage === 1) {
```

- Add pagination controls below `</Table>` (after the closing `</Tbody>` tag), inside `<DrawerContentBody>`:

```tsx
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, padding: '0 16px' }}>
              <Button
                variant="secondary"
                isDisabled={currentPage === 1 || loading}
                onClick={() => {
                  const p = currentPage - 1;
                  setCurrentPage(p);
                  currentPageRef.current = p;
                  fetchWebhooks(p);
                }}
              >
                ← Prev
              </Button>
              <span>Pagina {currentPage}</span>
              <Button
                variant="secondary"
                isDisabled={!hasMore || loading}
                onClick={() => {
                  const p = currentPage + 1;
                  setCurrentPage(p);
                  currentPageRef.current = p;
                  fetchWebhooks(p);
                }}
              >
                Next →
              </Button>
            </div>
```

The complete updated `WebhookTable.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
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
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { PlusCircleIcon, CubesIcon, EllipsisVIcon } from '@patternfly/react-icons';
import { ApiError } from '../api/types';
import type { Webhook, WebhookInput } from '../api/types';
import type { WebhookApiClient } from '../api/webhookApi';
import type { WebhookDefaults } from '../lib/useSettings';
import { CircuitBadge } from './CircuitBadge';
import { WebhookModal } from './WebhookModal';
import { DeliveryDrawer } from './DeliveryDrawer';

interface AlertItem {
  key: number;
  variant: 'success' | 'danger';
  title: string;
}

const POLL_INTERVAL = 30_000;
const PAGE_SIZE = 20;

export function WebhookTable({ api, defaults, pageSize }: { api: WebhookApiClient; defaults?: WebhookDefaults; pageSize: number }) {
  const alertKeyRef = useRef(0);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingWebhook, setEditingWebhook] = useState<Webhook | undefined>();
  const [secretStatus, setSecretStatus] = useState<boolean | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [openKebab, setOpenKebab] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [drawerWebhook, setDrawerWebhook] = useState<Webhook | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const currentPageRef = useRef(1);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchWebhooks = useCallback(async (page?: number) => {
    const p = page ?? currentPageRef.current;
    try {
      const first = (p - 1) * PAGE_SIZE;
      const data = await api.list(first, PAGE_SIZE);
      setWebhooks(data);
      setHasMore(data.length === PAGE_SIZE);
      setDrawerWebhook((prev) =>
        prev ? (data.find((w) => w.id === prev.id) ?? prev) : null,
      );
    } catch {
      // Silently fail on poll errors
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchWebhooks();
    pollRef.current = setInterval(() => {
      if (!document.hidden) fetchWebhooks();
    }, POLL_INTERVAL);
    const onVisibility = () => {
      if (!document.hidden) fetchWebhooks();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchWebhooks]);

  const addAlert = (variant: AlertItem['variant'], title: string) => {
    const key = ++alertKeyRef.current;
    setAlerts((prev) => [...prev, { key, variant, title }]);
    setTimeout(() => setAlerts((prev) => prev.filter((a) => a.key !== key)), 5000);
  };

  const handleCreate = () => {
    setModalMode('create');
    setEditingWebhook(undefined);
    setSecretStatus(null);
    setModalOpen(true);
  };

  const handleEdit = async (webhook: Webhook) => {
    setModalMode('edit');
    setEditingWebhook(webhook);
    try {
      const status = await api.getSecretStatus(webhook.id);
      setSecretStatus(status.configured);
    } catch {
      setSecretStatus(null);
    }
    setModalOpen(true);
  };

  const handleSave = async (data: WebhookInput) => {
    if (modalMode === 'create') {
      await api.create(data);
      addAlert('success', 'Webhook created');
    } else if (editingWebhook) {
      await api.update(editingWebhook.id, data);
      addAlert('success', 'Webhook updated');
    }
    fetchWebhooks();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(deleteTarget.id);
      addAlert('success', `Webhook deleted`);
      fetchWebhooks();
    } catch (err: unknown) {
      addAlert('danger', `Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setDeleteTarget(null);
  };

  const handleToggleEnabled = async (webhook: Webhook) => {
    try {
      await api.update(webhook.id, { ...webhook, enabled: !webhook.enabled });
      fetchWebhooks();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) setReadOnly(true);
      addAlert('danger', `Toggle failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleTest = async (webhook: Webhook) => {
    try {
      const result = await api.test(webhook.id);
      addAlert(
        result.success ? 'success' : 'danger',
        `Test ping: HTTP ${result.httpStatus} (${result.durationMs}ms)`,
      );
    } catch (err: unknown) {
      addAlert('danger', `Test failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCircuitReset = async (webhookId: string) => {
    try {
      await api.resetCircuit(webhookId);
      addAlert('success', 'Circuit breaker reset');
      fetchWebhooks();
    } catch (e) {
      addAlert('danger', e instanceof ApiError ? e.message : 'Reset failed');
    }
  };

  if (loading) return null;

  if (webhooks.length === 0 && currentPage === 1) {
    return (
      <>
        <EmptyState>
          <EmptyStateHeader
            titleText="No webhooks configured"
            headingLevel="h2"
            icon={<EmptyStateIcon icon={CubesIcon} />}
          />
          <EmptyStateBody>
            Create a webhook to start receiving event notifications.
          </EmptyStateBody>
          <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleCreate}>
            Create webhook
          </Button>
        </EmptyState>
        <WebhookModal
          mode="create"
          isOpen={modalOpen}
          defaults={defaults}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      </>
    );
  }

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
              onWebhookChange={fetchWebhooks}
              pageSize={pageSize}
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

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, padding: '0 16px' }}>
              <Button
                variant="secondary"
                isDisabled={currentPage === 1 || loading}
                onClick={() => {
                  const p = currentPage - 1;
                  setCurrentPage(p);
                  currentPageRef.current = p;
                  fetchWebhooks(p);
                }}
              >
                ← Prev
              </Button>
              <span>Pagina {currentPage}</span>
              <Button
                variant="secondary"
                isDisabled={!hasMore || loading}
                onClick={() => {
                  const p = currentPage + 1;
                  setCurrentPage(p);
                  currentPageRef.current = p;
                  fetchWebhooks(p);
                }}
              >
                Next →
              </Button>
            </div>
          </DrawerContentBody>
        </DrawerContent>
      </Drawer>

      <WebhookModal
        mode={modalMode}
        isOpen={modalOpen}
        webhook={editingWebhook}
        secretConfigured={secretStatus}
        defaults={modalMode === 'create' ? defaults : undefined}
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
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd webhook-ui && npm test -- --run
```

Expected: all tests pass (at least 124 — previous + 5 new pagination tests).

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/components/WebhookTable.tsx webhook-ui/src/__tests__/WebhookTable.test.tsx
git commit -m "feat(ui): add pagination to webhook list"
```

---

### Task 5: E2E test

**Files:**
- Create: `e2e/tests/10-ui-completeness.spec.ts`

- [ ] **Step 1: Create the e2e test**

```ts
import { test, expect } from '../fixtures/ports';
import { triggerUserCycle } from '../fixtures/admin-events';
import { createWebhookViaUI } from '../fixtures/webhook-helpers';
import { waitForDelivery } from '../fixtures/consumer';

test('UI completeness: createdAt visible and events tab shows event rows', async ({
  page,
  keycloakUrl,
  consumerPublicUrl,
  adminToken,
}) => {
  // 1. Create a consumer session so Keycloak can deliver to it
  const sessionRes = await fetch(`${consumerPublicUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_code: 200 }),
  });
  const { uuid } = (await sessionRes.json()) as { uuid: string };
  const webhookUrl = `http://consumer:8080/${uuid}`;

  // 2. Register webhook via UI
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await createWebhookViaUI(page, webhookUrl);

  // 3. Trigger events and wait for at least one delivery
  await triggerUserCycle(keycloakUrl, adminToken);
  await waitForDelivery(consumerPublicUrl, uuid);

  // 4. Open the delivery drawer (click first cell of the webhook row)
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.getByRole('gridcell').first().click();
  await expect(page.getByText('Delivery history').or(page.getByRole('tab', { name: /delivery history/i }))).toBeVisible({ timeout: 5_000 });

  // 5. Verify createdAt is shown in the drawer header
  await expect(page.getByText(/created/i)).toBeVisible({ timeout: 5_000 });

  // 6. Click the Events tab
  await page.getByRole('tab', { name: /events/i }).click();

  // 7. Verify at least one event row is visible
  await expect(page.getByRole('cell', { name: /USER|ADMIN/ }).first()).toBeVisible({ timeout: 10_000 });

  // 8. Click Payload on the first event row
  await page.getByRole('button', { name: /payload/i }).first().click();

  // 9. Verify PayloadPreviewModal opens with JSON containing "realmId"
  await expect(page.getByRole('dialog', { name: /event payload/i })).toBeVisible({ timeout: 5_000 });
  await expect(
    page.getByRole('dialog', { name: /event payload/i }).getByText(/realmId/),
  ).toBeVisible();

  // 10. Close the modal
  await page.getByRole('dialog', { name: /event payload/i }).getByRole('button', { name: 'Close' }).last().click();
  await expect(page.getByRole('dialog', { name: /event payload/i })).not.toBeVisible();
});
```

- [ ] **Step 2: Run unit tests to make sure nothing regressed**

```bash
cd webhook-ui && npm test -- --run
```

Expected: all tests still pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/10-ui-completeness.spec.ts
git commit -m "test(e2e): add UI completeness test — createdAt, events tab, payload modal"
```
