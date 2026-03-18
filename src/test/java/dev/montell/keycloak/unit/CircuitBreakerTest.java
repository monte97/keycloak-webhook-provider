// src/test/java/dev/montell/keycloak/unit/CircuitBreakerTest.java
package dev.montell.keycloak.unit;

import dev.montell.keycloak.dispatch.CircuitBreaker;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

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
        cb.onFailure(); assertEquals(CircuitBreaker.CLOSED, cb.getState());
        cb.onFailure(); assertEquals(CircuitBreaker.CLOSED, cb.getState());
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
    void probe_failure_stays_open_and_resets_timer() {
        CircuitBreaker cb = new CircuitBreaker(1, 60);
        Instant t1 = Instant.now();
        cb.onFailure(t1); // OPEN at t1

        assertTrue(cb.allowRequest(t1.plusSeconds(61))); // probe allowed
        cb.onFailure(t1.plusSeconds(61));                // probe fails — OPEN, timer reset to t1+61
        assertEquals(CircuitBreaker.OPEN, cb.getState());
        assertEquals(t1.plusSeconds(61), cb.getLastFailureAt());

        // New timer: blocked at (t1+61)+1s, allowed at (t1+61)+61s
        assertFalse(cb.allowRequest(t1.plusSeconds(62)));
        assertTrue(cb.allowRequest(t1.plusSeconds(122)));
    }
}
