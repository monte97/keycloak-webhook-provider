package dev.montell.keycloak.dispatch;

import dev.montell.keycloak.metrics.WebhookMetrics;
import dev.montell.keycloak.sender.HttpWebhookSender;

/**
 * Static holder for singleton components shared between the dispatcher and the REST API.
 * Initialized once during {@link
 * dev.montell.keycloak.listener.WebhookEventListenerProviderFactory#postInit} and accessed by
 * {@link dev.montell.keycloak.resources.WebhooksResource} for test pings, resend operations, and
 * circuit breaker resets.
 *
 * <p>Uses {@code volatile} fields for safe publication across threads.
 */
public final class WebhookComponentHolder {

    private static volatile HttpWebhookSender httpSender;
    private static volatile CircuitBreakerRegistry registry;
    private static volatile WebhookMetrics metrics;

    private WebhookComponentHolder() {}

    public static void init(HttpWebhookSender sender, CircuitBreakerRegistry reg) {
        httpSender = sender;
        registry = reg;
    }

    public static void init(
            HttpWebhookSender sender, CircuitBreakerRegistry reg, WebhookMetrics m) {
        httpSender = sender;
        registry = reg;
        metrics = m;
    }

    public static HttpWebhookSender httpSender() {
        return httpSender;
    }

    public static CircuitBreakerRegistry registry() {
        return registry;
    }

    public static WebhookMetrics metrics() {
        return metrics;
    }
}
