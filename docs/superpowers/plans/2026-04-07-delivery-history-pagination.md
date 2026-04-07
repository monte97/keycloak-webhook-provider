# Delivery History Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable page size (10/25/50/100, default 50) to delivery history drawer with Prev/Next pagination controls, persisted in localStorage via `useSettings`.

**Architecture:** `deliveryHistoryPageSize` field added to `AppSettings` → passed as `pageSize` prop through `App → WebhookTable → DeliveryDrawer`. `getSends` API exposes `first` offset. `DeliveryDrawer` tracks `currentPage` and `hasMore` state locally.

**Tech Stack:** React 18, PatternFly 5, TypeScript strict, Vitest + Testing Library, Playwright E2E.

---

## File Map

| File | Change |
|------|--------|
| `webhook-ui/src/lib/useSettings.ts` | Add `deliveryHistoryPageSize: number` to `AppSettings`, `DEFAULTS`, `readSettings` |
| `webhook-ui/src/__tests__/useSettings.test.ts` | Update default snapshots; add 4 new tests for page size field |
| `webhook-ui/src/components/SettingsPage.tsx` | Add third card "Cronologia consegne" with radio group |
| `webhook-ui/src/__tests__/SettingsPage.test.tsx` | Update `defaultSettings`; add 3 new tests for the card |
| `webhook-ui/src/api/webhookApi.ts` | Expose `first?: number` param in `getSends` |
| `webhook-ui/src/components/DeliveryDrawer.tsx` | Add `pageSize` prop, `currentPage`/`hasMore` state, Prev/Next nav |
| `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx` | Add `pageSize` to all renders; update getSends assertions; add 8 pagination tests |
| `webhook-ui/src/components/WebhookTable.tsx` | Add `pageSize: number` prop, forward to `DeliveryDrawer` |
| `webhook-ui/src/App.tsx` | Pass `pageSize={settings.deliveryHistoryPageSize}` to `WebhookTable` |
| `e2e/tests/06-settings.spec.ts` | Add 3 E2E tests for the new card and drawer pagination |
| `docs/user-guide/guide-en.md` | Document pagination controls and settings |
| `docs/user-guide/guide-it.md` | Same in Italian |

---

### Task 1: Extend `useSettings` with `deliveryHistoryPageSize`

**Files:**
- Modify: `webhook-ui/src/lib/useSettings.ts`
- Modify: `webhook-ui/src/__tests__/useSettings.test.ts`

- [ ] **Step 1: Write failing tests**

In `webhook-ui/src/__tests__/useSettings.test.ts`, update ALL existing snapshots to include `deliveryHistoryPageSize: 50` (they currently fail once the field is added to the interface) and add 4 new tests at the end:

```ts
// Update the defaultSettings object literal used in every `toEqual` call
// by adding deliveryHistoryPageSize: 50 to each expected object.

// Example: the first existing test becomes:
it('returns defaults when localStorage is empty', () => {
  const { result } = renderHook(() => useSettings());
  expect(result.current.settings).toEqual({
    metricsRefreshInterval: 10_000,
    webhookDefaults: {
      enabled: true,
      retryMaxElapsedSeconds: null,
      retryMaxIntervalSeconds: null,
    },
    deliveryHistoryPageSize: 50,  // ADD THIS
  });
});

// Apply the same addition to the toEqual assertions in:
//  - 'falls back to defaults on malformed JSON'
//  - 'falls back to defaults on valid JSON that is not a settings object'
// (other tests use .metricsRefreshInterval / .webhookDefaults individually — they need no change)

// NEW tests at end of file:
it('DEFAULTS include deliveryHistoryPageSize 50', () => {
  const { result } = renderHook(() => useSettings());
  expect(result.current.settings.deliveryHistoryPageSize).toBe(50);
});

it('persists and reads deliveryHistoryPageSize', () => {
  const { result } = renderHook(() => useSettings());
  act(() => {
    result.current.updateSettings({ deliveryHistoryPageSize: 10 });
  });
  expect(result.current.settings.deliveryHistoryPageSize).toBe(10);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).deliveryHistoryPageSize).toBe(10);
});

it('missing deliveryHistoryPageSize falls back to 50', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ metricsRefreshInterval: 10_000 }));
  const { result } = renderHook(() => useSettings());
  expect(result.current.settings.deliveryHistoryPageSize).toBe(50);
});

it('non-number deliveryHistoryPageSize falls back to 50', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ deliveryHistoryPageSize: 'lots' }));
  const { result } = renderHook(() => useSettings());
  expect(result.current.settings.deliveryHistoryPageSize).toBe(50);
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd webhook-ui && npm test -- --reporter=verbose 2>&1 | grep -E '(FAIL|PASS|✓|✗|×)' | head -30
```

Expected: TypeScript compile errors or test failures about `deliveryHistoryPageSize` not existing.

- [ ] **Step 3: Implement changes in `useSettings.ts`**

Replace the `AppSettings` interface and `DEFAULTS` constant:

```ts
export interface AppSettings {
  metricsRefreshInterval: number;
  webhookDefaults: WebhookDefaults;
  deliveryHistoryPageSize: number;
}

const DEFAULTS: AppSettings = {
  metricsRefreshInterval: 10_000,
  webhookDefaults: {
    enabled: true,
    retryMaxElapsedSeconds: null,
    retryMaxIntervalSeconds: null,
  },
  deliveryHistoryPageSize: 50,
};
```

In `readSettings`, add the new field to the returned object:

```ts
return {
  metricsRefreshInterval:
    typeof obj['metricsRefreshInterval'] === 'number'
      ? obj['metricsRefreshInterval']
      : DEFAULTS.metricsRefreshInterval,
  webhookDefaults: validateWebhookDefaults(obj['webhookDefaults']),
  deliveryHistoryPageSize:
    typeof obj['deliveryHistoryPageSize'] === 'number'
      ? obj['deliveryHistoryPageSize']
      : DEFAULTS.deliveryHistoryPageSize,
};
```

No changes needed to `updateSettings` — the scalar merge already handles it.

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd webhook-ui && npm test 2>&1 | tail -5
```

Expected: all tests pass (including TypeScript compile).

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/lib/useSettings.ts webhook-ui/src/__tests__/useSettings.test.ts
git commit -m "feat(settings): add deliveryHistoryPageSize to AppSettings (default 50)"
```

---

### Task 2: Add "Cronologia consegne" card to `SettingsPage`

**Files:**
- Modify: `webhook-ui/src/components/SettingsPage.tsx`
- Modify: `webhook-ui/src/__tests__/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing tests**

In `webhook-ui/src/__tests__/SettingsPage.test.tsx`:

1. Update `defaultSettings` to add `deliveryHistoryPageSize: 50`:

```ts
const defaultSettings: AppSettings = {
  metricsRefreshInterval: 10_000,
  webhookDefaults: {
    enabled: true,
    retryMaxElapsedSeconds: null,
    retryMaxIntervalSeconds: null,
  },
  deliveryHistoryPageSize: 50,
};
```

2. Add 3 new tests after the last existing test:

```ts
it('renders "Cronologia consegne" card with 4 page size radio options', () => {
  render(<SettingsPage settings={defaultSettings} onUpdate={vi.fn()} />);
  expect(screen.getByText('Cronologia consegne')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '10' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '25' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '50' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '100' })).toBeInTheDocument();
});

it('checks the page size radio matching settings.deliveryHistoryPageSize', () => {
  render(
    <SettingsPage
      settings={{ ...defaultSettings, deliveryHistoryPageSize: 10 }}
      onUpdate={vi.fn()}
    />,
  );
  expect(screen.getByRole('radio', { name: '10' })).toBeChecked();
  expect(screen.getByRole('radio', { name: '50' })).not.toBeChecked();
});

it('clicking a page size radio calls onUpdate with deliveryHistoryPageSize', () => {
  const onUpdate = vi.fn();
  render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
  fireEvent.click(screen.getByRole('radio', { name: '25' }));
  expect(onUpdate).toHaveBeenCalledWith({ deliveryHistoryPageSize: 25 });
});
```

- [ ] **Step 2: Run tests and confirm new tests fail**

```bash
cd webhook-ui && npm test -- --reporter=verbose 2>&1 | grep -E '(cronologia|page size|FAIL)' -i | head -10
```

Expected: 3 new tests fail (card does not exist yet).

- [ ] **Step 3: Implement the new card in `SettingsPage.tsx`**

Add the `PAGE_SIZE_OPTIONS` constant right after `INTERVAL_OPTIONS`:

```ts
const PAGE_SIZE_OPTIONS = [
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
] as const;
```

Add the third card after the closing `</Card>` of the "Webhook — valori predefiniti" card:

```tsx
<Card style={{ marginTop: 16 }}>
  <CardTitle>Cronologia consegne</CardTitle>
  <CardBody>
    <Form>
      <FormGroup label="Righe per pagina" role="group">
        {PAGE_SIZE_OPTIONS.map((opt) => (
          <Radio
            key={opt.value}
            id={`page-size-${opt.value}`}
            name="delivery-history-page-size"
            label={opt.label}
            isChecked={settings.deliveryHistoryPageSize === opt.value}
            onChange={() => onUpdate({ deliveryHistoryPageSize: opt.value })}
          />
        ))}
      </FormGroup>
    </Form>
  </CardBody>
</Card>
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd webhook-ui && npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/components/SettingsPage.tsx webhook-ui/src/__tests__/SettingsPage.test.tsx
git commit -m "feat(settings): add Cronologia consegne card with page size radio group"
```

---

### Task 3: Expose `first` param in `getSends` API

**Files:**
- Modify: `webhook-ui/src/api/webhookApi.ts`

- [ ] **Step 1: Update `getSends` in `webhookApi.ts`**

Replace the `getSends` method:

```ts
getSends(
  id: string,
  params: { first?: number; max?: number; success?: boolean } = {},
): Promise<WebhookSend[]> {
  const { first = 0, max = 50, success } = params;
  const qs =
    success !== undefined
      ? `?first=${first}&max=${max}&success=${success}`
      : `?first=${first}&max=${max}`;
  return request(`/${id}/sends${qs}`);
},
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
cd webhook-ui && npm test 2>&1 | tail -5
```

Expected: all tests pass (existing `DeliveryDrawer` tests assert `{ max: 50 }` — `first` is optional so `first: 0` not yet in the call; that changes in Task 4).

- [ ] **Step 3: Commit**

```bash
git add webhook-ui/src/api/webhookApi.ts
git commit -m "feat(api): expose first param in getSends for server-side pagination"
```

---

### Task 4: Add pagination to `DeliveryDrawer`

**Files:**
- Modify: `webhook-ui/src/components/DeliveryDrawer.tsx`
- Modify: `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx`

- [ ] **Step 1: Update existing tests and add pagination tests**

In `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx`:

**A. Add `pageSize={50}` to every existing `<DeliveryDrawer>` render call** (there are 11 render calls — every one inside the describe block). Example:

```tsx
// Before:
<DeliveryDrawer
  webhook={webhook}
  api={api}
  onClose={onClose}
  onCircuitReset={onCircuitReset}
/>
// After:
<DeliveryDrawer
  webhook={webhook}
  api={api}
  onClose={onClose}
  onCircuitReset={onCircuitReset}
  pageSize={50}
/>
```

**B. Update getSends call assertions** — add `first: 0` to every `toHaveBeenCalledWith` that references getSends params:

```ts
// line 105 — initial load:
expect(api.getSends).toHaveBeenCalledWith('w1', { first: 0, max: 50 });

// line 177 — Failed filter:
expect(api.getSends).toHaveBeenCalledWith('w1', { first: 0, max: 50, success: false });
```

**C. Add 8 new pagination tests** after the last existing test:

```ts
describe('pagination', () => {
  it('initial load calls getSends with first=0, max=pageSize', async () => {
    const api = makeApi();
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={vi.fn()}
          onCircuitReset={vi.fn()}
          pageSize={10}
        />
      </Drawer>,
    );
    await waitFor(() => {
      expect(api.getSends).toHaveBeenCalledWith('w1', { first: 0, max: 10 });
    });
  });

  it('full page response enables Next button', async () => {
    const tenSends = Array.from({ length: 10 }, (_, i) => ({
      ...successSend,
      id: `s${i}`,
    }));
    const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={vi.fn()}
          onCircuitReset={vi.fn()}
          pageSize={10}
        />
      </Drawer>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });
  });

  it('partial page response disables Next button', async () => {
    const api = makeApi({ getSends: vi.fn().mockResolvedValue([successSend]) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={vi.fn()}
          onCircuitReset={vi.fn()}
          pageSize={10}
        />
      </Drawer>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });
  });

  it('Prev is disabled on page 1', async () => {
    const api = makeApi();
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={vi.fn()}
          onCircuitReset={vi.fn()}
          pageSize={10}
        />
      </Drawer>,
    );
    await waitFor(() => screen.getByText('Pagina 1'));
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
  });

  it('clicking Next calls getSends with first=pageSize and shows page 2', async () => {
    const tenSends = Array.from({ length: 10 }, (_, i) => ({
      ...successSend,
      id: `s${i}`,
    }));
    const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={vi.fn()}
          onCircuitReset={vi.fn()}
          pageSize={10}
        />
      </Drawer>,
    );
    await waitFor(() => screen.getByText('Pagina 1'));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(api.getSends).toHaveBeenCalledWith('w1', { first: 10, max: 10 });
      expect(screen.getByText('Pagina 2')).toBeInTheDocument();
    });
  });

  it('clicking Prev from page 2 calls getSends with first=0 and shows page 1', async () => {
    const tenSends = Array.from({ length: 10 }, (_, i) => ({
      ...successSend,
      id: `s${i}`,
    }));
    const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={vi.fn()}
          onCircuitReset={vi.fn()}
          pageSize={10}
        />
      </Drawer>,
    );
    await waitFor(() => screen.getByText('Pagina 1'));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByText('Pagina 2'));
    fireEvent.click(screen.getByRole('button', { name: /prev/i }));
    await waitFor(() => {
      expect(api.getSends).toHaveBeenLastCalledWith('w1', { first: 0, max: 10 });
      expect(screen.getByText('Pagina 1')).toBeInTheDocument();
    });
  });

  it('filter change resets page to 1', async () => {
    const tenSends = Array.from({ length: 10 }, (_, i) => ({
      ...successSend,
      id: `s${i}`,
    }));
    const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={vi.fn()}
          onCircuitReset={vi.fn()}
          pageSize={10}
        />
      </Drawer>,
    );
    await waitFor(() => screen.getByText('Pagina 1'));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByText('Pagina 2'));

    // Toggle filter — should reset to page 1
    fireEvent.click(screen.getByRole('button', { name: /^failed$/i }));
    await waitFor(() => {
      expect(screen.getByText('Pagina 1')).toBeInTheDocument();
    });
  });

  it('pageSize prop change resets to page 1', async () => {
    const tenSends = Array.from({ length: 10 }, (_, i) => ({
      ...successSend,
      id: `s${i}`,
    }));
    const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
    const { rerender } = render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={vi.fn()}
          onCircuitReset={vi.fn()}
          pageSize={10}
        />
      </Drawer>,
    );
    await waitFor(() => screen.getByText('Pagina 1'));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByText('Pagina 2'));

    rerender(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={vi.fn()}
          onCircuitReset={vi.fn()}
          pageSize={25}
        />
      </Drawer>,
    );
    await waitFor(() => {
      expect(screen.getByText('Pagina 1')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm new tests fail**

```bash
cd webhook-ui && npm test 2>&1 | grep -E '(FAIL|pagination)' | head -20
```

Expected: TypeScript errors (no `pageSize` prop) and test failures.

- [ ] **Step 3: Implement pagination in `DeliveryDrawer.tsx`**

**A.** Update the props interface:

```ts
interface DeliveryDrawerProps {
  webhook: Webhook | null;
  api: WebhookApiClient;
  onClose: () => void;
  onCircuitReset: (id: string) => void;
  pageSize: number;
}
```

**B.** Update the function signature:

```ts
export function DeliveryDrawer({
  webhook,
  api,
  onClose,
  onCircuitReset,
  pageSize,
}: DeliveryDrawerProps) {
```

**C.** Add `currentPage` and `hasMore` state after the existing state declarations:

```ts
const [currentPage, setCurrentPage] = useState(1);
const [hasMore, setHasMore] = useState(false);
```

**D.** Replace the existing `loadSends` function:

```ts
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
```

**E.** Update the `webhook?.id` useEffect to pass page 1:

```ts
useEffect(() => {
  if (!webhook) return;
  setFilter('all');
  setCurrentPage(1);
  loadSends(webhook.id, 'all', 1);
  loadCircuit(webhook.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [webhook?.id]);
```

**F.** Add a new useEffect for `pageSize` changes after the `webhook?.id` effect:

```ts
useEffect(() => {
  if (!webhook) return;
  setCurrentPage(1);
  loadSends(webhook.id, filter, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pageSize]);
```

**G.** Update the filter handlers to reset page and pass page 1:

```ts
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
```

**H.** Update `handleResendFailed` to reload current page after resend:

```ts
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
```

**I.** Update `handleResendSingle` to reload current page:

```ts
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
```

**J.** Update `handleConfirmResend` to reload current page:

```ts
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
```

**K.** Add navigation buttons inside the `{!loadingSends && !sendsError && (...)}` block, after the closing `</Table>` tag:

```tsx
{!loadingSends && !sendsError && (
  <>
    <Table aria-label="Delivery history" variant="compact">
      {/* ... existing Thead, Tbody ... */}
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
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd webhook-ui && npm test 2>&1 | tail -10
```

Expected: all tests pass including the 8 new pagination tests.

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/components/DeliveryDrawer.tsx webhook-ui/src/__tests__/DeliveryDrawer.test.tsx
git commit -m "feat(drawer): add pageSize prop and Prev/Next pagination controls"
```

---

### Task 5: Wire `pageSize` through `WebhookTable` and `App.tsx`

**Files:**
- Modify: `webhook-ui/src/components/WebhookTable.tsx`
- Modify: `webhook-ui/src/App.tsx`

- [ ] **Step 1: Add `pageSize` prop to `WebhookTable` and forward it**

In `WebhookTable.tsx`, update the function signature (currently `{ api, defaults }`):

```ts
export function WebhookTable({
  api,
  defaults,
  pageSize,
}: {
  api: WebhookApiClient;
  defaults?: WebhookDefaults;
  pageSize: number;
}) {
```

Forward `pageSize` to `<DeliveryDrawer>` (find the existing `<DeliveryDrawer>` render around line 218):

```tsx
<DeliveryDrawer
  webhook={drawerWebhook}
  api={api}
  onClose={() => setDrawerWebhook(null)}
  onCircuitReset={handleCircuitReset}
  pageSize={pageSize}
/>
```

- [ ] **Step 2: Pass `pageSize` from `App.tsx`**

In `App.tsx`, update the `<WebhookTable>` render:

```tsx
{activeTab === 'webhooks' && (
  <WebhookTable
    api={api}
    defaults={settings.webhookDefaults}
    pageSize={settings.deliveryHistoryPageSize}
  />
)}
```

- [ ] **Step 3: Run full test suite**

```bash
cd webhook-ui && npm test 2>&1 | tail -10
```

Expected: all tests pass, TypeScript compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add webhook-ui/src/components/WebhookTable.tsx webhook-ui/src/App.tsx
git commit -m "feat: wire deliveryHistoryPageSize from settings through WebhookTable to DeliveryDrawer"
```

---

### Task 6: E2E tests for settings card and drawer pagination

**Files:**
- Modify: `e2e/tests/06-settings.spec.ts`

> **Note:** These tests require a live Keycloak instance running with the JAR deployed. Run locally only, not in CI until the JAR is published. If the E2E environment is not available, mark this task as blocked and skip.

- [ ] **Step 1: Add 3 new E2E tests at the end of `06-settings.spec.ts`**

```ts
test('Cronologia consegne card shows 4 radio options with 50 checked by default', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();

  await expect(page.getByText('Cronologia consegne')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('radio', { name: '10' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '25' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '50' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '100' })).toBeVisible();

  // Default: 50
  await expect(page.getByRole('radio', { name: '50' })).toBeChecked();
});

test('Delivery history page size persists after reload', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '50' })).toBeChecked({ timeout: 5_000 });

  await page.getByRole('radio', { name: '10' }).click();
  await expect(page.getByRole('radio', { name: '10' })).toBeChecked();

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '10' })).toBeChecked({ timeout: 5_000 });

  // Reset to default
  await page.getByRole('radio', { name: '50' }).click();
});

test('Delivery drawer shows Prev/Next pagination buttons', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Set page size to 10 so buttons are always visible
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '10' })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('radio', { name: '10' }).click();

  // Open the delivery drawer (first webhook row)
  await page.getByRole('tab', { name: 'Webhooks' }).click();
  await page.waitForLoadState('networkidle');
  const firstRow = page.getByRole('row').nth(1); // skip header
  await firstRow.click();

  await expect(page.getByRole('button', { name: /prev/i })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: /next/i })).toBeVisible();

  // Reset page size to default
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await page.getByRole('radio', { name: '50' }).click();
});
```

- [ ] **Step 2: Run E2E tests (if environment is available)**

```bash
cd e2e && npx playwright test 06-settings.spec.ts --reporter=line
```

Expected: all 9 tests in 06-settings.spec.ts pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/06-settings.spec.ts
git commit -m "test(e2e): add delivery history page size and pagination e2e tests"
```

---

### Task 7: Update user guides

**Files:**
- Modify: `docs/user-guide/guide-en.md`
- Modify: `docs/user-guide/guide-it.md`

- [ ] **Step 1: Update `guide-en.md`**

Find the existing Settings section (§7 or similar). After the "Webhook — default values" subsection, add:

```markdown
### Delivery history

**Rows per page** — Choose how many entries to show per page in the delivery history drawer: 10, 25, 50 (default), or 100. The setting is persisted in your browser.

Inside the delivery history drawer, use the **← Prev** and **Next →** buttons at the bottom to navigate between pages. The **Next** button is disabled when the current page has fewer rows than the page size (i.e., you have reached the last page). The **Prev** button is disabled on the first page.
```

- [ ] **Step 2: Update `guide-it.md`**

Find the equivalent section and add (after the subsection on webhook defaults):

```markdown
### Cronologia consegne

**Righe per pagina** — Scegli quante righe visualizzare per pagina nella cronologia consegne: 10, 25, 50 (predefinito) o 100. L'impostazione viene salvata nel browser.

Nel drawer della cronologia consegne, usa i pulsanti **← Prev** e **Next →** in basso per navigare tra le pagine. Il pulsante **Next** è disabilitato quando la pagina corrente contiene meno righe della dimensione della pagina (ultima pagina raggiunta). Il pulsante **Prev** è disabilitato sulla prima pagina.
```

- [ ] **Step 3: Commit**

```bash
git add docs/user-guide/guide-en.md docs/user-guide/guide-it.md
git commit -m "docs: document delivery history pagination in user guides"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in |
|-----------------|-----------|
| `deliveryHistoryPageSize: number` in `AppSettings` | Task 1 |
| Default 50, fallback for missing/non-number | Task 1 |
| "Cronologia consegne" card with 4 radio options | Task 2 |
| Selection applied immediately via `onUpdate` | Task 2 |
| `getSends` accepts `first?: number` | Task 3 |
| `DeliveryDrawer` `pageSize` prop | Task 4 |
| `currentPage` state, `hasMore` state | Task 4 |
| `loadSends` takes `page` param, computes `first` | Task 4 |
| Reset on webhook change | Task 4 (useEffect on `webhook?.id`) |
| Reset on filter change | Task 4 (filter handlers) |
| Reset on pageSize change | Task 4 (useEffect on `pageSize`) |
| Prev/Next nav buttons with correct disabled states | Task 4 |
| `WebhookTable` forwards `pageSize` | Task 5 |
| `App.tsx` passes `settings.deliveryHistoryPageSize` | Task 5 |
| Unit tests — `useSettings` (4 new) | Task 1 |
| Unit tests — `SettingsPage` (3 new) | Task 2 |
| Unit tests — `DeliveryDrawer` (8 new) | Task 4 |
| E2E — settings card visible, persists | Task 6 |
| E2E — Prev/Next visible in drawer | Task 6 |
| Guide updates | Task 7 |

**No gaps found.** All spec requirements are covered.

**Type consistency:**
- `loadSends(id, f, page)` signature introduced in Task 4 and used consistently in all callers (useEffect, filter handlers, resend handlers, nav buttons).
- `pageSize` prop flows: `AppSettings.deliveryHistoryPageSize → WebhookTable.pageSize → DeliveryDrawer.pageSize`.
- `getSends` params type: `{ first?: number; max?: number; success?: boolean }` — consistent with all call sites.
