# Resend by Delivery ID — Design

**Date:** 2026-04-05

---

## Goal

Allow operators to manually re-trigger a specific past delivery attempt from the admin UI, with an optional flag to bypass the circuit breaker when it is OPEN.

---

## Scope

- No database schema migration — existing `WebhookSendEntity` structure is unchanged.
- No new API endpoint — the existing `POST /{webhookId}/sends/{sendId}/resend` endpoint is extended.
- Resend reuses the current upsert semantics: the existing send record is updated in place (same behavior as automatic retries).

---

## Backend

### Endpoint change

**`POST /realms/{realm}/webhooks/{webhookId}/sends/{sendId}/resend?force={bool}`**

New query parameter:

| Param | Type | Default | Description |
|---|---|---|---|
| `force` | boolean | `false` | If `true`, bypasses the circuit breaker OPEN check and dispatches unconditionally |

**Existing behavior (unchanged when `force=false`):**
- If the circuit breaker for `webhookId` is OPEN → return HTTP 409
- Otherwise → dispatch, upsert the send record, return `{httpStatus, success, durationMs}`

**New behavior (`force=true`):**
- Skip the circuit breaker state check entirely
- Dispatch unconditionally
- Upsert the send record and return `{httpStatus, success, durationMs}`
- The circuit breaker state itself is **not reset** by a forced resend — it continues its normal open/close lifecycle

### Files to change

- `src/main/java/dev/montell/keycloak/resources/WebhooksResource.java` — add `@QueryParam("force") @DefaultValue("false") boolean force` to `resendSingle()` and pass it through
- `src/main/java/dev/montell/keycloak/dispatch/WebhookEventDispatcher.java` — expose a way to skip the circuit breaker guard (parameter or overload) in `sendWithRetry()` or the method it delegates to

### Error handling

- `force=true` with an unknown `sendId` → 404 (unchanged)
- `force=true` with an unknown `webhookId` → 404 (unchanged)
- Network failure during a forced resend → 200 with `success=false` and the HTTP status from the attempt (unchanged, same as normal resend)

---

## Frontend

### `webhookApi.ts`

Add method:

```ts
resendSingle(webhookId: string, sendId: string, force: boolean): Promise<ResendResult>
```

Calls `POST /realms/{realm}/webhooks/{webhookId}/sends/{sendId}/resend?force={force}`.

`ResendResult`:

```ts
interface ResendResult {
  httpStatus: number;
  success: boolean;
  durationMs: number;
}
```

### `DeliveryDrawer.tsx`

Add a **Resend** action button on each row of the delivery history table.

**Flow — circuit CLOSED:**
1. User clicks Resend on a row
2. Call `api.resendSingle(webhookId, sendId, false)`
3. On completion: call `loadSends()` to refresh the list
4. Show inline toast: success or error message

**Flow — circuit OPEN:**
1. User clicks Resend on a row
2. Show confirmation dialog:
   - Warning banner: "The circuit breaker is currently OPEN. The endpoint may still be unreachable."
   - Checkbox: "Force send anyway" (unchecked by default)
   - Buttons: Cancel / Resend
3. On confirm: call `api.resendSingle(webhookId, sendId, force)` where `force` reflects the checkbox state
4. On completion: call `loadSends()`, show toast

The component already has access to circuit breaker state (loaded in `loadCircuit()`), so no new data fetching is needed to decide which flow to use.

---

## Out of scope

- New send record per manual resend (requires schema migration — deferred)
- `resend_of` audit chain (deferred with above)
- HALF_OPEN circuit breaker state (separate roadmap item)
- Bulk force-resend
