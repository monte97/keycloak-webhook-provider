package dev.montell.keycloak.dispatch;

import dev.montell.keycloak.sender.HttpWebhookSender;

public final class WebhookComponentHolder {

    private static volatile HttpWebhookSender httpSender;
    private static volatile CircuitBreakerRegistry registry;

    private WebhookComponentHolder() {}

    public static void init(HttpWebhookSender sender, CircuitBreakerRegistry reg) {
        httpSender = sender;
        registry = reg;
    }

    public static HttpWebhookSender httpSender() { return httpSender; }
    public static CircuitBreakerRegistry registry() { return registry; }
}
