// src/main/java/dev/montell/keycloak/jpa/JpaWebhookProvider.java
package dev.montell.keycloak.jpa;

import dev.montell.keycloak.jpa.adapter.*;
import dev.montell.keycloak.jpa.entity.*;
import dev.montell.keycloak.model.*;
import dev.montell.keycloak.spi.WebhookProvider;
import jakarta.persistence.*;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.util.UUID;
import java.util.stream.Stream;
import lombok.extern.jbosslog.JBossLog;
import org.hibernate.Session;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;

/**
 * JPA-backed implementation of {@link WebhookProvider}. Uses Keycloak's existing
 * {@link EntityManager} and datasource for all persistence operations.
 *
 * <p>Notable implementation detail: {@link #storeEvent} uses a JDBC savepoint to handle
 * duplicate {@code KC_EVENT_ID} values idempotently. This is required because PostgreSQL
 * marks the entire transaction as aborted after a constraint violation.
 */
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
        // Use a JDBC savepoint so that a unique constraint violation on KC_EVENT_ID can be
        // recovered from within the same transaction (required on PostgreSQL which otherwise
        // marks the entire transaction as aborted after a constraint error).
        Session session = em.unwrap(Session.class);
        Savepoint sp = null;
        try {
            sp = session.doReturningWork(conn -> conn.setSavepoint("storeEvent_sp"));
            WebhookEventEntity e = new WebhookEventEntity();
            e.setId(UUID.randomUUID().toString());
            e.setRealmId(realm.getId());
            e.setEventType(type);
            e.setKcEventId(kcEventId);
            e.setEventObject(payloadJson);
            em.persist(e);
            em.flush();
            if (sp != null) {
                final Savepoint spFinal = sp;
                session.doWork(conn -> conn.releaseSavepoint(spFinal));
            }
            return new WebhookEventAdapter(e);
        } catch (PersistenceException ex) {
            // Unique constraint violation on KC_EVENT_ID = duplicate event → idempotent
            log.debugf("storeEvent duplicate for kcEventId=%s: %s", kcEventId, ex.getMessage());
            if (sp != null) {
                final Savepoint spFinal = sp;
                try {
                    session.doWork(conn -> conn.rollback(spFinal));
                } catch (Exception rollbackEx) {
                    log.warnf("Failed to rollback savepoint for kcEventId=%s: %s", kcEventId, rollbackEx.getMessage());
                }
            }
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

    @Override
    public WebhookEventModel getEventById(RealmModel realm, String id) {
        WebhookEventEntity e = em.find(WebhookEventEntity.class, id);
        if (e == null || !e.getRealmId().equals(realm.getId())) return null;
        return new WebhookEventAdapter(e);
    }

    @Override
    public Stream<WebhookEventModel> getEventsByWebhookId(RealmModel realm, String webhookId,
                                                           Integer first, Integer max) {
        WebhookEntity w = em.find(WebhookEntity.class, webhookId);
        if (w == null || !w.getRealmId().equals(realm.getId())) return Stream.empty();
        TypedQuery<WebhookEventEntity> q = em.createNamedQuery("getWebhookEventsByWebhookId", WebhookEventEntity.class);
        q.setParameter("webhookId", webhookId);
        if (first != null) q.setFirstResult(first);
        if (max != null)   q.setMaxResults(max);
        return q.getResultStream().map(WebhookEventAdapter::new);
    }

    @Override
    public Stream<WebhookSendModel> getSendsByWebhook(RealmModel realm, String webhookId,
                                                       Integer first, Integer max, Boolean success) {
        TypedQuery<WebhookSendEntity> q = em.createNamedQuery("getWebhookSendsByWebhookIdFiltered", WebhookSendEntity.class);
        q.setParameter("webhookId", webhookId);
        q.setParameter("success", success);
        if (first != null) q.setFirstResult(first);
        if (max != null)   q.setMaxResults(max);
        return q.getResultStream().map(WebhookSendAdapter::new);
    }

    @Override
    public Stream<WebhookSendModel> getFailedSendsSince(RealmModel realm, String webhookId,
                                                         java.time.Instant since) {
        TypedQuery<WebhookSendEntity> q = em.createNamedQuery("getFailedSendsSince", WebhookSendEntity.class);
        q.setParameter("webhookId", webhookId);
        q.setParameter("since", since);
        return q.getResultStream().map(WebhookSendAdapter::new);
    }

    // --- Send log ---

    @Override
    public WebhookSendModel storeSend(
            RealmModel realm, // realm parameter accepted for API uniformity; scoping is via webhookId FK
            String webhookId, String webhookEventId,
            String eventType, int httpStatus, boolean success, int retries) {
        String id = WebhookSendEntity.buildId(webhookId, webhookEventId);
        WebhookSendEntity e = em.find(WebhookSendEntity.class, id);
        boolean isNew = (e == null);
        if (isNew) {
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
        if (isNew) em.persist(e); // existing entities are already managed; dirty-check handles updates
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
