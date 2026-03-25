// src/main/java/dev/montell/keycloak/resources/WebhooksResourceProviderFactory.java
package dev.montell.keycloak.resources;

import com.google.auto.service.AutoService;
import org.keycloak.Config.Scope;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.services.resource.RealmResourceProvider;
import org.keycloak.services.resource.RealmResourceProviderFactory;

/**
 * Factory that registers the webhook REST API under
 * {@code /realms/{realm}/webhooks} (provider ID: {@value #PROVIDER_ID}).
 */
@AutoService(RealmResourceProviderFactory.class)
public class WebhooksResourceProviderFactory implements RealmResourceProviderFactory {

    public static final String PROVIDER_ID = "webhooks";

    @Override
    public String getId() { return PROVIDER_ID; }

    @Override
    public RealmResourceProvider create(KeycloakSession session) {
        return new WebhooksResourceProvider(session);
    }

    @Override
    public void init(Scope config) {}

    @Override
    public void postInit(KeycloakSessionFactory factory) {}

    @Override
    public void close() {}
}
