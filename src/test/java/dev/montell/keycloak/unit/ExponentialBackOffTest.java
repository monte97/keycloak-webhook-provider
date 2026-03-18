package dev.montell.keycloak.unit;

import dev.montell.keycloak.dispatch.ExponentialBackOff;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ExponentialBackOffTest {

    /** Helper: backoff with jitter disabled (factor=0) for deterministic tests. */
    private ExponentialBackOff noJitter(long initialMs, long maxIntervalMs, long maxElapsedMs) {
        return new ExponentialBackOff(initialMs, maxIntervalMs, maxElapsedMs, 5.0, 0.0);
    }

    @Test
    void first_delay_equals_initial_interval_when_no_jitter() {
        ExponentialBackOff bo = noJitter(500, 180_000, 900_000);
        assertEquals(500, bo.nextBackOffMillis());
    }

    @Test
    void second_delay_is_multiplied() {
        ExponentialBackOff bo = noJitter(500, 180_000, 900_000);
        bo.nextBackOffMillis(); // 500
        assertEquals(2_500, bo.nextBackOffMillis()); // 500 * 5
    }

    @Test
    void interval_is_capped_at_maxInterval() {
        ExponentialBackOff bo = noJitter(500, 1_000, 900_000);
        // 500 → 2500 (capped to 1000) → 1000 → ...
        bo.nextBackOffMillis(); // 500
        long d2 = bo.nextBackOffMillis();
        assertTrue(d2 <= 1_000, "capped; was " + d2);
        long d3 = bo.nextBackOffMillis();
        assertTrue(d3 <= 1_000);
    }

    @Test
    void returns_STOP_after_maxElapsedTime() throws InterruptedException {
        // maxElapsed=1ms — expires immediately after a brief wait
        ExponentialBackOff bo = noJitter(500, 180_000, 1);
        Thread.sleep(5);
        assertEquals(ExponentialBackOff.STOP, bo.nextBackOffMillis());
    }

    @Test
    void with_jitter_delay_is_within_expected_range() {
        ExponentialBackOff bo = new ExponentialBackOff(500, 180_000, 900_000, 5.0, 0.5);
        long delay = bo.nextBackOffMillis();
        // factor=0.5: range = [500*(1-0.5), 500*(1+0.5)] = [250, 750]
        assertTrue(delay >= 250 && delay <= 750, "delay out of range: " + delay);
    }
}
