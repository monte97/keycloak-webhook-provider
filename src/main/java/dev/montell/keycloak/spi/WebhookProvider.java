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

public interface WebhookProvider extends Provider {

    // --- Webhook CRUD ---
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
    WebhookEventModel storeEvent(RealmModel realm, KeycloakEventType type,
                                 String kcEventId, String payloadJson);
    WebhookEventModel getEventByKcId(RealmModel realm, String kcEventId);

    // --- Send log ---
    WebhookSendModel storeSend(RealmModel realm, String webhookId, String webhookEventId,
                               String eventType, int httpStatus, boolean success,
                               int retries);
    WebhookSendModel getSendById(RealmModel realm, String id);
    Stream<WebhookSendModel> getSendsByWebhook(RealmModel realm, String webhookId,
                                               Integer first, Integer max);
    Stream<WebhookSendModel> getSendsByEvent(RealmModel realm, String webhookEventId);
}
