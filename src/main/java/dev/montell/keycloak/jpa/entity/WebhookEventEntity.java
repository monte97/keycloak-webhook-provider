// src/main/java/dev/montell/keycloak/jpa/entity/WebhookEventEntity.java
package dev.montell.keycloak.jpa.entity;

import dev.montell.keycloak.model.KeycloakEventType;
import jakarta.persistence.*;
import java.time.Instant;

@NamedQueries({
    @NamedQuery(name = "getWebhookEventByKcId",
        query = "SELECT e FROM WebhookEventEntity e WHERE e.realmId = :realmId AND e.kcEventId = :kcEventId")
})
@Entity
@Table(name = "WEBHOOK_EVENT")
public class WebhookEventEntity {

    @Id
    @Column(name = "ID", length = 36)
    private String id;

    @Column(name = "REALM_ID", nullable = false)
    private String realmId;

    @Enumerated(EnumType.STRING)
    @Column(name = "EVENT_TYPE", nullable = false, length = 16)
    private KeycloakEventType eventType;

    // Nullable: some admin events may not carry a Keycloak event ID.
    // The unique constraint is enforced only for non-null values (PostgreSQL / MySQL behavior).
    @Column(name = "KC_EVENT_ID", unique = true)
    private String kcEventId;

    @Column(name = "EVENT_OBJECT", nullable = false, columnDefinition = "TEXT")
    private String eventObject;

    @Column(name = "CREATED_AT", nullable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getRealmId() { return realmId; }
    public void setRealmId(String realmId) { this.realmId = realmId; }
    public KeycloakEventType getEventType() { return eventType; }
    public void setEventType(KeycloakEventType eventType) { this.eventType = eventType; }
    public String getKcEventId() { return kcEventId; }
    public void setKcEventId(String kcEventId) { this.kcEventId = kcEventId; }
    public String getEventObject() { return eventObject; }
    public void setEventObject(String eventObject) { this.eventObject = eventObject; }
    public Instant getCreatedAt() { return createdAt; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WebhookEventEntity that)) return false;
        return id != null && id.equals(that.id);
    }

    @Override
    public int hashCode() { return id == null ? 0 : id.hashCode(); }
}
