// src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntityProvider.java
package dev.montell.keycloak.jpa.entity;

import java.util.List;
import org.keycloak.connections.jpa.entityprovider.JpaEntityProvider;

public class WebhookEntityProvider implements JpaEntityProvider {

    static final String FACTORY_ID = "webhook-entity-provider";

    @Override
    public List<Class<?>> getEntities() {
        return List.of(WebhookEntity.class, WebhookEventEntity.class, WebhookSendEntity.class);
    }

    @Override
    public String getChangelogLocation() {
        return "META-INF/jpa-changelog-webhook.xml";
    }

    @Override
    public String getFactoryId() {
        return FACTORY_ID;
    }

    @Override
    public void close() {}
}
