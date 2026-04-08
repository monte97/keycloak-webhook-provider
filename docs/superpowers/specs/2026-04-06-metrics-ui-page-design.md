# Metrics UI Page — Design Spec

## Goal

Add a Metrics page to the webhook admin UI, accessible via a new "Metriche" tab. The page displays 4 key metric cards and the raw Prometheus text, with a manual refresh button and an auto-refresh toggle (fixed 10-second interval).

---

## Navigation

Add horizontal PatternFly `Tabs` to `App.tsx` wrapping the existing content:

- Tab 1: **Webhooks** — existing `WebhookTable` + `DeliveryDrawer`
- Tab 2: **Metriche** — new `MetricsPage` component

Tab state managed with `useState<'webhooks' | 'metrics'>` in `App.tsx`. No router.

---

## Frontend Architecture

### New files

**`webhook-ui/src/lib/parseMetrics.ts`**

Pure function `parseMetrics(raw: string): ParsedMetrics`.

```ts
interface ParsedMetrics {
  dispatches: number | null;
  successRate: number | null;    // percentage 0–100
  eventsReceived: number | null;
  retries: number | null;
  exhausted: number | null;
  queuePending: number | null;
}
```

Parsing strategy:
- `dispatches` = sum of `webhook_dispatches_total` across all label combos
- `successRate` = `webhook_dispatches_total{...,success="true"}` / total dispatches × 100
- `eventsReceived` = sum of `webhook_events_received_total`
- `retries` = sum of `webhook_retries_total`
- `exhausted` = sum of `webhook_retries_exhausted_total`
- `queuePending` = sum of `webhook_queue_pending` (gauge)

If a metric line is absent, the corresponding field is `null`. Parse errors on individual metrics yield `null` for that field only; they do not fail the whole parse.

**`webhook-ui/src/components/MetricsPage.tsx`**

Renders the metrics view. Props: `api: WebhookApi`.

**`webhook-ui/src/api/webhookApi.ts`** (modified)

Add: `getMetrics(): Promise<string>` — GET `/metrics`, returns raw text (Content-Type: `text/plain`).

### Modified files

**`webhook-ui/src/App.tsx`**

Wrap existing content in PatternFly `Tabs`. Add `MetricsPage` as second tab.

---

## MetricsPage Layout

### Header row
- Title: "Metriche"
- PatternFly `Switch` labeled "Auto-refresh" (default: on)
- PatternFly `Button` variant=secondary: "Aggiorna"

### Metric cards (2×2 grid)
| Card | Value | Sub-label |
|------|-------|-----------|
| Dispatches | `dispatches` | `successRate`% success (green) or `—` |
| Events received | `eventsReceived` | "across all types" |
| Retries | `retries` | `exhausted` exhausted (amber if >0, else green "0") |
| Queue pending | `queuePending` | "idle" (green) or `queuePending` pending (amber if >0) |

Missing values (`null`) display as `—`.

### Raw Prometheus section
Below the cards: collapsible `ExpandableSection` (collapsed by default) titled "Raw Prometheus". Contains a monospace `<pre>` block with the raw text as returned by the endpoint.

---

## Auto-Refresh Behavior

- Fixed interval: **10 seconds**
- Toggle on: `setInterval` starts; first tick fires immediately (calls `fetchMetrics()`)
- Toggle off: `clearInterval`
- Default: **on**
- Manual "Aggiorna" button: calls `fetchMetrics()` directly, does not reset the interval timer
- Loading state: spinner shown only on the initial fetch (while `parsedMetrics === null` and no error)
- Subsequent auto-refreshes update silently (no spinner)
- On unmount: interval is cleared

---

## Error Handling

- Fetch failure: show PatternFly `Alert` (variant=danger) with the error message. Previously-fetched metric cards remain visible if available.
- Parse error on a single metric field: that field becomes `null`, displayed as `—`. Other fields are unaffected.
- Empty response: all fields `null`, all cards show `—`.

---

## Testing

**`webhook-ui/src/__tests__/parseMetrics.test.ts`**

Unit tests for `parseMetrics`:
- Happy path: realistic Prometheus text → correct numeric values
- Missing metric lines → affected fields are `null`, others intact
- Empty string → all fields `null`
- Partial success/failure labels → `successRate` computed correctly

**`webhook-ui/src/__tests__/MetricsPage.test.tsx`**

Component tests (Vitest + Testing Library):
- Initial render: spinner visible, no cards
- After resolved fetch: 4 cards visible with correct values
- Fetch error: Alert danger shown
- "Aggiorna" button click: `getMetrics` called again
- Auto-refresh toggle off: interval is cancelled (mock `setInterval`/`clearInterval`)

No E2E tests — the metrics page is read-only and values depend on a live Keycloak instance.

---

## Backend

No backend changes. The `/metrics` endpoint already exists and returns Prometheus text format 0.0.4.

---

## Out of Scope

- Configurable refresh interval (future settings page)
- Charts or time-series visualization
- Circuit breaker state per webhook on this page

---

## Implementation Status

**Implemented in v1.14.3 — matches spec, with one upgrade.**

`MetricsPage.tsx` delivers the 2×2 card grid (Dispatches, Events received, Retries, Queue pending), auto-refresh toggle, manual "Aggiorna" button, and collapsible raw Prometheus section. Parser in `parseMetrics.ts` handles the 6 metric families with null fallback. Integrated into the tabbed shell in `App.tsx`.

Upgrade vs. "out of scope" list: the refresh interval is now configurable via the settings page (`settings.metricsRefreshInterval`), completing the item the spec deferred. See `2026-04-07-settings-page-design.md`.
