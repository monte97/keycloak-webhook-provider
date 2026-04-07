# Delivery History Pagination — Design Spec

## Goal

Add configurable pagination to the delivery history drawer. Users choose how many rows to show per page (10 / 25 / 50 / 100) in the Settings page, and can navigate between pages with Prev / Next buttons inside the drawer.

## Scope

- Page size setting in the "Impostazioni" tab (new card "Cronologia consegne")
- Prev / Next navigation in the DeliveryDrawer
- Setting persisted in localStorage, default 50 (maintains current behaviour)

Out of scope:
- Jump-to-page input
- Total row count / "page X of Y" display (requires an additional count API call)

## Architecture

### `useSettings` — `src/lib/useSettings.ts`

Add `deliveryHistoryPageSize: number` as a top-level field in `AppSettings`:

```ts
interface AppSettings {
  metricsRefreshInterval: number;
  webhookDefaults: WebhookDefaults;
  deliveryHistoryPageSize: number;
}

const DEFAULTS: AppSettings = {
  metricsRefreshInterval: 10_000,
  webhookDefaults: { enabled: true, retryMaxElapsedSeconds: null, retryMaxIntervalSeconds: null },
  deliveryHistoryPageSize: 50,
};
```

`readSettings` validates `deliveryHistoryPageSize` field-by-field (like `metricsRefreshInterval`): if absent or not a number, falls back to `DEFAULTS.deliveryHistoryPageSize`. No allowlist validation — any positive number is accepted to avoid discarding custom values from future versions.

No changes needed to `updateSettings` — the existing top-level shallow merge handles scalar fields correctly.

### `SettingsPage` — `src/components/SettingsPage.tsx`

Add a third `Card` titled "Cronologia consegne" below the two existing cards. Contains one `FormGroup`:

- **Label:** "Righe per pagina"
- **Control:** `Radio` group with 4 options: 10, 25, 50 (default), 100
- Selection applied immediately via `onUpdate({ deliveryHistoryPageSize: value })` — no Save button

```ts
const PAGE_SIZE_OPTIONS = [
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
] as const;
```

### `getSends` API — `src/api/webhookApi.ts`

Update the `getSends` signature to accept `first`:

```ts
getSends(
  id: string,
  params: { first?: number; max?: number; success?: boolean },
): Promise<WebhookSend[]>
```

The default `first=0` is already in the URL construction — just expose it as an explicit param.

### `DeliveryDrawer` — `src/components/DeliveryDrawer.tsx`

New prop:

```ts
interface DeliveryDrawerProps {
  webhook: Webhook | null;
  api: WebhookApiClient;
  onClose: () => void;
  onCircuitReset: (id: string) => void;
  pageSize: number;
}
```

New state:

```ts
const [currentPage, setCurrentPage] = useState(1);
const [hasMore, setHasMore] = useState(false);
```

Updated `loadSends`:

```ts
const loadSends = async (id: string, f: 'all' | 'failed', page: number) => {
  setLoadingSends(true);
  setSendsError(null);
  try {
    const first = (page - 1) * pageSize;
    const params = f === 'failed'
      ? { first, max: pageSize, success: false as const }
      : { first, max: pageSize };
    const result = await api.getSends(id, params);
    setSends(result);
    setHasMore(result.length === pageSize);
  } catch (e) {
    setSendsError(e instanceof Error ? e.message : 'Failed to load delivery history');
  } finally {
    setLoadingSends(false);
  }
};
```

Reset rules — `currentPage` resets to 1 when:
- `webhook?.id` changes (existing `useEffect`)
- Filter changes (All / Failed toggle handlers)
- `pageSize` prop changes (new `useEffect` on `pageSize`)

Navigation controls rendered below the table:

```tsx
<div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
  <Button
    variant="secondary"
    isDisabled={currentPage === 1 || loadingSends}
    onClick={() => { const p = currentPage - 1; setCurrentPage(p); loadSends(webhook.id, filter, p); }}
  >
    ← Prev
  </Button>
  <span>Pagina {currentPage}</span>
  <Button
    variant="secondary"
    isDisabled={!hasMore || loadingSends}
    onClick={() => { const p = currentPage + 1; setCurrentPage(p); loadSends(webhook.id, filter, p); }}
  >
    Next →
  </Button>
</div>
```

### `WebhookTable` — `src/components/WebhookTable.tsx`

Add `pageSize` prop forwarded to `DeliveryDrawer`:

```ts
export function WebhookTable({
  api,
  defaults,
  pageSize,
}: {
  api: WebhookApiClient;
  defaults?: WebhookDefaults;
  pageSize: number;
})
```

### `App.tsx`

Pass `pageSize={settings.deliveryHistoryPageSize}` to `WebhookTable`:

```tsx
{activeTab === 'webhooks' && (
  <WebhookTable
    api={api}
    defaults={settings.webhookDefaults}
    pageSize={settings.deliveryHistoryPageSize}
  />
)}
```

## Data flow

```
localStorage
    ↓  (on mount)
useSettings  →  settings.deliveryHistoryPageSize  →  WebhookTable  →  DeliveryDrawer
    ↑                                              →  SettingsPage (radio checked)
updateSettings({ deliveryHistoryPageSize: 10 })
    ↓
localStorage
```

## Error handling

- Absent or non-number `deliveryHistoryPageSize` in localStorage → fallback to 50.
- API returns empty array when `first` is past the end of the list → `hasMore = false`, Next disabled.
- API error → existing `sendsError` alert, no page state change.

## Testing

### Unit — `useSettings.test.ts` (update)

- DEFAULTS include `deliveryHistoryPageSize: 50`.
- Persists and reads `deliveryHistoryPageSize` correctly.
- Missing key falls back to 50.
- Non-number value falls back to 50.

### Unit — `SettingsPage.test.tsx` (update)

- Renders "Cronologia consegne" card with 4 radio options (10, 25, 50, 100).
- Radio matching `settings.deliveryHistoryPageSize` is checked.
- Clicking a radio calls `onUpdate({ deliveryHistoryPageSize: value })`.

### Unit — `DeliveryDrawer.test.tsx` (new or update)

- Initial load: `getSends` called with `{ first: 0, max: 10 }` when `pageSize=10`.
- Response with 10 items → Next enabled; response with <10 items → Next disabled.
- Next click: `getSends` called with `{ first: 10, max: 10 }`, page shows 2.
- Prev click: `getSends` called with `{ first: 0, max: 10 }`, page shows 1.
- Prev disabled on page 1.
- Page resets to 1 when webhook changes.
- Page resets to 1 when filter changes.
- Page resets to 1 when `pageSize` prop changes.

### E2E — `06-settings.spec.ts` (update)

- "Cronologia consegne" card visible with 4 radio options; 50 checked by default.
- Changing to 10 → reload → value persisted (10 still selected).
- Changing to 10 → open delivery drawer → Prev and Next buttons visible.

## Guide updates

Update §3 "Delivery history" (or §7 "Settings") in both `guide-en.md` and `guide-it.md` to document:
- Pagination controls in the drawer
- Page size configurable in Settings → Cronologia consegne
