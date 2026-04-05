// src/main/java/dev/montell/keycloak/dispatch/CircuitBreaker.java
package dev.montell.keycloak.dispatch;

import dev.montell.keycloak.model.WebhookModel;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * State machine for a single webhook's circuit breaker. State: CLOSED (normal) ──N failures──▶ OPEN
 * ──openSeconds──▶ probe ──success──▶ CLOSED └──fail──▶ OPEN (reset timer)
 *
 * <p>State is persisted to {@link WebhookModel} via {@link #applyTo(WebhookModel)}.
 */
public class CircuitBreaker {

    public static final String CLOSED = "CLOSED";
    public static final String OPEN = "OPEN";
    public static final String HALF_OPEN = "HALF_OPEN";

    private volatile String state;
    private int failureCount;
    private Instant lastFailureAt;

    private final int failureThreshold;
    private final int openSeconds;
    private final AtomicBoolean probeInFlight = new AtomicBoolean(false);

    public CircuitBreaker(int failureThreshold, int openSeconds) {
        this.state = CLOSED;
        this.failureCount = 0;
        this.lastFailureAt = null;
        this.failureThreshold = failureThreshold;
        this.openSeconds = openSeconds;
    }

    /** Load state from a persisted WebhookModel. */
    public static CircuitBreaker fromWebhook(
            WebhookModel w, int failureThreshold, int openSeconds) {
        CircuitBreaker cb = new CircuitBreaker(failureThreshold, openSeconds);
        cb.state = w.getCircuitState() != null ? w.getCircuitState() : CLOSED;
        cb.failureCount = w.getFailureCount();
        cb.lastFailureAt = w.getLastFailureAt();
        return cb;
    }

    /**
     * Returns true if a request should be attempted now.
     *
     * <ul>
     *   <li>CLOSED → always allowed.</li>
     *   <li>HALF_OPEN → only the first concurrent caller; all others are blocked until the probe
     *       completes (success or failure).</li>
     *   <li>OPEN → only the first caller after {@code openSeconds} have elapsed; transitions to
     *       HALF_OPEN atomically.</li>
     * </ul>
     */
    public boolean allowRequest() {
        return allowRequest(Instant.now());
    }

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

    /** Called on send success: reset to CLOSED. */
    public void onSuccess() {
        state = CLOSED;
        failureCount = 0;
        lastFailureAt = null;
        probeInFlight.set(false);
    }

    /** Called on send failure: increment count; open circuit if threshold exceeded. */
    public void onFailure() {
        onFailure(Instant.now());
    }

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

    /** Persist current state back to a WebhookModel (call inside a transaction). */
    public void applyTo(WebhookModel w) {
        w.setCircuitState(state);
        w.setFailureCount(failureCount);
        w.setLastFailureAt(lastFailureAt);
    }

    public String getState() {
        return state;
    }

    public int getFailureCount() {
        return failureCount;
    }

    public Instant getLastFailureAt() {
        return lastFailureAt;
    }

    public int getFailureThreshold() {
        return failureThreshold;
    }
}
