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
        if (LOGGER.getHandlers().length > 0) return; // already configured
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
        fields.put("url", stripQueryString(url));
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
        fields.put("url", stripQueryString(url));
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

    public static void secretRotated(
            String realm, String webhookId, String mode, Integer graceDays, String userId) {
        Map<String, Object> fields =
                baseFields("webhook.secret.rotated", "Webhook secret rotated", realm, webhookId, null);
        fields.put("mode", mode);
        if (graceDays != null) fields.put("grace_days", graceDays);
        if (userId != null) fields.put("user_id", userId);
        log(Level.INFO, fields);
    }

    public static void rotationCompleted(String realm, String webhookId, String userId) {
        Map<String, Object> fields =
                baseFields(
                        "webhook.rotation.completed",
                        "Webhook rotation completed",
                        realm,
                        webhookId,
                        null);
        if (userId != null) fields.put("user_id", userId);
        log(Level.INFO, fields);
    }

    public static void rotationExpired(String realm, String webhookId) {
        Map<String, Object> fields =
                baseFields(
                        "webhook.rotation.expired",
                        "Webhook rotation expired — secondary secret dropped",
                        realm,
                        webhookId,
                        null);
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

    private static String stripQueryString(String url) {
        if (url == null) return null;
        int q = url.indexOf('?');
        return q >= 0 ? url.substring(0, q) : url;
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
