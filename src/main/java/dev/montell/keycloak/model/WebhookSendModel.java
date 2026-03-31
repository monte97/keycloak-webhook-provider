// src/main/java/dev/montell/keycloak/model/WebhookSendModel.java
package dev.montell.keycloak.model;

import java.time.Instant;

/**
 * Domain model for a webhook delivery attempt. Tracks HTTP status, success/failure, retry count,
 * and timestamps. One send record exists per webhook-event pair and is updated in place on retries.
 *
 * @see dev.montell.keycloak.jpa.adapter.WebhookSendAdapter
 */
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
