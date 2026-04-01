# Delivery History Drawer — Design Spec

**Date:** 2026-04-01  
**Scope:** Frontend only (`webhook-ui/src/`). Backend already complete.

---

## Problem

The backend already exposes full delivery history (`GET /{id}/sends`), circuit breaker detail (`GET /{id}/circuit`), and resend actions (`POST /{id}/resend-failed`, `POST /{id}/circuit/reset`). The UI has no way to access any of these.

---

## Solution

Add a **side drawer** (PatternFly `Drawer`) that opens when the user clicks a webhook row in the table. It shows:

1. **Circuit breaker section** — current state (CLOSED/OPEN/HALF_OPEN), failure count, last failure timestamp, thresholds from realm config. "Reset circuit" button.
2. **Delivery history section** — table of recent sends (up to 50). Toggle filter: All / Failed only. "Resend failed (24h)" button.

---

## Architecture

**New files:**
- `webhook-ui/src/components/DeliveryDrawer.tsx` — the drawer component

**Modified files:**
- `webhook-ui/src/api/types.ts` — add `WebhookSend`, `ResendResult` types
- `webhook-ui/src/api/webhookApi.ts` — add `getSends()`, `resendFailed()` methods
- `webhook-ui/src/components/WebhookTable.tsx` — integrate drawer (click row → open, pass `drawerWebhook` state)
- `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx` — unit tests

---

## New Types (`types.ts`)

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

---

## New API Methods (`webhookApi.ts`)

```ts
getSends(id: string, params?: { max?: number; success?: boolean }): Promise<WebhookSend[]>
resendFailed(id: string, hours?: number): Promise<ResendResult>
```

`resetCircuit(id)` already exists — no change needed.

---

## Drawer Layout

```
[x] Webhook: https://example.com/hook                    [close]
─────────────────────────────────────────────────────────
Circuit breaker
  CLOSED · 0 failures · last failure: —          [Reset circuit]

Delivery history                    [All ▼]  [Resend failed (24h)]
┌──────────┬────────┬──────────┬──────────────────┐
│ Status   │ HTTP   │ Retries  │ Sent at          │
├──────────┼────────┼──────────┼──────────────────┤
│ ✅ ok    │  200   │    0     │ 2 minutes ago    │
│ ❌ fail  │  503   │    5     │ 15 minutes ago   │
└──────────┴────────┴──────────┴──────────────────┘
```

- Drawer opens on the right, overlapping (not pushing) the table
- Clicking another row while drawer is open switches to that webhook
- "X" button or clicking outside closes the drawer
- Max 50 sends loaded on open; no pagination in this iteration

---

## Interaction Details

| Action | API call | UI feedback |
|--------|----------|-------------|
| Open drawer | `getSends(id)` + `getCircuit(id)` | spinner while loading |
| Toggle filter All/Failed | `getSends(id, {success: false})` | table updates |
| Resend failed (24h) | `resendFailed(id, 24)` | toast: "Resent N, failed M, skipped K" |
| Reset circuit | `resetCircuit(id)` | circuit section refreshes, main table polls update |

---

## Error Handling

- Load failure → inline error message in the drawer ("Failed to load delivery history")
- Resend failure → danger toast
- Reset circuit failure → danger toast
- Circuit section and sends section load independently; one can fail without blocking the other

---

## Testing

Unit tests for `DeliveryDrawer.tsx`:
1. Renders sends table with mock data (success + failed rows)
2. Toggle filter → calls `getSends` with `success=false`
3. "Resend failed" click → calls `resendFailed(id, 24)` and shows toast with counts
4. "Reset circuit" click → calls `resetCircuit(id)`
5. Error state → shows inline error when `getSends` rejects

---

## Out of scope

- Payload JSON viewer (can be added later)
- Configurable hours window for resend-failed (fixed at 24h)
- Pagination of sends (capped at 50)
- Per-send resend action (`POST /{id}/sends/{sid}/resend`)
