// src/main/java/dev/montell/keycloak/model/WebhookModel.java
package dev.montell.keycloak.model;

import java.time.Instant;
import java.util.Set;

/**
 * Domain model for a webhook registration. Exposes configuration (URL, secret, event filters),
 * circuit breaker state, and retry parameters. Implementations are backed by JPA entities
 * via the adapter pattern.
 *
 * @see dev.montell.keycloak.jpa.adapter.WebhookAdapter
 */
public interface WebhookModel {
    String getId();
    String getRealmId();
    String getUrl();         void setUrl(String url);
    String getSecret();      void setSecret(String secret);
    String getAlgorithm();   void setAlgorithm(String algorithm);
    boolean isEnabled();     void setEnabled(boolean enabled);
    Set<String> getEventTypes(); void setEventTypes(Set<String> types);
    String getCreatedBy();
    Instant getCreatedAt();
    Instant getUpdatedAt();  void setUpdatedAt(Instant updatedAt);
    // circuit breaker
    String getCircuitState();   void setCircuitState(String state);
    int getFailureCount();       void setFailureCount(int count);
    Instant getLastFailureAt(); void setLastFailureAt(Instant at);
    // retry override (null = use default)
    Integer getRetryMaxElapsedSeconds();  void setRetryMaxElapsedSeconds(Integer s);
    Integer getRetryMaxIntervalSeconds(); void setRetryMaxIntervalSeconds(Integer s);
}
