package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.montell.keycloak.logging.JsonFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.LogRecord;
import org.junit.jupiter.api.Test;

class JsonFormatterTest {

    private final JsonFormatter formatter = new JsonFormatter();
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void format_producesValidJsonWithFixedFields() throws Exception {
        LogRecord record = new LogRecord(Level.INFO, "");
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("event", "dispatch.success");
        fields.put("message", "Webhook dispatch succeeded");
        record.setParameters(new Object[] {fields});

        String output = formatter.format(record);

        JsonNode json = mapper.readTree(output);
        assertNotNull(json.get("ts"));
        assertEquals("INFO", json.get("level").asText());
        assertEquals("keycloak-webhook-provider", json.get("service").asText());
        assertEquals("dispatch.success", json.get("event").asText());
        assertEquals("Webhook dispatch succeeded", json.get("message").asText());
    }

    @Test
    void format_includesAllCustomFields() throws Exception {
        LogRecord record = new LogRecord(Level.WARNING, "");
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("event", "dispatch.failure");
        fields.put("message", "Webhook dispatch failed");
        fields.put("realm", "demo");
        fields.put("webhook_id", "abc-123");
        fields.put("http_status", 500);
        fields.put("duration_seconds", 0.045);
        record.setParameters(new Object[] {fields});

        String output = formatter.format(record);

        JsonNode json = mapper.readTree(output);
        assertEquals("WARNING", json.get("level").asText());
        assertEquals("demo", json.get("realm").asText());
        assertEquals("abc-123", json.get("webhook_id").asText());
        assertEquals(500, json.get("http_status").asInt());
        assertEquals(0.045, json.get("duration_seconds").asDouble(), 0.001);
    }

    @Test
    void format_outputEndsWithNewline() {
        LogRecord record = new LogRecord(Level.INFO, "");
        record.setParameters(new Object[] {Map.of("event", "test", "message", "test")});

        String output = formatter.format(record);

        assertTrue(output.endsWith("\n"));
        // Exactly one line (no embedded newlines before the trailing one)
        assertEquals(1, output.strip().split("\n").length);
    }

    @Test
    void format_timestampIsIso8601Utc() throws Exception {
        LogRecord record = new LogRecord(Level.INFO, "");
        record.setParameters(new Object[] {Map.of("event", "test", "message", "test")});

        String output = formatter.format(record);

        JsonNode json = mapper.readTree(output);
        String ts = json.get("ts").asText();
        // ISO 8601 format: ends with Z (UTC)
        assertTrue(ts.endsWith("Z"), "Timestamp should be UTC: " + ts);
        assertTrue(ts.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.*Z"));
    }

    @Test
    void format_handlesNullParameters() throws Exception {
        LogRecord record = new LogRecord(Level.INFO, "fallback message");
        // No parameters set — should still produce valid JSON

        String output = formatter.format(record);

        JsonNode json = mapper.readTree(output);
        assertNotNull(json.get("ts"));
        assertEquals("INFO", json.get("level").asText());
    }
}
