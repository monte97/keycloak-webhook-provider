package dev.montell.keycloak.logging;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.Formatter;
import java.util.logging.LogRecord;

/**
 * JUL {@link Formatter} that produces one-line JSON records for structured audit logging. Fixed
 * fields ({@code ts}, {@code level}, {@code service}) are always present; additional fields come
 * from the first parameter of the {@link LogRecord} (expected to be a {@code Map<String, Object>}).
 */
public class JsonFormatter extends Formatter {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String SERVICE = "keycloak-webhook-provider";

    @Override
    public String format(LogRecord record) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("ts", Instant.ofEpochMilli(record.getMillis()).toString());
        json.put("level", record.getLevel().getName());
        json.put("service", SERVICE);

        if (record.getParameters() != null
                && record.getParameters().length > 0
                && record.getParameters()[0] instanceof Map<?, ?> fields) {
            json.putAll(castToStringMap(fields));
        }

        try {
            return MAPPER.writeValueAsString(json) + "\n";
        } catch (JsonProcessingException e) {
            return "{\"error\":\"log serialization failed\"}\n";
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castToStringMap(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }
}
