// src/main/java/dev/montell/keycloak/model/WebhookEventModel.java
package dev.montell.keycloak.model;

import java.time.Instant;

public interface WebhookEventModel {
    String getId();
    String getRealmId();
    KeycloakEventType getEventType();
    String getKcEventId();
    String getEventObject();   // JSON serializzato
    Instant getCreatedAt();
}
