package dev.montell.keycloak.metrics;

import io.prometheus.client.CollectorRegistry;
import io.prometheus.client.Counter;
import io.prometheus.client.Gauge;
import io.prometheus.client.Histogram;

/**
 * Prometheus metrics for webhook dispatch. Thread-safe singleton.
 *
 * <p>Use the no-arg constructor for production (registers in the default {@link
 * CollectorRegistry}). Pass a custom registry in tests to avoid cross-test pollution.
 */
public class WebhookMetrics {

    private final Counter eventsReceived;
    private final Counter dispatches;
    private final Histogram dispatchDuration;
    private final Counter retries;
    private final Counter retriesExhausted;
    private final Counter eventsDropped;
    private final Gauge circuitState;
    private final Gauge queuePending;

    public WebhookMetrics() {
        this(CollectorRegistry.defaultRegistry);
    }

    public WebhookMetrics(CollectorRegistry registry) {
        eventsReceived =
                Counter.build()
                        .name("webhook_events_received_total")
                        .help("Keycloak events received and enqueued for dispatch")
                        .labelNames("realm", "event_type")
                        .register(registry);

        dispatches =
                Counter.build()
                        .name("webhook_dispatches_total")
                        .help("HTTP send attempts completed")
                        .labelNames("realm", "success")
                        .register(registry);

        dispatchDuration =
                Histogram.build()
                        .name("webhook_dispatch_duration_seconds")
                        .help("HTTP send latency (wall clock)")
                        .labelNames("realm")
                        .buckets(.005, .01, .025, .05, .1, .25, .5, .75, 1.0, 2.5, 5.0)
                        .register(registry);

        retries =
                Counter.build()
                        .name("webhook_retries_total")
                        .help("Retries scheduled via exponential backoff")
                        .labelNames("realm")
                        .register(registry);

        retriesExhausted =
                Counter.build()
                        .name("webhook_retries_exhausted_total")
                        .help("Retry chains terminated without success")
                        .labelNames("realm")
                        .register(registry);

        eventsDropped =
                Counter.build()
                        .name("webhook_events_dropped_total")
                        .help("Events dropped due to full dispatch queue")
                        .labelNames("realm")
                        .register(registry);

        circuitState =
                Gauge.build()
                        .name("webhook_circuit_state")
                        .help("Circuit breaker state: 0=CLOSED, 2=OPEN (1=HALF_OPEN reserved for future use)")
                        .labelNames("realm", "webhook_id")
                        .register(registry);

        queuePending =
                Gauge.build()
                        .name("webhook_queue_pending")
                        .help("Tasks currently pending in the executor")
                        .register(registry);
    }

    public void recordEventReceived(String realm, String eventType) {
        eventsReceived.labels(realm, eventType).inc();
    }

    public void recordDispatch(String realm, boolean success, double durationSeconds) {
        dispatches.labels(realm, String.valueOf(success)).inc();
        dispatchDuration.labels(realm).observe(durationSeconds);
    }

    public void recordRetry(String realm) {
        retries.labels(realm).inc();
    }

    public void recordRetryExhausted(String realm) {
        retriesExhausted.labels(realm).inc();
    }

    public void recordEventDropped(String realm) {
        eventsDropped.labels(realm).inc();
    }

    public void setCircuitState(String realm, String webhookId, String state) {
        double value =
                switch (state) {
                    case "HALF_OPEN" -> 1.0;
                    case "OPEN" -> 2.0;
                    default -> 0.0; // CLOSED
                };
        circuitState.labels(realm, webhookId).set(value);
    }

    public void setQueuePending(int count) {
        queuePending.set(count);
    }
}
