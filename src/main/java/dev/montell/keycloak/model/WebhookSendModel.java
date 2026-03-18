// src/main/java/dev/montell/keycloak/model/WebhookSendModel.java
package dev.montell.keycloak.model;

import java.time.Instant;

public interface WebhookSendModel {
    String getId();
    String getWebhookId();
    String getWebhookEventId();
    String getEventType();
    Integer getHttpStatus();
    boolean isSuccess();
    int getRetries();
    Instant getSentAt();
    Instant getLastAttemptAt();
}
