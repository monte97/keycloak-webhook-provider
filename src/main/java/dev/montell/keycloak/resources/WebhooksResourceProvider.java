// src/main/java/dev/montell/keycloak/resources/WebhooksResourceProvider.java
package dev.montell.keycloak.resources;

import org.keycloak.models.KeycloakSession;
import org.keycloak.services.resource.RealmResourceProvider;

public class WebhooksResourceProvider implements RealmResourceProvider {

    private final KeycloakSession session;

    public WebhooksResourceProvider(KeycloakSession session) {
        this.session = session;
    }

    @Override
    public Object getResource() {
        return new WebhooksResource(session, session.getContext().getRealm());
    }

    @Override
    public void close() {}
}
