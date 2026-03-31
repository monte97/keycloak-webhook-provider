// src/main/java/dev/montell/keycloak/jpa/adapter/WebhookAdapter.java
package dev.montell.keycloak.jpa.adapter;

import dev.montell.keycloak.jpa.entity.WebhookEntity;
import dev.montell.keycloak.model.WebhookModel;
import java.time.Instant;
import java.util.Set;

/**
 * Adapts a {@link WebhookEntity} JPA entity to the {@link WebhookModel} domain interface. All
 * getters and setters delegate directly to the underlying managed entity, so changes made through
 * this adapter are automatically persisted by JPA dirty-checking.
 */
public class WebhookAdapter implements WebhookModel {

    private final WebhookEntity entity;

    public WebhookAdapter(WebhookEntity entity) {
        this.entity = entity;
    }

    public WebhookEntity getEntity() {
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
    public String getUrl() {
        return entity.getUrl();
    }

    @Override
    public void setUrl(String url) {
        entity.setUrl(url);
    }

    @Override
    public String getSecret() {
        return entity.getSecret();
    }

    @Override
    public void setSecret(String secret) {
        entity.setSecret(secret);
    }

    @Override
    public String getAlgorithm() {
        return entity.getAlgorithm();
    }

    @Override
    public void setAlgorithm(String algorithm) {
        entity.setAlgorithm(algorithm);
    }

    @Override
    public boolean isEnabled() {
        return entity.isEnabled();
    }

    @Override
    public void setEnabled(boolean enabled) {
        entity.setEnabled(enabled);
    }

    @Override
    public Set<String> getEventTypes() {
        return entity.getEventTypes();
    }

    @Override
    public void setEventTypes(Set<String> types) {
        entity.setEventTypes(types);
    }

    @Override
    public String getCreatedBy() {
        return entity.getCreatedBy();
    }

    @Override
    public Instant getCreatedAt() {
        return entity.getCreatedAt();
    }

    @Override
    public Instant getUpdatedAt() {
        return entity.getUpdatedAt();
    }

    @Override
    public void setUpdatedAt(Instant updatedAt) {
        entity.setUpdatedAt(updatedAt);
    }

    @Override
    public String getCircuitState() {
        return entity.getCircuitState();
    }

    @Override
    public void setCircuitState(String state) {
        entity.setCircuitState(state);
    }

    @Override
    public int getFailureCount() {
        return entity.getFailureCount();
    }

    @Override
    public void setFailureCount(int count) {
        entity.setFailureCount(count);
    }

    @Override
    public Instant getLastFailureAt() {
        return entity.getLastFailureAt();
    }

    @Override
    public void setLastFailureAt(Instant at) {
        entity.setLastFailureAt(at);
    }

    @Override
    public Integer getRetryMaxElapsedSeconds() {
        return entity.getRetryMaxElapsedSeconds();
    }

    @Override
    public void setRetryMaxElapsedSeconds(Integer s) {
        entity.setRetryMaxElapsedSeconds(s);
    }

    @Override
    public Integer getRetryMaxIntervalSeconds() {
        return entity.getRetryMaxIntervalSeconds();
    }

    @Override
    public void setRetryMaxIntervalSeconds(Integer s) {
        entity.setRetryMaxIntervalSeconds(s);
    }
}
