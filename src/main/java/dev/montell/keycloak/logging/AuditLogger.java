package dev.montell.keycloak.logging;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.*;

/**
 * Structured audit logger for key webhook lifecycle events. Emits one-line JSON via a dedicated JUL
 * {@link Logger} ({@code dev.montell.keycloak.webhook.audit}), formatted by {@link JsonFormatter}.
 *
 * <p>Call {@link #init()} once at provider startup to configure the JUL handler. All log methods
 * are static and thread-safe.
 */
public final class AuditLogger {

    private static final Logger LOGGER = Logger.getLogger("dev.montell.keycloak.webhook.audit");

    private AuditLogger() {}

    /** Configure the JUL handler for structured JSON output to stdout. Call once at startup. */
    public static void init() {
        LOGGER.setUseParentHandlers(false);
        ConsoleHandler handler = new ConsoleHandler();
        handler.setFormatter(new JsonFormatter());
        handler.setLevel(Level.ALL);
        LOGGER.addHandler(handler);
        LOGGER.setLevel(Level.ALL);
    }

    public static void dispatchSuccess(
            String realm,
            String webhookId,
            String eventType,
            int attempt,
            String url,
            int httpStatus,
            double durationSeconds) {
        Map<String, Object> fields =
                baseFields(
                        "dispatch.success",
                        "Webhook dispatch succeeded",
                        realm,
                        webhookId,
                        eventType);
        fields.put("attempt", attempt);
        fields.put("url", url);
        fields.put("http_status", httpStatus);
        fields.put("duration_seconds", durationSeconds);
        log(Level.INFO, fields);
    }

    public static void dispatchFailure(
            String realm,
            String webhookId,
            String eventType,
            int attempt,
            String url,
            int httpStatus,
            String error,
            double durationSeconds) {
        Map<String, Object> fields =
                baseFields(
                        "dispatch.failure", "Webhook dispatch failed", realm, webhookId, eventType);
        fields.put("attempt", attempt);
        fields.put("url", url);
        if (error != null) {
            fields.put("error", error);
        } else {
            fields.put("http_status", httpStatus);
        }
        fields.put("duration_seconds", durationSeconds);
        log(Level.WARNING, fields);
    }

    public static void retryScheduled(
            String realm, String webhookId, String eventType, int attempt, double delaySeconds) {
        Map<String, Object> fields =
                baseFields("retry.scheduled", "Retry scheduled", realm, webhookId, eventType);
        fields.put("attempt", attempt);
        fields.put("delay_seconds", delaySeconds);
        log(Level.INFO, fields);
    }

    public static void retryExhausted(
            String realm, String webhookId, String eventType, int totalAttempts) {
        Map<String, Object> fields =
                baseFields(
                        "retry.exhausted", "Retry attempts exhausted", realm, webhookId, eventType);
        fields.put("total_attempts", totalAttempts);
        log(Level.WARNING, fields);
    }

    public static void circuitOpened(String realm, String webhookId, int failureCount) {
        Map<String, Object> fields =
                baseFields("circuit.opened", "Circuit breaker opened", realm, webhookId, null);
        fields.put("failure_count", failureCount);
        log(Level.WARNING, fields);
    }

    public static void circuitReset(String realm, String webhookId) {
        Map<String, Object> fields =
                baseFields(
                        "circuit.reset", "Circuit breaker reset to CLOSED", realm, webhookId, null);
        log(Level.INFO, fields);
    }

    public static void eventDropped(String realm, String eventType, int queueSize) {
        Map<String, Object> fields =
                baseFields(
                        "event.dropped",
                        "Event dropped — dispatch queue full",
                        realm,
                        null,
                        eventType);
        fields.put("queue_size", queueSize);
        log(Level.WARNING, fields);
    }

    private static Map<String, Object> baseFields(
            String event, String message, String realm, String webhookId, String eventType) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("event", event);
        fields.put("message", message);
        if (realm != null) fields.put("realm", realm);
        if (webhookId != null) fields.put("webhook_id", webhookId);
        if (eventType != null) fields.put("event_type", eventType);
        return fields;
    }

    private static void log(Level level, Map<String, Object> fields) {
        LogRecord record = new LogRecord(level, "");
        record.setParameters(new Object[] {fields});
        record.setLoggerName(LOGGER.getName());
        LOGGER.log(record);
    }
}
