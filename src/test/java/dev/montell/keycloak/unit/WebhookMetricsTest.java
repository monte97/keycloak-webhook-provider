package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;

import dev.montell.keycloak.metrics.WebhookMetrics;
import io.prometheus.client.CollectorRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WebhookMetricsTest {

    private CollectorRegistry registry;
    private WebhookMetrics metrics;

    @BeforeEach
    void setUp() {
        registry = new CollectorRegistry();
        metrics = new WebhookMetrics(registry);
    }

    @Test
    void recordEventReceived_incrementsCounter() {
        metrics.recordEventReceived("demo", "admin.USER-CREATE");
        metrics.recordEventReceived("demo", "admin.USER-CREATE");
        metrics.recordEventReceived("prod", "access.LOGIN");

        assertEquals(
                2.0,
                registry.getSampleValue(
                        "webhook_events_received_total",
                        new String[] {"realm", "event_type"},
                        new String[] {"demo", "admin.USER-CREATE"}));
        assertEquals(
                1.0,
                registry.getSampleValue(
                        "webhook_events_received_total",
                        new String[] {"realm", "event_type"},
                        new String[] {"prod", "access.LOGIN"}));
    }

    @Test
    void recordDispatch_incrementsCounterAndObservesHistogram() {
        metrics.recordDispatch("demo", true, 0.045);
        metrics.recordDispatch("demo", false, 1.2);

        assertEquals(
                1.0,
                registry.getSampleValue(
                        "webhook_dispatches_total",
                        new String[] {"realm", "success"},
                        new String[] {"demo", "true"}));
        assertEquals(
                1.0,
                registry.getSampleValue(
                        "webhook_dispatches_total",
                        new String[] {"realm", "success"},
                        new String[] {"demo", "false"}));
        // Histogram count should be 2 (both observations)
        assertEquals(
                2.0,
                registry.getSampleValue(
                        "webhook_dispatch_duration_seconds_count",
                        new String[] {"realm"},
                        new String[] {"demo"}));
    }

    @Test
    void recordRetry_incrementsCounter() {
        metrics.recordRetry("demo");
        assertEquals(
                1.0,
                registry.getSampleValue(
                        "webhook_retries_total", new String[] {"realm"}, new String[] {"demo"}));
    }

    @Test
    void recordRetryExhausted_incrementsCounter() {
        metrics.recordRetryExhausted("demo");
        assertEquals(
                1.0,
                registry.getSampleValue(
                        "webhook_retries_exhausted_total",
                        new String[] {"realm"},
                        new String[] {"demo"}));
    }

    @Test
    void recordEventDropped_incrementsCounter() {
        metrics.recordEventDropped("demo");
        assertEquals(
                1.0,
                registry.getSampleValue(
                        "webhook_events_dropped_total",
                        new String[] {"realm"},
                        new String[] {"demo"}));
    }

    @Test
    void setCircuitState_updatesGauge() {
        metrics.setCircuitState("demo", "wh-1", "CLOSED");
        assertEquals(
                0.0,
                registry.getSampleValue(
                        "webhook_circuit_state",
                        new String[] {"realm", "webhook_id"},
                        new String[] {"demo", "wh-1"}));

        metrics.setCircuitState("demo", "wh-1", "OPEN");
        assertEquals(
                2.0,
                registry.getSampleValue(
                        "webhook_circuit_state",
                        new String[] {"realm", "webhook_id"},
                        new String[] {"demo", "wh-1"}));

        metrics.setCircuitState("demo", "wh-1", "HALF_OPEN");
        assertEquals(
                1.0,
                registry.getSampleValue(
                        "webhook_circuit_state",
                        new String[] {"realm", "webhook_id"},
                        new String[] {"demo", "wh-1"}));
    }

    @Test
    void setQueuePending_updatesGauge() {
        metrics.setQueuePending(42);
        assertEquals(
                42.0,
                registry.getSampleValue("webhook_queue_pending", new String[] {}, new String[] {}));

        metrics.setQueuePending(0);
        assertEquals(
                0.0,
                registry.getSampleValue("webhook_queue_pending", new String[] {}, new String[] {}));
    }
}
