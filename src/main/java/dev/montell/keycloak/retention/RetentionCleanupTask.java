// src/main/java/dev/montell/keycloak/retention/RetentionCleanupTask.java
package dev.montell.keycloak.retention;

import jakarta.persistence.EntityManager;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.connections.jpa.JpaConnectionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.timer.ScheduledTask;

import java.util.List;

/**
 * Scheduled task that deletes old webhook events and send records based on per-realm
 * retention policies. Runs every 24 hours, scheduled by
 * {@link dev.montell.keycloak.listener.WebhookEventListenerProviderFactory}.
 *
 * <p>Retention periods are configured via realm attributes:
 * <ul>
 *   <li>{@code _webhook.retention.events.days} — default {@value #DEFAULT_EVENT_DAYS}</li>
 *   <li>{@code _webhook.retention.sends.days} — default {@value #DEFAULT_SEND_DAYS}</li>
 * </ul>
 */
@JBossLog
public class RetentionCleanupTask implements ScheduledTask {

    private static final int DEFAULT_EVENT_DAYS = 30;
    private static final int DEFAULT_SEND_DAYS  = 90;

    @Override
    public void run(KeycloakSession session) {
        EntityManager em = session.getProvider(JpaConnectionProvider.class).getEntityManager();
        List<RealmModel> realms = session.realms().getRealmsStream().toList();

        for (RealmModel realm : realms) {
            int eventDays = getRetentionDays(realm, "_webhook.retention.events.days", DEFAULT_EVENT_DAYS);
            int sendDays  = getRetentionDays(realm, "_webhook.retention.sends.days",  DEFAULT_SEND_DAYS);

            int eventsDeleted = em.createNativeQuery(
                    "DELETE FROM WEBHOOK_EVENT WHERE REALM_ID = :realmId " +
                    "AND CREATED_AT < CURRENT_TIMESTAMP - CAST(:days || ' days' AS INTERVAL)")
                .setParameter("realmId", realm.getId())
                .setParameter("days", eventDays)
                .executeUpdate();

            int sendsDeleted = em.createNativeQuery(
                    "DELETE FROM WEBHOOK_SEND WHERE SENT_AT < CURRENT_TIMESTAMP " +
                    "- CAST(:days || ' days' AS INTERVAL) " +
                    "AND WEBHOOK_ID IN (SELECT ID FROM WEBHOOK WHERE REALM_ID = :realmId)")
                .setParameter("realmId", realm.getId())
                .setParameter("days", sendDays)
                .executeUpdate();

            if (eventsDeleted > 0 || sendsDeleted > 0) {
                log.infof("Retention cleanup realm=%s: deleted %d events, %d sends",
                    realm.getId(), eventsDeleted, sendsDeleted);
            }
        }
    }

    private int getRetentionDays(RealmModel realm, String attr, int defaultValue) {
        String value = realm.getAttribute(attr);
        if (value == null) return defaultValue;
        try {
            int v = Integer.parseInt(value.trim());
            return v > 0 ? v : defaultValue;
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
