// src/main/java/dev/montell/keycloak/spi/WebhookProvider.java
package dev.montell.keycloak.spi;

import dev.montell.keycloak.model.KeycloakEventType;
import dev.montell.keycloak.model.WebhookEventModel;
import dev.montell.keycloak.model.WebhookModel;
import dev.montell.keycloak.model.WebhookSendModel;
import java.util.stream.Stream;
import org.keycloak.provider.Provider;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;

/**
 * Custom Keycloak SPI providing data access for webhooks, events, and send records.
 * Implementations handle CRUD operations, event persistence, and delivery audit trail.
 *
 * <p>All methods accept a {@link RealmModel} for tenant scoping. The JPA implementation
 * uses Keycloak's existing datasource and entity manager.
 *
 * @see dev.montell.keycloak.jpa.JpaWebhookProvider
 */
public interface WebhookProvider extends Provider {

    // --- Webhook CRUD ---

    /**
     * Creates a new webhook registration for the given realm.
     *
     * @param realm     the realm this webhook belongs to
     * @param url       the target URL for webhook delivery
     * @param createdBy the user who created this webhook (nullable)
     * @return the newly created webhook model
     */
    WebhookModel createWebhook(RealmModel realm, String url, UserModel createdBy);
    WebhookModel getWebhookById(RealmModel realm, String id);
    Stream<WebhookModel> getWebhooksStream(RealmModel realm, Integer first, Integer max);
    default Stream<WebhookModel> getWebhooksStream(RealmModel realm) {
        return getWebhooksStream(realm, null, null);
    }
    long getWebhooksCount(RealmModel realm);
    boolean removeWebhook(RealmModel realm, String id);
    void removeWebhooks(RealmModel realm);

    // --- Event audit trail ---

    /**
     * Persists a Keycloak event for the audit trail. Uses a savepoint to handle
     * duplicate {@code kcEventId} values idempotently (returns the existing record
     * on constraint violation).
     *
     * @param realm       the realm the event belongs to
     * @param type        coarse event classification (USER or ADMIN)
     * @param kcEventId   Keycloak's own event ID (nullable for admin events)
     * @param payloadJson serialized JSON payload
     * @return the stored (or existing) event model, or {@code null} on unexpected failure
     */
    WebhookEventModel storeEvent(RealmModel realm, KeycloakEventType type,
                                 String kcEventId, String payloadJson);
    WebhookEventModel getEventByKcId(RealmModel realm, String kcEventId);

    WebhookEventModel getEventById(RealmModel realm, String id);

    Stream<WebhookEventModel> getEventsByWebhookId(RealmModel realm, String webhookId,
                                                     Integer first, Integer max);

    Stream<WebhookSendModel> getSendsByWebhook(RealmModel realm, String webhookId,
                                                Integer first, Integer max, Boolean success);

    Stream<WebhookSendModel> getFailedSendsSince(RealmModel realm, String webhookId,
                                                  java.time.Instant since);

    // --- Send log ---

    /**
     * Records a webhook delivery attempt. If a send record already exists for the
     * webhook-event pair, it is updated in place (upsert semantics).
     *
     * @param realm          the realm (for API uniformity; scoping is via webhookId FK)
     * @param webhookId      the target webhook
     * @param webhookEventId the event being delivered
     * @param eventType      canonical event type string (e.g. "access.LOGIN")
     * @param httpStatus     HTTP response status code (-1 on network error)
     * @param success        whether delivery succeeded (HTTP 2xx)
     * @param retries        retry attempt number (0 = first try)
     * @return the stored or updated send model
     */
    WebhookSendModel storeSend(RealmModel realm, String webhookId, String webhookEventId,
                               String eventType, int httpStatus, boolean success,
                               int retries);
    WebhookSendModel getSendById(RealmModel realm, String id);
    Stream<WebhookSendModel> getSendsByWebhook(RealmModel realm, String webhookId,
                                               Integer first, Integer max);
    Stream<WebhookSendModel> getSendsByEvent(RealmModel realm, String webhookEventId);
}
