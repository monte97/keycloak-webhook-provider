# HALF_OPEN Circuit Breaker State — Design

**Date:** 2026-04-05

---

## Goal

Add a proper HALF_OPEN state to the circuit breaker so that after the open timeout expires, exactly one probe request is allowed through. All other requests are blocked until the probe completes. This prevents flooding a recovering endpoint with multiple simultaneous requests.

---

## Scope

- Backend only — no UI changes, no schema migration, no new endpoints.
- The HALF_OPEN state is transient (in-memory only). It is never persisted to the database. If the process crashes during a probe, the DB state remains OPEN, and a new probe starts after the timeout re-expires on restart.
- Metrics already support HALF_OPEN (gauge value 1.0). No changes needed.
- The UI already displays circuit state with a gold label for non-CLOSED/OPEN states. No changes needed.

---

## State Machine

```
CLOSED ──(≥threshold failures)──▶ OPEN
                                    │
                                    │ (openSeconds elapsed + first allowRequest())
                                    │ probeInFlight.compareAndSet(false, true)
                                    ▼
                                 HALF_OPEN
                                    │
                        ┌───────────┴───────────┐
                        │                       │
                   onSuccess()             onFailure()
                        │                       │
                        ▼                       ▼
                     CLOSED              OPEN (timer reset)
                  (probeInFlight=false)  (probeInFlight=false)
```

**Concurrent requests during HALF_OPEN:** blocked (same as OPEN). Only the single probe thread is allowed through.

---

## CircuitBreaker Changes

**New field:**

```java
private final AtomicBoolean probeInFlight = new AtomicBoolean(false);
```

**`allowRequest()` — updated logic:**

1. If state is CLOSED → return true
2. If state is HALF_OPEN:
   - Attempt `probeInFlight.compareAndSet(false, true)` → if success, return true (new probe)
   - If `probeInFlight` is already true → return false (probe already in flight)
3. If state is OPEN:
   - If `openSeconds` have NOT elapsed since `lastFailureAt` → return false
   - If `openSeconds` HAVE elapsed → attempt `probeInFlight.compareAndSet(false, true)`:
     - Success: set state to HALF_OPEN, return true (this thread is the probe)
     - Failure: return false (another thread won the race)

**`onSuccess()` — updated logic:**

- Set state to CLOSED
- Reset `failureCount` to 0
- Clear `lastFailureAt` to null
- `probeInFlight.set(false)`

**`onFailure()` — updated logic (when state is HALF_OPEN):**

- Set state to OPEN
- Reset `lastFailureAt` to now (restarts the timeout)
- `probeInFlight.set(false)`
- (When state is CLOSED, existing behavior unchanged: increment count, open if threshold reached)

**`fromWebhook()` — no change:**

Already handles HALF_OPEN loaded from DB. The `probeInFlight` starts as `false`, so the next `allowRequest()` call in HALF_OPEN state will attempt a new probe via `compareAndSet`.

---

## WebhookEventDispatcher Changes

**Minimal change to `sendWithRetry()`:** update the skip log message to distinguish OPEN from HALF_OPEN with probe in flight.

```java
if (!cb.allowRequest()) {
    String reason = cb.getState().equals(CircuitBreaker.HALF_OPEN)
        ? "probe in flight" : "circuit OPEN";
    log.debugf("Skipping webhook %s — %s", webhook.getId(), reason);
    continue;
}
```

**Persistence logic — no change.** The probe result triggers `onSuccess()` → CLOSED or `onFailure()` → OPEN. The dispatcher persists whichever state the CB is in after the send. HALF_OPEN is never persisted because the transition to CLOSED or OPEN happens synchronously before persistence.

---

## Files to Change

- `src/main/java/dev/montell/keycloak/dispatch/CircuitBreaker.java` — add `AtomicBoolean probeInFlight`, update `allowRequest()`, `onSuccess()`, `onFailure()`
- `src/main/java/dev/montell/keycloak/dispatch/WebhookEventDispatcher.java` — update skip log message (~line 228)
- `src/test/java/dev/montell/keycloak/unit/CircuitBreakerTest.java` — update 3 existing tests, add 3 new tests

---

## Testing

### Existing tests to update

- `allows_probe_after_open_seconds_elapsed` — verify state becomes HALF_OPEN and `probeInFlight` is true after `allowRequest()` returns true
- `probe_success_transitions_to_closed` — verify `probeInFlight` is false after `onSuccess()`
- `probe_failure_stays_open_and_resets_timer` — verify `probeInFlight` is false after `onFailure()`

### New tests

- `half_open_blocks_concurrent_requests` — first `allowRequest()` after timeout returns true (probe), second concurrent `allowRequest()` returns false
- `probe_in_flight_reset_on_success` — after probe success and CLOSED transition, a new failure cycle can trigger a new probe
- `probe_in_flight_reset_on_failure` — after probe failure, state is OPEN with reset timer, `probeInFlight` is false, a new probe can start after timeout re-expires

---

## Out of Scope

- Metrics dashboard UI page (separate feature, to be brainstormed next)
- Persisting HALF_OPEN state to database
- Queuing events during HALF_OPEN (decided against — events are skipped and retried via their own backoff)
- Configurable probe count (always exactly 1)
