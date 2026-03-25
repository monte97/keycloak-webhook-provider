// src/main/java/dev/montell/keycloak/model/WebhookEventModel.java
package dev.montell.keycloak.model;

import java.time.Instant;

/**
 * Domain model for a captured Keycloak event. Each event is persisted before webhook
 * delivery is attempted, enabling resend and audit trail functionality.
 *
 * @see dev.montell.keycloak.jpa.adapter.WebhookEventAdapter
 */
public interface WebhookEventModel {
    String getId();
    String getRealmId();
    KeycloakEventType getEventType();
    String getKcEventId();
    String getEventObject();   // serialized JSON payload
    Instant getCreatedAt();
}
