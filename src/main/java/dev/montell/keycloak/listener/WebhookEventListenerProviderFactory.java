// src/main/java/dev/montell/keycloak/listener/WebhookEventListenerProviderFactory.java
package dev.montell.keycloak.listener;

import com.google.auto.service.AutoService;
import dev.montell.keycloak.dispatch.WebhookComponentHolder;
import dev.montell.keycloak.dispatch.WebhookEventDispatcher;
import dev.montell.keycloak.logging.AuditLogger;
import dev.montell.keycloak.retention.RetentionCleanupTask;
import java.util.concurrent.TimeUnit;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.Config.Scope;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.utils.KeycloakModelUtils;
import org.keycloak.timer.TimerProvider;

/**
 * Factory for {@link WebhookEventListenerProvider}. This is the main entry point for the webhook
 * provider: it initializes the {@link WebhookEventDispatcher}, registers shared components via
 * {@link WebhookComponentHolder}, and schedules the 24-hour {@link RetentionCleanupTask}.
 *
 * <p>Registered as provider ID {@value #PROVIDER_ID}. Enable in Keycloak via Realm Settings &rarr;
 * Events &rarr; Event Listeners &rarr; {@code webhook-provider}.
 */
@JBossLog
@AutoService(EventListenerProviderFactory.class)
public class WebhookEventListenerProviderFactory implements EventListenerProviderFactory {

    public static final String PROVIDER_ID = "webhook-provider";

    private WebhookEventDispatcher dispatcher;

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public EventListenerProvider create(KeycloakSession session) {
        return new WebhookEventListenerProvider(session, dispatcher);
    }

    @Override
    public void init(Scope config) {}

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        AuditLogger.init();
        this.dispatcher = new WebhookEventDispatcher(factory);
        WebhookComponentHolder.init(dispatcher.getHttpSender(), dispatcher.getRegistry());

        // Schedule retention cleanup every 24h
        KeycloakModelUtils.runJobInTransaction(
                factory,
                session -> {
                    TimerProvider timer = session.getProvider(TimerProvider.class);
                    if (timer != null) {
                        timer.scheduleTask(
                                new RetentionCleanupTask(),
                                TimeUnit.HOURS.toMillis(24),
                                "webhook-provider-retention-cleanup");
                    } else {
                        log.warn("TimerProvider not available — retention cleanup not scheduled");
                    }
                });

        log.infof("WebhookEventListenerProviderFactory initialized (provider-id: %s)", PROVIDER_ID);
    }

    @Override
    public void close() {
        if (dispatcher != null) dispatcher.shutdown();
    }
}
