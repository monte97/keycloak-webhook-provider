// src/main/java/dev/montell/keycloak/jpa/entity/WebhookSendEntity.java
package dev.montell.keycloak.jpa.entity;

import jakarta.persistence.*;
import java.time.Instant;

@NamedQueries({
    @NamedQuery(name = "getWebhookSendsByWebhookId",
        query = "SELECT s FROM WebhookSendEntity s WHERE s.webhookId = :webhookId ORDER BY s.sentAt DESC"),
    @NamedQuery(name = "getWebhookSendsByEventId",
        query = "SELECT s FROM WebhookSendEntity s WHERE s.webhookEventId = :webhookEventId ORDER BY s.sentAt DESC")
})
@Entity
@Table(name = "WEBHOOK_SEND",
    uniqueConstraints = @UniqueConstraint(columnNames = {"WEBHOOK_ID", "WEBHOOK_EVENT_ID"}))
public class WebhookSendEntity {

    /** Builds the composite PK from its two components. Use this instead of string concatenation. */
    public static String buildId(String webhookId, String webhookEventId) {
        return webhookId + "-" + webhookEventId;
    }

    @Id
    @Column(name = "ID", length = 80) // buildId(webhookId, webhookEventId) = 73 chars max
    private String id;

    @Column(name = "WEBHOOK_ID", nullable = false, length = 36)
    private String webhookId;

    @Column(name = "WEBHOOK_EVENT_ID", nullable = false, length = 36)
    private String webhookEventId;

    @Column(name = "EVENT_TYPE", nullable = false)
    private String eventType;

    @Column(name = "HTTP_STATUS")
    private Integer httpStatus;

    @Column(name = "RETRIES", nullable = false)
    private int retries = 0;

    @Column(name = "SUCCESS", nullable = false)
    private boolean success = false;

    @Column(name = "SENT_AT", nullable = false)
    private Instant sentAt;

    @Column(name = "LAST_ATTEMPT_AT", nullable = false)
    private Instant lastAttemptAt;

    @PrePersist
    protected void onCreate() {
        if (sentAt == null) sentAt = Instant.now();
        if (lastAttemptAt == null) lastAttemptAt = sentAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getWebhookId() { return webhookId; }
    public void setWebhookId(String webhookId) { this.webhookId = webhookId; }
    public String getWebhookEventId() { return webhookEventId; }
    public void setWebhookEventId(String webhookEventId) { this.webhookEventId = webhookEventId; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public Integer getHttpStatus() { return httpStatus; }
    public void setHttpStatus(Integer httpStatus) { this.httpStatus = httpStatus; }
    public int getRetries() { return retries; }
    public void setRetries(int retries) { this.retries = retries; }
    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    public Instant getSentAt() { return sentAt; }
    public void setSentAt(Instant sentAt) { this.sentAt = sentAt; }
    public Instant getLastAttemptAt() { return lastAttemptAt; }
    public void setLastAttemptAt(Instant lastAttemptAt) { this.lastAttemptAt = lastAttemptAt; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WebhookSendEntity that)) return false;
        return id != null && id.equals(that.id);
    }

    @Override
    public int hashCode() { return id == null ? 0 : id.hashCode(); }
}
