// src/main/java/dev/montell/keycloak/jpa/JpaWebhookProvider.java
package dev.montell.keycloak.jpa;

import dev.montell.keycloak.jpa.adapter.*;
import dev.montell.keycloak.jpa.entity.*;
import dev.montell.keycloak.model.*;
import dev.montell.keycloak.spi.WebhookProvider;
import jakarta.persistence.*;
import java.util.UUID;
import java.util.stream.Stream;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;

@JBossLog
public class JpaWebhookProvider implements WebhookProvider {

    private final EntityManager em;

    public JpaWebhookProvider(EntityManager em) {
        this.em = em;
    }

    // --- Webhook CRUD ---

    @Override
    public WebhookModel createWebhook(RealmModel realm, String url, UserModel createdBy) {
        WebhookEntity e = new WebhookEntity();
        e.setId(UUID.randomUUID().toString());
        e.setRealmId(realm.getId());
        e.setUrl(url);
        if (createdBy != null) e.setCreatedBy(createdBy.getId());
        em.persist(e);
        em.flush();
        return new WebhookAdapter(e);
    }

    @Override
    public WebhookModel getWebhookById(RealmModel realm, String id) {
        WebhookEntity e = em.find(WebhookEntity.class, id);
        if (e == null || !e.getRealmId().equals(realm.getId())) return null;
        return new WebhookAdapter(e);
    }

    @Override
    public Stream<WebhookModel> getWebhooksStream(RealmModel realm, Integer first, Integer max) {
        TypedQuery<WebhookEntity> q = em.createNamedQuery("getWebhooksByRealmId", WebhookEntity.class);
        q.setParameter("realmId", realm.getId());
        if (first != null) q.setFirstResult(first);
        if (max != null)   q.setMaxResults(max);
        return q.getResultStream().map(WebhookAdapter::new);
    }

    @Override
    public long getWebhooksCount(RealmModel realm) {
        TypedQuery<Long> q = em.createNamedQuery("countWebhooksByRealmId", Long.class);
        q.setParameter("realmId", realm.getId());
        return q.getSingleResult();
    }

    @Override
    public boolean removeWebhook(RealmModel realm, String id) {
        WebhookEntity e = em.find(WebhookEntity.class, id);
        if (e == null || !e.getRealmId().equals(realm.getId())) return false;
        em.remove(e);
        em.flush();
        return true;
    }

    @Override
    public void removeWebhooks(RealmModel realm) {
        em.createNamedQuery("removeAllWebhooksByRealmId")
          .setParameter("realmId", realm.getId())
          .executeUpdate();
        em.clear(); // required after bulk DELETE to avoid stale L1 cache entries
    }

    // --- Event audit trail ---

    @Override
    public WebhookEventModel storeEvent(RealmModel realm, KeycloakEventType type,
                                        String kcEventId, String payloadJson) {
        try {
            WebhookEventEntity e = new WebhookEventEntity();
            e.setId(UUID.randomUUID().toString());
            e.setRealmId(realm.getId());
            e.setEventType(type);
            e.setKcEventId(kcEventId);
            e.setEventObject(payloadJson);
            em.persist(e);
            em.flush();
            return new WebhookEventAdapter(e);
        } catch (PersistenceException ex) {
            // Unique constraint violation on KC_EVENT_ID = duplicate event → idempotent
            log.debugf("storeEvent duplicate for kcEventId=%s: %s", kcEventId, ex.getMessage());
            em.clear();
            WebhookEventModel existing = getEventByKcId(realm, kcEventId);
            if (existing == null) {
                log.warnf("storeEvent fallback returned null for kcEventId=%s — unexpected state", kcEventId);
            }
            return existing;
        }
    }

    @Override
    public WebhookEventModel getEventByKcId(RealmModel realm, String kcEventId) {
        try {
            WebhookEventEntity e = em.createNamedQuery("getWebhookEventByKcId", WebhookEventEntity.class)
                .setParameter("realmId", realm.getId())
                .setParameter("kcEventId", kcEventId)
                .getSingleResult();
            return new WebhookEventAdapter(e);
        } catch (NoResultException nre) {
            return null;
        }
    }

    // --- Send log ---

    @Override
    public WebhookSendModel storeSend(
            RealmModel realm, // realm parameter accepted for API uniformity; scoping is via webhookId FK
            String webhookId, String webhookEventId,
            String eventType, int httpStatus, boolean success, int retries) {
        String id = WebhookSendEntity.buildId(webhookId, webhookEventId);
        WebhookSendEntity e = em.find(WebhookSendEntity.class, id);
        if (e == null) {
            e = new WebhookSendEntity();
            e.setId(id);
            e.setWebhookId(webhookId);
            e.setWebhookEventId(webhookEventId);
            e.setEventType(eventType);
        }
        e.setHttpStatus(httpStatus);
        e.setSuccess(success);
        e.setRetries(retries);
        e.setLastAttemptAt(java.time.Instant.now());
        em.persist(e);
        em.flush();
        return new WebhookSendAdapter(e);
    }

    @Override
    public WebhookSendModel getSendById(
            RealmModel realm, // realm accepted for API uniformity; no direct realm column on WEBHOOK_SEND
            String id) {
        WebhookSendEntity e = em.find(WebhookSendEntity.class, id);
        return e != null ? new WebhookSendAdapter(e) : null;
    }

    @Override
    public Stream<WebhookSendModel> getSendsByWebhook(RealmModel realm, String webhookId,
                                                       Integer first, Integer max) {
        TypedQuery<WebhookSendEntity> q = em.createNamedQuery("getWebhookSendsByWebhookId", WebhookSendEntity.class);
        q.setParameter("webhookId", webhookId);
        if (first != null) q.setFirstResult(first);
        if (max != null)   q.setMaxResults(max);
        return q.getResultStream().map(WebhookSendAdapter::new);
    }

    @Override
    public Stream<WebhookSendModel> getSendsByEvent(RealmModel realm, String webhookEventId) {
        return em.createNamedQuery("getWebhookSendsByEventId", WebhookSendEntity.class)
            .setParameter("webhookEventId", webhookEventId)
            .getResultStream().map(WebhookSendAdapter::new);
    }

    @Override
    public void close() {}
}
