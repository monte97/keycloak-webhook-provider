# UI Completeness Design

## Goal

Close 4 UI gaps: event history tab in DeliveryDrawer, webhook list pagination, webhook creation date display, and rotation expiry display. Frontend-only changes — no backend modifications.

## Architecture

Four independent changes to existing React components. No new files except additions to `types.ts` and `webhookApi.ts`. All changes follow established patterns in the codebase (PatternFly v5, existing `formatRelative`, existing pagination style).

**Tech Stack:** React + PatternFly v5 (frontend only).

---

## Change 1: Events Tab in DeliveryDrawer

### Layout

Below the circuit breaker section, replace the bare "Delivery history" heading with a PatternFly `Tabs` component:

- **Tab 1 — Deliveries:** existing sends table (filter buttons, resend failed, table, pagination) — identical to current implementation
- **Tab 2 — Events:** new table fetching `GET /{id}/events`

Default active tab: Deliveries.

### Events Tab Content

Table columns: `Event type` | `Captured at` | `Actions`

- `Event type`: plain text, value from `eventType` field (`USER` or `ADMIN`)
- `Captured at`: `formatRelative(event.createdAt)` (reuse existing helper)
- `Actions`: single `Payload` button — on click, opens existing `PayloadPreviewModal` with `event.eventObject` directly (no additional API call; the field is already included in the `getEvents` response)

Pagination: same Prev/Next style as sends, same `pageSize` prop.

Loading and error states follow sends pattern: `Spinner` while loading, inline `Alert variant="danger"` on error.

**Lazy loading:** events are fetched only when the Events tab is first clicked (not on drawer open). Tab state resets when a different webhook is selected.

### New type (`types.ts`)

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

### New API method (`webhookApi.ts`)

```ts
getEvents(id: string, params?: { first?: number; max?: number }): Promise<WebhookEvent[]>
```

Maps to `GET /{id}/events?first=N&max=N`.

---

## Change 2: Webhook List Pagination

### API call

`api.list()` gains an optional params argument:

```ts
list(params?: { first?: number; max?: number }): Promise<Webhook[]>
```

### WebhookTable changes

- Page size: fixed 20 (independent from delivery history page size)
- State: `currentPage` (number, starts at 1), `hasMore` (boolean)
- `fetchWebhooks(page)` passes `{ first: (page - 1) * 20, max: 20 }` to `api.list()`
- `hasMore = result.length === 20`
- Polling (`setInterval`) refreshes `currentPage`, not page 1

Pagination controls below the table — identical markup to DeliveryDrawer (Prev/Next buttons + "Pagina N" label).

---

## Change 3: createdAt in DrawerHead

In `DeliveryDrawer`, below the URL `<Title>`, add:

```tsx
<div style={{ fontSize: '0.875rem', color: '#6a6e73', marginTop: 4 }}>
  Created {formatRelative(webhook.createdAt)}
</div>
```

No new imports needed (`formatRelative` is already defined in the same file).

---

## Change 4: Rotation Expiry in Secret Section

In `DeliveryDrawer`, in the secret section, when `isRotating` is true:

- If `webhook.rotationExpiresAt` is a non-null string, render next to the "Rotating" label:
  ```tsx
  <span style={{ fontSize: '0.875rem', color: '#6a6e73' }}>
    expires {formatRelative(webhook.rotationExpiresAt)}
  </span>
  ```
- If `rotationExpiresAt` is null or undefined, show nothing extra (emergency rotation has no expiry).

---

## Testing

### Frontend unit (`DeliveryDrawer.test.tsx`)

- **Events tab:** clicking "Events" tab triggers `api.getEvents`, renders event rows with type and relative time
- **Events payload button:** clicking Payload on an event row opens `PayloadPreviewModal` with correct `eventObject`
- **Lazy load:** `api.getEvents` is NOT called on drawer open, only on tab click
- **createdAt:** drawer shows "Created X" in the header area
- **Rotation expiry:** when `rotationExpiresAt` is set and `hasSecondarySecret` is true, renders "expires X"
- **Rotation expiry absent:** when `rotationExpiresAt` is null, "expires" text is not rendered

### Frontend unit (`WebhookTable.test.tsx` / existing test file)

- `api.list` is called with `{ first: 0, max: 20 }` on initial load
- Clicking Next calls `api.list` with `{ first: 20, max: 20 }`
- Next button is disabled when result length < 20
- Prev button is disabled on page 1

### E2E (`e2e/tests/10-ui-completeness.spec.ts`)

1. Open a webhook drawer
2. Verify "Created" date is visible in the drawer header
3. Click "Events" tab
4. Verify events table is visible (at least 1 row after triggering a user cycle)
5. Click Payload on first event row
6. Verify PayloadPreviewModal opens with JSON containing "realmId"
