// src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntityProviderFactory.java
package dev.montell.keycloak.jpa.entity;

import com.google.auto.service.AutoService;
import dev.montell.keycloak.spi.WebhookProvider;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.Config.Scope;
import org.keycloak.connections.jpa.entityprovider.JpaEntityProvider;
import org.keycloak.connections.jpa.entityprovider.JpaEntityProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.RealmModel;

/**
 * Factory for {@link WebhookEntityProvider}. Also registers a listener for {@link
 * RealmModel.RealmRemovedEvent} to clean up all webhook data when a realm is deleted.
 */
@JBossLog
@AutoService(JpaEntityProviderFactory.class)
public class WebhookEntityProviderFactory implements JpaEntityProviderFactory {

    @Override
    public JpaEntityProvider create(KeycloakSession session) {
        return new WebhookEntityProvider();
    }

    @Override
    public String getId() {
        return WebhookEntityProvider.FACTORY_ID;
    }

    @Override
    public void init(Scope config) {}

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // Clean up webhooks when a realm is removed
        factory.register(
                event -> {
                    if (event instanceof RealmModel.RealmRemovedEvent removed) {
                        KeycloakSession session = removed.getKeycloakSession();
                        WebhookProvider provider = session.getProvider(WebhookProvider.class);
                        if (provider != null) {
                            provider.removeWebhooks(removed.getRealm());
                        }
                    }
                });
    }

    @Override
    public void close() {}
}
