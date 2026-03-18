package dev.montell.keycloak.dispatch;

import java.util.concurrent.ThreadLocalRandom;

/**
 * Exponential backoff with jitter. One instance per retry chain — not thread-safe.
 * Call {@link #nextBackOffMillis()} to get the next delay; returns {@link #STOP} when
 * maxElapsedTime is exceeded.
 *
 * <p>Default spec: 500ms initial, 180s max interval, 900s max elapsed, ×5 multiplier, 0.5 jitter.
 */
public class ExponentialBackOff {

    public static final long STOP = -1L;

    private final long initialIntervalMs;
    private final long maxIntervalMs;
    private final long maxElapsedTimeMs;
    private final double multiplier;
    private final double randomizationFactor;

    private long currentIntervalMs;
    private final long startMs;

    /** Convenience constructor using spec defaults; overrides per-webhook via maxElapsed/maxInterval. */
    public ExponentialBackOff(long maxElapsedSeconds, long maxIntervalSeconds) {
        this(500, maxIntervalSeconds * 1_000, maxElapsedSeconds * 1_000, 5.0, 0.5);
    }

    public ExponentialBackOff(long initialIntervalMs, long maxIntervalMs, long maxElapsedTimeMs,
                               double multiplier, double randomizationFactor) {
        this.initialIntervalMs   = initialIntervalMs;
        this.maxIntervalMs       = maxIntervalMs;
        this.maxElapsedTimeMs    = maxElapsedTimeMs;
        this.multiplier          = multiplier;
        this.randomizationFactor = randomizationFactor;
        this.currentIntervalMs   = initialIntervalMs;
        this.startMs             = System.currentTimeMillis();
    }

    /**
     * Returns the delay for the next retry in milliseconds, or {@link #STOP} if
     * {@code maxElapsedTime} has been exceeded.
     */
    public long nextBackOffMillis() {
        long elapsed = System.currentTimeMillis() - startMs;
        if (elapsed >= maxElapsedTimeMs) return STOP;

        long delay = applyRandomization(currentIntervalMs);
        currentIntervalMs = Math.min((long) (currentIntervalMs * multiplier), maxIntervalMs);
        return delay;
    }

    private long applyRandomization(long interval) {
        if (randomizationFactor == 0.0) return interval;
        double delta = randomizationFactor * interval;
        double low   = interval - delta;
        double high  = interval + delta;
        return (long) (low + ThreadLocalRandom.current().nextDouble() * (high - low));
    }
}
