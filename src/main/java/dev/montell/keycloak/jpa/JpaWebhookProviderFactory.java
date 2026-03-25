// src/main/java/dev/montell/keycloak/jpa/JpaWebhookProviderFactory.java
package dev.montell.keycloak.jpa;

import com.google.auto.service.AutoService;
import dev.montell.keycloak.spi.WebhookProvider;
import dev.montell.keycloak.spi.WebhookProviderFactory;
import jakarta.persistence.EntityManager;
import org.keycloak.Config.Scope;
import org.keycloak.connections.jpa.JpaConnectionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/**
 * Factory that creates {@link JpaWebhookProvider} instances using the {@link EntityManager}
 * from Keycloak's JPA connection. Registered as provider ID {@value #PROVIDER_ID}.
 */
@AutoService(WebhookProviderFactory.class)
public class JpaWebhookProviderFactory implements WebhookProviderFactory {

    public static final String PROVIDER_ID = "jpa-webhook";

    @Override
    public String getId() { return PROVIDER_ID; }

    @Override
    public WebhookProvider create(KeycloakSession session) {
        EntityManager em = session.getProvider(JpaConnectionProvider.class).getEntityManager();
        return new JpaWebhookProvider(em);
    }

    @Override
    public void init(Scope config) {}

    @Override
    public void postInit(KeycloakSessionFactory factory) {}

    @Override
    public void close() {}
}
