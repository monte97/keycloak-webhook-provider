// src/main/java/dev/montell/keycloak/jpa/adapter/WebhookSendAdapter.java
package dev.montell.keycloak.jpa.adapter;

import dev.montell.keycloak.jpa.entity.WebhookSendEntity;
import dev.montell.keycloak.model.WebhookSendModel;
import java.time.Instant;

public class WebhookSendAdapter implements WebhookSendModel {

    private final WebhookSendEntity entity;

    public WebhookSendAdapter(WebhookSendEntity entity) {
        this.entity = entity;
    }

    public WebhookSendEntity getEntity() { return entity; }

    @Override public String getId() { return entity.getId(); }
    @Override public String getWebhookId() { return entity.getWebhookId(); }
    @Override public String getWebhookEventId() { return entity.getWebhookEventId(); }
    @Override public String getEventType() { return entity.getEventType(); }
    @Override public Integer getHttpStatus() { return entity.getHttpStatus(); }
    @Override public boolean isSuccess() { return entity.isSuccess(); }
    @Override public int getRetries() { return entity.getRetries(); }
    @Override public Instant getSentAt() { return entity.getSentAt(); }
    @Override public Instant getLastAttemptAt() { return entity.getLastAttemptAt(); }
}
