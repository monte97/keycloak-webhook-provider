// src/main/java/dev/montell/keycloak/listener/WebhookEventListenerProvider.java
package dev.montell.keycloak.listener;

import dev.montell.keycloak.dispatch.WebhookEventDispatcher;
import dev.montell.keycloak.event.EventEnricher;
import dev.montell.keycloak.event.WebhookPayload;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.AbstractKeycloakTransaction;
import org.keycloak.models.KeycloakSession;

@JBossLog
public class WebhookEventListenerProvider implements EventListenerProvider {

    private final KeycloakSession       session;
    private final WebhookEventDispatcher dispatcher;

    public WebhookEventListenerProvider(KeycloakSession session,
                                         WebhookEventDispatcher dispatcher) {
        this.session    = session;
        this.dispatcher = dispatcher;
    }

    @Override
    public void onEvent(Event event) {
        if (event.getType() == null) return;
        String kcEventId = event.getId();
        String realmId   = event.getRealmId();
        WebhookPayload payload = EventEnricher.enrich(event, session);
        enlistAfterCommit(() -> dispatcher.enqueue(payload, kcEventId, realmId));
    }

    @Override
    public void onEvent(AdminEvent event, boolean includeRepresentation) {
        if (event.getResourceType() == null || event.getOperationType() == null) return;
        String realmId = event.getRealmId();
        WebhookPayload payload = EventEnricher.enrich(event, session);
        // AdminEvent has no stable UUID → pass null as kcEventId (nullable per schema)
        enlistAfterCommit(() -> dispatcher.enqueue(payload, null, realmId));
    }

    @Override
    public void close() {}

    /** Enqueues {@code task} to run only if the current Keycloak transaction commits. */
    private void enlistAfterCommit(Runnable task) {
        session.getTransactionManager().enlistAfterCompletion(
            new AbstractKeycloakTransaction() {
                @Override protected void commitImpl()   { task.run(); }
                @Override protected void rollbackImpl() { /* no-op */ }
            });
    }
}
