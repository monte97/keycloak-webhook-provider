// src/main/java/dev/montell/keycloak/event/WebhookPayload.java
package dev.montell.keycloak.event;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.Map;

/**
 * Sealed interface representing an enriched Keycloak event ready for webhook delivery.
 * Two variants exist: {@link AccessEvent} for user-facing events (login, logout, register)
 * and {@link AdminEvent} for administrative operations (user create, role mapping).
 *
 * <p>Instances are immutable records created by {@link EventEnricher} and serialized
 * to JSON for both persistence and HTTP delivery.
 */
public sealed interface WebhookPayload
        permits WebhookPayload.AccessEvent, WebhookPayload.AdminEvent {

    String uid();
    String type();
    String realmId();
    Instant occurredAt();

    record AccessEvent(
        String uid,
        String type,           // "access.LOGIN"
        String realmId,
        String userId,
        String sessionId,
        Instant occurredAt,
        Map<String, String> details
    ) implements WebhookPayload {}

    record AdminEvent(
        String uid,
        String type,           // "admin.USER-CREATE"
        String realmId,
        String resourcePath,
        String operationType,
        AuthDetails authDetails,
        Instant occurredAt,
        JsonNode representation
    ) implements WebhookPayload {}
}
