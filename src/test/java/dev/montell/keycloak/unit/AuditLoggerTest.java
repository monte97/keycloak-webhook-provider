package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.montell.keycloak.logging.AuditLogger;
import dev.montell.keycloak.logging.JsonFormatter;
import java.io.ByteArrayOutputStream;
import java.util.logging.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AuditLoggerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ByteArrayOutputStream capture;
    private Handler handler;
    private Logger julLogger;

    @BeforeEach
    void setUp() {
        capture = new ByteArrayOutputStream();
        handler = new StreamHandler(capture, new JsonFormatter());
        handler.setLevel(Level.ALL);

        julLogger = Logger.getLogger("dev.montell.keycloak.webhook.audit");
        julLogger.setUseParentHandlers(false);
        julLogger.addHandler(handler);
        julLogger.setLevel(Level.ALL);
    }

    @AfterEach
    void tearDown() {
        julLogger.removeHandler(handler);
    }

    private JsonNode capturedJson() throws Exception {
        handler.flush();
        return MAPPER.readTree(capture.toString());
    }

    @Test
    void dispatchSuccess_logsCorrectFields() throws Exception {
        AuditLogger.dispatchSuccess(
                "demo", "wh-1", "admin.USER-CREATE", 0, "http://example.com/hook", 200, 0.045);

        JsonNode json = capturedJson();
        assertEquals("dispatch.success", json.get("event").asText());
        assertEquals("INFO", json.get("level").asText());
        assertEquals("demo", json.get("realm").asText());
        assertEquals("wh-1", json.get("webhook_id").asText());
        assertEquals("admin.USER-CREATE", json.get("event_type").asText());
        assertEquals(0, json.get("attempt").asInt());
        assertEquals("http://example.com/hook", json.get("url").asText());
        assertEquals(200, json.get("http_status").asInt());
        assertEquals(0.045, json.get("duration_seconds").asDouble(), 0.001);
    }

    @Test
    void dispatchFailure_logsAtWarnLevel() throws Exception {
        AuditLogger.dispatchFailure(
                "demo", "wh-1", "admin.USER-DELETE", 2, "http://example.com/hook", 503, null, 1.2);

        JsonNode json = capturedJson();
        assertEquals("dispatch.failure", json.get("event").asText());
        assertEquals("WARNING", json.get("level").asText());
        assertEquals(503, json.get("http_status").asInt());
        assertEquals(2, json.get("attempt").asInt());
    }

    @Test
    void dispatchFailure_withErrorInsteadOfStatus() throws Exception {
        AuditLogger.dispatchFailure(
                "demo",
                "wh-1",
                "admin.USER-DELETE",
                0,
                "http://example.com/hook",
                0,
                "Connection refused",
                0.001);

        JsonNode json = capturedJson();
        assertEquals("Connection refused", json.get("error").asText());
        assertNull(json.get("http_status"));
    }

    @Test
    void retryScheduled_logsCorrectFields() throws Exception {
        AuditLogger.retryScheduled("demo", "wh-1", "admin.USER-CREATE", 1, 0.5);

        JsonNode json = capturedJson();
        assertEquals("retry.scheduled", json.get("event").asText());
        assertEquals("INFO", json.get("level").asText());
        assertEquals(1, json.get("attempt").asInt());
        assertEquals(0.5, json.get("delay_seconds").asDouble(), 0.001);
    }

    @Test
    void retryExhausted_logsAtWarnLevel() throws Exception {
        AuditLogger.retryExhausted("demo", "wh-1", "admin.USER-CREATE", 3);

        JsonNode json = capturedJson();
        assertEquals("retry.exhausted", json.get("event").asText());
        assertEquals("WARNING", json.get("level").asText());
        assertEquals(3, json.get("total_attempts").asInt());
    }

    @Test
    void circuitOpened_logsAtWarnLevel() throws Exception {
        AuditLogger.circuitOpened("demo", "wh-1", 5);

        JsonNode json = capturedJson();
        assertEquals("circuit.opened", json.get("event").asText());
        assertEquals("WARNING", json.get("level").asText());
        assertEquals(5, json.get("failure_count").asInt());
    }

    @Test
    void circuitReset_logsAtInfoLevel() throws Exception {
        AuditLogger.circuitReset("demo", "wh-1");

        JsonNode json = capturedJson();
        assertEquals("circuit.reset", json.get("event").asText());
        assertEquals("INFO", json.get("level").asText());
    }

    @Test
    void eventDropped_logsAtWarnLevel() throws Exception {
        AuditLogger.eventDropped("demo", "admin.USER-CREATE", 10000);

        JsonNode json = capturedJson();
        assertEquals("event.dropped", json.get("event").asText());
        assertEquals("WARNING", json.get("level").asText());
        assertEquals(10000, json.get("queue_size").asInt());
    }
}
