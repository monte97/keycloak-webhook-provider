// src/test/java/dev/montell/keycloak/unit/CircuitBreakerTest.java
package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import dev.montell.keycloak.dispatch.CircuitBreaker;
import dev.montell.keycloak.model.WebhookModel;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CircuitBreakerTest {

    @Test
    void starts_closed_and_allows_requests() {
        CircuitBreaker cb = new CircuitBreaker(5, 60);
        assertTrue(cb.allowRequest());
        assertEquals(CircuitBreaker.CLOSED, cb.getState());
    }

    @Test
    void opens_after_threshold_consecutive_failures() {
        CircuitBreaker cb = new CircuitBreaker(3, 60);
        cb.onFailure();
        assertEquals(CircuitBreaker.CLOSED, cb.getState());
        cb.onFailure();
        assertEquals(CircuitBreaker.CLOSED, cb.getState());
        cb.onFailure(); // 3rd = threshold
        assertEquals(CircuitBreaker.OPEN, cb.getState());
        assertFalse(cb.allowRequest());
    }

    @Test
    void success_resets_failure_count_so_circuit_does_not_open() {
        CircuitBreaker cb = new CircuitBreaker(3, 60);
        cb.onFailure();
        cb.onFailure();
        cb.onSuccess(); // reset
        assertEquals(CircuitBreaker.CLOSED, cb.getState());
        assertEquals(0, cb.getFailureCount());
        cb.onFailure(); // count restarts from 0 → not yet open
        assertEquals(CircuitBreaker.CLOSED, cb.getState());
    }

    @Test
    void open_circuit_blocks_requests() {
        CircuitBreaker cb = new CircuitBreaker(1, 60);
        cb.onFailure(); // threshold=1 → OPEN immediately
        assertFalse(cb.allowRequest(Instant.now()));
    }

    @Test
    void allows_probe_after_open_seconds_elapsed() {
        CircuitBreaker cb = new CircuitBreaker(1, 60);
        Instant t0 = Instant.now();
        cb.onFailure(t0);
        assertFalse(cb.allowRequest(t0.plusSeconds(59)));
        assertTrue(cb.allowRequest(t0.plusSeconds(61)));
    }

    @Test
    void probe_success_transitions_to_closed() {
        CircuitBreaker cb = new CircuitBreaker(1, 60);
        cb.onFailure();
        cb.onSuccess();
        assertEquals(CircuitBreaker.CLOSED, cb.getState());
        assertEquals(0, cb.getFailureCount());
        assertTrue(cb.allowRequest());
    }

    @Test
    void failure_count_increments_correctly() {
        CircuitBreaker cb = new CircuitBreaker(5, 60);
        cb.onFailure();
        assertEquals(1, cb.getFailureCount());
        cb.onFailure();
        assertEquals(2, cb.getFailureCount());
    }

    @Test
    void half_open_state_allows_requests_via_fromWebhook() {
        WebhookModel mockWebhook = mock(WebhookModel.class);
        when(mockWebhook.getCircuitState()).thenReturn(CircuitBreaker.HALF_OPEN);
        when(mockWebhook.getFailureCount()).thenReturn(3);
        // lastFailureAt is very recent — openSeconds=60 has NOT elapsed yet.
        // Without the HALF_OPEN branch, the fallback (isAfter(lastFailureAt+60s)) returns false.
        // This distinguishes HALF_OPEN (always-allow) from the time-based probe window.
        when(mockWebhook.getLastFailureAt()).thenReturn(Instant.now());

        CircuitBreaker cb = CircuitBreaker.fromWebhook(mockWebhook, 5, 60);

        assertEquals(CircuitBreaker.HALF_OPEN, cb.getState());
        assertTrue(cb.allowRequest());
    }

    @Test
    void probe_failure_stays_open_and_resets_timer() {
        CircuitBreaker cb = new CircuitBreaker(1, 60);
        Instant t1 = Instant.now();
        cb.onFailure(t1); // OPEN at t1

        assertTrue(cb.allowRequest(t1.plusSeconds(61))); // probe allowed
        cb.onFailure(t1.plusSeconds(61)); // probe fails — OPEN, timer reset to t1+61
        assertEquals(CircuitBreaker.OPEN, cb.getState());
        assertEquals(t1.plusSeconds(61), cb.getLastFailureAt());

        // New timer: blocked at (t1+61)+1s, allowed at (t1+61)+61s
        assertFalse(cb.allowRequest(t1.plusSeconds(62)));
        assertTrue(cb.allowRequest(t1.plusSeconds(122)));
    }
}
