# HALF_OPEN Circuit Breaker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict HALF_OPEN state to the circuit breaker — exactly one probe request after timeout, all others blocked until the probe completes.

**Architecture:** Add an `AtomicBoolean probeInFlight` to `CircuitBreaker`. When OPEN and timeout expires, `allowRequest()` atomically transitions to HALF_OPEN and allows one probe. On probe result, transition to CLOSED (success) or OPEN with timer reset (failure). Dispatcher gets a better log message.

**Tech Stack:** Java 17, JUnit 5, Mockito

---

### Task 1: CircuitBreaker — add HALF_OPEN with atomic probe gate

**Files:**
- Modify: `src/main/java/dev/montell/keycloak/dispatch/CircuitBreaker.java`
- Test: `src/test/java/dev/montell/keycloak/unit/CircuitBreakerTest.java`

- [ ] **Step 1: Write the new failing test — HALF_OPEN blocks concurrent requests**

In `src/test/java/dev/montell/keycloak/unit/CircuitBreakerTest.java`, add this test after `probe_failure_stays_open_and_resets_timer` (after line 113):

```java
@Test
void half_open_blocks_concurrent_requests() {
    CircuitBreaker cb = new CircuitBreaker(1, 60);
    Instant t0 = Instant.now();
    cb.onFailure(t0); // OPEN
    Instant probeTime = t0.plusSeconds(61);

    // First call wins the probe
    assertTrue(cb.allowRequest(probeTime));
    assertEquals(CircuitBreaker.HALF_OPEN, cb.getState());

    // Second concurrent call is blocked
    assertFalse(cb.allowRequest(probeTime));
}
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `make test-unit BUILD=local`
Expected: FAIL — `half_open_blocks_concurrent_requests` fails because the current `allowRequest()` returns true for both calls (no probe gating, and state doesn't transition to HALF_OPEN).

- [ ] **Step 3: Implement the `probeInFlight` field and updated `allowRequest()`**

In `src/main/java/dev/montell/keycloak/dispatch/CircuitBreaker.java`:

Add import at the top (after line 5):

```java
import java.util.concurrent.atomic.AtomicBoolean;
```

Add new field after `openSeconds` (after line 24):

```java
private final AtomicBoolean probeInFlight = new AtomicBoolean(false);
```

Replace the `allowRequest(Instant now)` method (lines 52-55) with:

```java
public boolean allowRequest(Instant now) {
    if (CLOSED.equals(state)) return true;
    if (HALF_OPEN.equals(state)) {
        return probeInFlight.compareAndSet(false, true);
    }
    // OPEN: check if timeout has elapsed
    if (lastFailureAt != null && now.isAfter(lastFailureAt.plusSeconds(openSeconds))) {
        if (probeInFlight.compareAndSet(false, true)) {
            state = HALF_OPEN;
            return true;
        }
    }
    return false;
}
```

- [ ] **Step 4: Run tests to check progress**

Run: `make test-unit BUILD=local`
Expected: `half_open_blocks_concurrent_requests` passes. Some existing tests may need updates (next steps).

- [ ] **Step 5: Update `onSuccess()` to reset `probeInFlight`**

Replace the `onSuccess()` method (lines 58-62) with:

```java
public void onSuccess() {
    state = CLOSED;
    failureCount = 0;
    lastFailureAt = null;
    probeInFlight.set(false);
}
```

- [ ] **Step 6: Update `onFailure(Instant now)` to handle HALF_OPEN → OPEN transition**

Replace the `onFailure(Instant now)` method (lines 69-73) with:

```java
public void onFailure(Instant now) {
    if (HALF_OPEN.equals(state)) {
        state = OPEN;
        lastFailureAt = now;
        probeInFlight.set(false);
        return;
    }
    failureCount++;
    lastFailureAt = now;
    if (failureCount >= failureThreshold) state = OPEN;
}
```

- [ ] **Step 7: Update existing test — `allows_probe_after_open_seconds_elapsed`**

This test (lines 56-62) currently only checks that `allowRequest()` returns true after the timeout. Now it should also verify the state transitions to HALF_OPEN. Replace it with:

```java
@Test
void allows_probe_after_open_seconds_elapsed() {
    CircuitBreaker cb = new CircuitBreaker(1, 60);
    Instant t0 = Instant.now();
    cb.onFailure(t0);
    assertFalse(cb.allowRequest(t0.plusSeconds(59)));
    assertTrue(cb.allowRequest(t0.plusSeconds(61)));
    assertEquals(CircuitBreaker.HALF_OPEN, cb.getState());
}
```

- [ ] **Step 8: Update existing test — `probe_failure_stays_open_and_resets_timer`**

This test (lines 99-113) now needs to account for the HALF_OPEN transition and `probeInFlight` reset. The behavior changes: after probe failure in HALF_OPEN, `failureCount` is NOT incremented (the HALF_OPEN branch returns early). Replace it with:

```java
@Test
void probe_failure_stays_open_and_resets_timer() {
    CircuitBreaker cb = new CircuitBreaker(1, 60);
    Instant t1 = Instant.now();
    cb.onFailure(t1); // OPEN at t1
    int countAfterOpen = cb.getFailureCount();

    assertTrue(cb.allowRequest(t1.plusSeconds(61))); // probe allowed → HALF_OPEN
    assertEquals(CircuitBreaker.HALF_OPEN, cb.getState());

    cb.onFailure(t1.plusSeconds(61)); // probe fails → OPEN, timer reset
    assertEquals(CircuitBreaker.OPEN, cb.getState());
    assertEquals(t1.plusSeconds(61), cb.getLastFailureAt());
    assertEquals(countAfterOpen, cb.getFailureCount()); // count unchanged by HALF_OPEN failure

    // New timer: blocked at (t1+61)+1s, allowed at (t1+61)+61s
    assertFalse(cb.allowRequest(t1.plusSeconds(62)));
    assertTrue(cb.allowRequest(t1.plusSeconds(122)));
    assertEquals(CircuitBreaker.HALF_OPEN, cb.getState()); // new probe started
}
```

- [ ] **Step 9: Update existing test — `half_open_state_allows_requests_via_fromWebhook`**

This test (lines 83-97) loads HALF_OPEN from DB. With the new logic, the first `allowRequest()` call acquires the probe gate, and a second call should be blocked. Replace it with:

```java
@Test
void half_open_state_allows_requests_via_fromWebhook() {
    WebhookModel mockWebhook = mock(WebhookModel.class);
    when(mockWebhook.getCircuitState()).thenReturn(CircuitBreaker.HALF_OPEN);
    when(mockWebhook.getFailureCount()).thenReturn(3);
    when(mockWebhook.getLastFailureAt()).thenReturn(Instant.now());

    CircuitBreaker cb = CircuitBreaker.fromWebhook(mockWebhook, 5, 60);

    assertEquals(CircuitBreaker.HALF_OPEN, cb.getState());
    assertTrue(cb.allowRequest()); // first call acquires probe
    assertFalse(cb.allowRequest()); // second call blocked
}
```

- [ ] **Step 10: Add new test — `probe_in_flight_reset_on_success`**

```java
@Test
void probe_in_flight_reset_on_success() {
    CircuitBreaker cb = new CircuitBreaker(1, 60);
    Instant t0 = Instant.now();
    cb.onFailure(t0); // OPEN

    assertTrue(cb.allowRequest(t0.plusSeconds(61))); // probe → HALF_OPEN
    cb.onSuccess(); // → CLOSED, probeInFlight reset
    assertEquals(CircuitBreaker.CLOSED, cb.getState());

    // A new failure cycle can trigger a new probe
    cb.onFailure(t0.plusSeconds(200)); // OPEN again
    assertEquals(CircuitBreaker.OPEN, cb.getState());
    assertTrue(cb.allowRequest(t0.plusSeconds(261))); // new probe works
    assertEquals(CircuitBreaker.HALF_OPEN, cb.getState());
}
```

- [ ] **Step 11: Add new test — `probe_in_flight_reset_on_failure`**

```java
@Test
void probe_in_flight_reset_on_failure() {
    CircuitBreaker cb = new CircuitBreaker(1, 60);
    Instant t0 = Instant.now();
    cb.onFailure(t0); // OPEN

    assertTrue(cb.allowRequest(t0.plusSeconds(61))); // probe → HALF_OPEN
    cb.onFailure(t0.plusSeconds(61)); // probe fails → OPEN, timer reset, probeInFlight reset
    assertEquals(CircuitBreaker.OPEN, cb.getState());

    // probeInFlight was reset — a new probe can start after timeout
    assertTrue(cb.allowRequest(t0.plusSeconds(122))); // new probe
    assertEquals(CircuitBreaker.HALF_OPEN, cb.getState());
}
```

- [ ] **Step 12: Run all tests**

Run: `make test-unit BUILD=local`
Expected: all tests pass.

- [ ] **Step 13: Commit**

```bash
git add src/main/java/dev/montell/keycloak/dispatch/CircuitBreaker.java \
       src/test/java/dev/montell/keycloak/unit/CircuitBreakerTest.java
git commit -m "feat: add strict HALF_OPEN state with atomic probe gate to circuit breaker"
```

---

### Task 2: Dispatcher — update skip log to distinguish OPEN from HALF_OPEN

**Files:**
- Modify: `src/main/java/dev/montell/keycloak/dispatch/WebhookEventDispatcher.java:228-232`

- [ ] **Step 1: Update the skip log message**

In `src/main/java/dev/montell/keycloak/dispatch/WebhookEventDispatcher.java`, replace lines 228-232:

```java
            if (!cb.allowRequest()) {
                log.debugf(
                        "Circuit OPEN for webhook %s — skipping %s",
                        webhook.getId(), payload.type());
                continue;
            }
```

with:

```java
            if (!cb.allowRequest()) {
                String reason =
                        CircuitBreaker.HALF_OPEN.equals(cb.getState())
                                ? "probe in flight"
                                : "circuit OPEN";
                log.debugf(
                        "Skipping webhook %s — %s — %s",
                        webhook.getId(), reason, payload.type());
                continue;
            }
```

- [ ] **Step 2: Run tests**

Run: `make test-unit BUILD=local`
Expected: all tests pass (log message changes don't break any assertions).

- [ ] **Step 3: Run formatting check**

Run: `make fmt-check BUILD=local`
If it fails: `make fmt BUILD=local` then re-verify.

- [ ] **Step 4: Commit**

```bash
git add src/main/java/dev/montell/keycloak/dispatch/WebhookEventDispatcher.java
git commit -m "feat: distinguish OPEN vs HALF_OPEN probe-in-flight in dispatcher skip log"
```
