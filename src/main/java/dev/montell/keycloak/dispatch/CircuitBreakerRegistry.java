// src/main/java/dev/montell/keycloak/dispatch/CircuitBreakerRegistry.java
package dev.montell.keycloak.dispatch;

import dev.montell.keycloak.model.WebhookModel;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory cache of {@link CircuitBreaker} instances per webhook with 5-second TTL.
 * Avoids repeated DB reads in burst scenarios. State is eventually consistent (spec).
 */
public class CircuitBreakerRegistry {

    private static final long TTL_MS = 5_000;

    private final int failureThreshold;
    private final int openSeconds;
    private final ConcurrentHashMap<String, CachedEntry> cache = new ConcurrentHashMap<>();

    private record CachedEntry(CircuitBreaker cb, long cachedAtMs) {}

    public CircuitBreakerRegistry(int failureThreshold, int openSeconds) {
        this.failureThreshold = failureThreshold;
        this.openSeconds      = openSeconds;
    }

    /** Returns the cached CircuitBreaker or loads a fresh one from the WebhookModel. */
    public CircuitBreaker get(WebhookModel webhook) {
        return get(webhook, failureThreshold, openSeconds);
    }

    /**
     * Returns the cached CircuitBreaker or loads a fresh one using the provided thresholds.
     * Use this overload when realm-level attributes override the registry defaults.
     */
    public CircuitBreaker get(WebhookModel webhook, int failureThreshold, int openSeconds) {
        CachedEntry entry = cache.get(webhook.getId());
        if (entry != null && System.currentTimeMillis() - entry.cachedAtMs() < TTL_MS) {
            return entry.cb();
        }
        CircuitBreaker cb = CircuitBreaker.fromWebhook(webhook, failureThreshold, openSeconds);
        cache.put(webhook.getId(), new CachedEntry(cb, System.currentTimeMillis()));
        return cb;
    }

    /** Evict cached state after a state change so the next get() re-reads from the model. */
    public void invalidate(String webhookId) {
        cache.remove(webhookId);
    }
}
