package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;

import dev.montell.keycloak.dispatch.ExponentialBackOff;
import org.junit.jupiter.api.Test;

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

    @Test
    void returns_STOP_immediately_when_maxElapsed_is_zero() {
        // maxElapsed=0: elapsed >= 0 is always true → STOP immediately
        // Mutation ">=" → ">" would require elapsed > 0, which is false at t=0 → doesn't return
        // STOP
        ExponentialBackOff bo = noJitter(500, 180_000, 0);
        assertEquals(ExponentialBackOff.STOP, bo.nextBackOffMillis());
    }

    @Test
    void jitter_is_symmetric_around_interval() {
        // 50 samples from interval=10000, factor=0.5 → range [5000, 15000]
        // Kills all 5 arithmetic mutations in applyRandomization:
        //   min < 9000 kills: delta = * → / (≈0 → range ~[10000,10000]), low = - → + (→ range
        // [15000,15000])
        //   max > 11000 kills: high = + → - (→ range [5000,5000]), return formula * → / (→ range
        // ~[5000,5000])
        //   max <= 15001 kills: return formula - → + (→ range [5000,25000])
        long min = Long.MAX_VALUE;
        long max = Long.MIN_VALUE;
        for (int i = 0; i < 50; i++) {
            ExponentialBackOff bo = new ExponentialBackOff(10_000, 180_000, 900_000, 1.0, 0.5);
            long d = bo.nextBackOffMillis();
            if (d < min) min = d;
            if (d > max) max = d;
        }
        assertTrue(min < 9_000, "min=" + min + " expected < 9000");
        assertTrue(max > 11_000, "max=" + max + " expected > 11000");
        assertTrue(max <= 15_001, "max=" + max + " expected <= 15001");
    }
}
