// src/main/java/dev/montell/keycloak/model/WebhookModel.java
package dev.montell.keycloak.model;

import java.time.Instant;
import java.util.Set;

/**
 * Domain model for a webhook registration. Exposes configuration (URL, secret, event filters),
 * circuit breaker state, and retry parameters. Implementations are backed by JPA entities via the
 * adapter pattern.
 *
 * @see dev.montell.keycloak.jpa.adapter.WebhookAdapter
 */
public interface WebhookModel {
    String getId();

    String getRealmId();

    String getUrl();

    void setUrl(String url);

    String getSecret();

    void setSecret(String secret);

    String getSecondarySecret();

    void setSecondarySecret(String secondarySecret);

    java.time.Instant getRotationExpiresAt();

    void setRotationExpiresAt(java.time.Instant at);

    java.time.Instant getRotationStartedAt();

    void setRotationStartedAt(java.time.Instant at);

    String getAlgorithm();

    void setAlgorithm(String algorithm);

    boolean isEnabled();

    void setEnabled(boolean enabled);

    Set<String> getEventTypes();

    void setEventTypes(Set<String> types);

    String getCreatedBy();

    Instant getCreatedAt();

    Instant getUpdatedAt();

    void setUpdatedAt(Instant updatedAt);

    /**
     * Clears the secondary secret and rotation timestamps if the rotation window has elapsed.
     * Delegates to {@link dev.montell.keycloak.jpa.entity.WebhookEntity#expireRotationIfDue}.
     *
     * @return {@code true} if the entity was mutated and needs to be persisted
     */
    boolean expireRotationIfDue(java.time.Instant now);

    // circuit breaker
    String getCircuitState();

    void setCircuitState(String state);

    int getFailureCount();

    void setFailureCount(int count);

    Instant getLastFailureAt();

    void setLastFailureAt(Instant at);

    // retry override (null = use default)
    Integer getRetryMaxElapsedSeconds();

    void setRetryMaxElapsedSeconds(Integer s);

    Integer getRetryMaxIntervalSeconds();

    void setRetryMaxIntervalSeconds(Integer s);
}
