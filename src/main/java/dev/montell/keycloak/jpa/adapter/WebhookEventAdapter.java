// src/main/java/dev/montell/keycloak/jpa/adapter/WebhookEventAdapter.java
package dev.montell.keycloak.jpa.adapter;

import dev.montell.keycloak.jpa.entity.WebhookEventEntity;
import dev.montell.keycloak.model.KeycloakEventType;
import dev.montell.keycloak.model.WebhookEventModel;
import java.time.Instant;

/**
 * Adapts a {@link WebhookEventEntity} JPA entity to the {@link WebhookEventModel} domain interface.
 */
public class WebhookEventAdapter implements WebhookEventModel {

    private final WebhookEventEntity entity;

    public WebhookEventAdapter(WebhookEventEntity entity) {
        this.entity = entity;
    }

    public WebhookEventEntity getEntity() {
        return entity;
    }

    @Override
    public String getId() {
        return entity.getId();
    }

    @Override
    public String getRealmId() {
        return entity.getRealmId();
    }

    @Override
    public KeycloakEventType getEventType() {
        return entity.getEventType();
    }

    @Override
    public String getKcEventId() {
        return entity.getKcEventId();
    }

    @Override
    public String getEventObject() {
        return entity.getEventObject();
    }

    @Override
    public Instant getCreatedAt() {
        return entity.getCreatedAt();
    }
}
