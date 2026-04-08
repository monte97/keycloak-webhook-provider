// src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntity.java
package dev.montell.keycloak.jpa.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@NamedQueries({
    @NamedQuery(
            name = "getWebhooksByRealmId",
            query =
                    "SELECT w FROM WebhookEntity w WHERE w.realmId = :realmId ORDER BY w.createdAt ASC"),
    @NamedQuery(
            name = "countWebhooksByRealmId",
            query = "SELECT COUNT(w) FROM WebhookEntity w WHERE w.realmId = :realmId"),
    // NOTE: bulk DELETE bypasses the JPA first-level cache. Callers must call em.clear()
    // after executing this query if the EntityManager session is reused afterward.
    @NamedQuery(
            name = "removeAllWebhooksByRealmId",
            query = "DELETE FROM WebhookEntity w WHERE w.realmId = :realmId")
})
/**
 * JPA entity mapped to the {@code WEBHOOK} table. Stores webhook configuration, circuit breaker
 * state, and retry parameters. Event type subscriptions are stored in the {@code
 * WEBHOOK_EVENT_TYPE} collection table.
 *
 * <p>Uses ID-based {@code equals}/{@code hashCode} (not {@code @Data}) to avoid issues with JPA
 * proxy objects and lazy-loaded collections.
 */
@Entity
@Table(name = "WEBHOOK")
public class WebhookEntity {

    @Id
    @Column(name = "ID", length = 36)
    private String id;

    @Column(name = "REALM_ID", nullable = false)
    private String realmId;

    @Column(name = "URL", nullable = false, length = 2048)
    private String url;

    @Convert(converter = dev.montell.keycloak.jpa.SecretEncryptionConverter.class)
    @Column(name = "SECRET", length = 512)
    private String secret;

    @Column(name = "ALGORITHM", nullable = false)
    private String algorithm = "HmacSHA256";

    @Column(name = "ENABLED", nullable = false)
    private boolean enabled = false;

    @Column(name = "CIRCUIT_STATE", nullable = false, length = 16)
    private String circuitState = "CLOSED";

    @Column(name = "FAILURE_COUNT", nullable = false)
    private int failureCount = 0;

    @Column(name = "LAST_FAILURE_AT")
    private Instant lastFailureAt;

    @Column(name = "CREATED_BY")
    private String createdBy;

    @Column(name = "CREATED_AT", nullable = false)
    private Instant createdAt;

    @Column(name = "UPDATED_AT", nullable = false)
    private Instant updatedAt;

    @Column(name = "RETRY_MAX_ELAPSED_SECONDS")
    private Integer retryMaxElapsedSeconds;

    @Column(name = "RETRY_MAX_INTERVAL_SECONDS")
    private Integer retryMaxIntervalSeconds;

    @Convert(converter = dev.montell.keycloak.jpa.SecretEncryptionConverter.class)
    @Column(name = "SECONDARY_SECRET", length = 512)
    private String secondarySecret;

    @Column(name = "ROTATION_EXPIRES_AT")
    private Instant rotationExpiresAt;

    @Column(name = "ROTATION_STARTED_AT")
    private Instant rotationStartedAt;

    @ElementCollection(fetch = FetchType.EAGER)
    @Column(name = "EVENT_TYPE")
    @CollectionTable(name = "WEBHOOK_EVENT_TYPE", joinColumns = @JoinColumn(name = "WEBHOOK_ID"))
    private Set<String> eventTypes = new HashSet<>();

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    // getters/setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getRealmId() {
        return realmId;
    }

    public void setRealmId(String realmId) {
        this.realmId = realmId;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    public String getAlgorithm() {
        return algorithm;
    }

    public void setAlgorithm(String algorithm) {
        this.algorithm = algorithm;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getCircuitState() {
        return circuitState;
    }

    public void setCircuitState(String circuitState) {
        this.circuitState = circuitState;
    }

    public int getFailureCount() {
        return failureCount;
    }

    public void setFailureCount(int failureCount) {
        this.failureCount = failureCount;
    }

    public Instant getLastFailureAt() {
        return lastFailureAt;
    }

    public void setLastFailureAt(Instant lastFailureAt) {
        this.lastFailureAt = lastFailureAt;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Integer getRetryMaxElapsedSeconds() {
        return retryMaxElapsedSeconds;
    }

    public void setRetryMaxElapsedSeconds(Integer s) {
        this.retryMaxElapsedSeconds = s;
    }

    public Integer getRetryMaxIntervalSeconds() {
        return retryMaxIntervalSeconds;
    }

    public void setRetryMaxIntervalSeconds(Integer s) {
        this.retryMaxIntervalSeconds = s;
    }

    public String getSecondarySecret() {
        return secondarySecret;
    }

    public void setSecondarySecret(String secondarySecret) {
        this.secondarySecret = secondarySecret;
    }

    public Instant getRotationExpiresAt() {
        return rotationExpiresAt;
    }

    public void setRotationExpiresAt(Instant rotationExpiresAt) {
        this.rotationExpiresAt = rotationExpiresAt;
    }

    public Instant getRotationStartedAt() {
        return rotationStartedAt;
    }

    public void setRotationStartedAt(Instant rotationStartedAt) {
        this.rotationStartedAt = rotationStartedAt;
    }

    public Set<String> getEventTypes() {
        return eventTypes;
    }

    public void setEventTypes(Set<String> eventTypes) {
        this.eventTypes = eventTypes;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WebhookEntity that)) return false;
        return id != null && id.equals(that.id);
    }

    @Override
    public int hashCode() {
        return id == null ? 0 : id.hashCode();
    }
}
