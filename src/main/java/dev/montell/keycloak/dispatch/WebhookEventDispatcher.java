package dev.montell.keycloak.dispatch;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import dev.montell.keycloak.event.EventPatternMatcher;
import dev.montell.keycloak.event.WebhookPayload;
import dev.montell.keycloak.model.KeycloakEventType;
import dev.montell.keycloak.model.WebhookModel;
import dev.montell.keycloak.sender.HttpSendResult;
import dev.montell.keycloak.sender.HttpWebhookSender;
import dev.montell.keycloak.spi.WebhookProvider;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.RealmModel;
import org.keycloak.models.utils.KeycloakModelUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@JBossLog
public class WebhookEventDispatcher {

    static final int MAX_PENDING = 10_000;

    private static final int DEFAULT_FAILURE_THRESHOLD = 5;
    private static final int DEFAULT_OPEN_SECONDS      = 60;
    private static final int DEFAULT_MAX_ELAPSED_S     = 900;
    private static final int DEFAULT_MAX_INTERVAL_S    = 180;

    private static final ObjectMapper MAPPER = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final KeycloakSessionFactory   factory;
    private final HttpWebhookSender        httpSender;
    private final ScheduledExecutorService executor;
    private final AtomicInteger            pendingTasks = new AtomicInteger(0);
    private final int                      maxPending;
    private final CircuitBreakerRegistry   registry;

    /** Production constructor — creates default executor, sender, and registry. */
    public WebhookEventDispatcher(KeycloakSessionFactory factory) {
        this(factory, new HttpWebhookSender(),
             new ScheduledThreadPoolExecutor(Runtime.getRuntime().availableProcessors()),
             MAX_PENDING,
             new CircuitBreakerRegistry(DEFAULT_FAILURE_THRESHOLD, DEFAULT_OPEN_SECONDS));
    }

    /** Public for testing: inject mock executor. */
    public WebhookEventDispatcher(KeycloakSessionFactory factory, HttpWebhookSender httpSender,
                           ScheduledExecutorService executor) {
        this(factory, httpSender, executor, MAX_PENDING,
             new CircuitBreakerRegistry(DEFAULT_FAILURE_THRESHOLD, DEFAULT_OPEN_SECONDS));
    }

    /** Public for testing: override maxPending (e.g. 0 to test drop). */
    public WebhookEventDispatcher(KeycloakSessionFactory factory, HttpWebhookSender httpSender,
                           ScheduledExecutorService executor, int maxPending) {
        this(factory, httpSender, executor, maxPending,
             new CircuitBreakerRegistry(DEFAULT_FAILURE_THRESHOLD, DEFAULT_OPEN_SECONDS));
    }

    WebhookEventDispatcher(KeycloakSessionFactory factory, HttpWebhookSender httpSender,
                           ScheduledExecutorService executor, int maxPending,
                           CircuitBreakerRegistry registry) {
        this.factory    = factory;
        this.httpSender = httpSender;
        this.executor   = executor;
        this.maxPending = maxPending;
        this.registry   = registry;
    }

    /**
     * Enqueues a dispatch task. Non-blocking. Drops the event (with WARN log) when
     * {@code maxPending} tasks are already queued.
     *
     * @param kcEventId Keycloak's own event ID (null for AdminEvent)
     */
    public void enqueue(WebhookPayload payload, String kcEventId, String realmId) {
        if (pendingTasks.get() >= maxPending) {
            log.warnf("Webhook dispatch queue full (%d pending), dropping event: %s",
                maxPending, payload.type());
            return;
        }
        pendingTasks.incrementAndGet();
        executor.submit(() -> {
            try {
                processAndSend(payload, kcEventId, realmId);
            } finally {
                pendingTasks.decrementAndGet();
            }
        });
    }

    private void processAndSend(WebhookPayload payload, String kcEventId, String realmId) {
        // Serialize payload to JSON (needed for both storeEvent and HTTP body)
        String payloadJson;
        try {
            payloadJson = MAPPER.writeValueAsString(payload);
        } catch (Exception e) {
            log.errorf("Failed to serialize payload realm=%s type=%s: %s",
                realmId, payload.type(), e.getMessage());
            return;
        }

        KeycloakEventType eventType = (payload instanceof WebhookPayload.AccessEvent)
            ? KeycloakEventType.USER : KeycloakEventType.ADMIN;

        // Step 1: persist event + collect enabled, matching webhooks + realm CB config (one tx)
        final String[] webhookEventId = {null};
        final List<WebhookModel> webhooks = new ArrayList<>();
        final int[] cbConfig = {DEFAULT_FAILURE_THRESHOLD, DEFAULT_OPEN_SECONDS};
        try {
            KeycloakModelUtils.runJobInTransaction(factory, session -> {
                WebhookProvider provider = session.getProvider(WebhookProvider.class);
                if (provider == null) {
                    log.warn("WebhookProvider unavailable — cannot persist event");
                    return;
                }
                RealmModel realm = session.realms().getRealm(realmId);
                if (realm == null) {
                    log.warnf("Realm not found: %s", realmId);
                    return;
                }

                // Read realm-level circuit breaker thresholds (override defaults if present)
                String ftAttr = realm.getAttribute("_webhook.circuit.failure_threshold");
                String osAttr = realm.getAttribute("_webhook.circuit.open_seconds");
                if (ftAttr != null) { try { cbConfig[0] = Integer.parseInt(ftAttr); } catch (NumberFormatException ignored) {} }
                if (osAttr != null) { try { cbConfig[1] = Integer.parseInt(osAttr); } catch (NumberFormatException ignored) {} }

                var eventModel = provider.storeEvent(realm, eventType, kcEventId, payloadJson);
                if (eventModel != null) webhookEventId[0] = eventModel.getId();

                provider.getWebhooksStream(realm)
                    .filter(WebhookModel::isEnabled)
                    .filter(w -> EventPatternMatcher.matches(w.getEventTypes(), payload.type()))
                    .forEach(webhooks::add);
            });
        } catch (Exception e) {
            log.errorf("DB error storing event realm=%s: %s — proceeding best-effort",
                realmId, e.getMessage());
        }

        if (webhookEventId[0] == null) {
            log.debugf("No webhookEventId (DB error?) — skipping send for %s", payload.type());
            return;
        }

        // Step 2: send to each webhook (independent — circuit check, send, retry)
        for (WebhookModel webhook : webhooks) {
            // Use registry (TTL cache) with realm-specific thresholds
            CircuitBreaker cb = registry.get(webhook, cbConfig[0], cbConfig[1]);

            if (!cb.allowRequest()) {
                log.debugf("Circuit OPEN for webhook %s — skipping %s",
                    webhook.getId(), payload.type());
                continue;
            }

            long maxElapsedS  = webhook.getRetryMaxElapsedSeconds()  != null
                ? webhook.getRetryMaxElapsedSeconds()  : DEFAULT_MAX_ELAPSED_S;
            long maxIntervalS = webhook.getRetryMaxIntervalSeconds() != null
                ? webhook.getRetryMaxIntervalSeconds() : DEFAULT_MAX_INTERVAL_S;

            ExponentialBackOff backOff = new ExponentialBackOff(maxElapsedS, maxIntervalS);
            sendWithRetry(payloadJson, realmId, webhook,
                webhookEventId[0], payload.type(), cb, backOff, 0);
        }
    }

    private void sendWithRetry(String payloadJson, String realmId, WebhookModel webhook,
                                String webhookEventId, String eventType,
                                CircuitBreaker cb, ExponentialBackOff backOff, int attempt) {
        HttpSendResult result = httpSender.send(
            webhook.getUrl(), payloadJson, webhook.getId(),
            webhook.getSecret(), webhook.getAlgorithm());

        if (result.success()) cb.onSuccess();
        else                  cb.onFailure();

        // Persist send record + updated circuit state
        final int finalAttempt = attempt;
        try {
            KeycloakModelUtils.runJobInTransaction(factory, session -> {
                WebhookProvider provider = session.getProvider(WebhookProvider.class);
                if (provider == null) return;
                RealmModel realm = session.realms().getRealm(realmId);
                if (realm == null) return;

                provider.storeSend(realm, webhook.getId(), webhookEventId,
                    eventType, result.httpStatus(), result.success(), finalAttempt);

                WebhookModel w = provider.getWebhookById(realm, webhook.getId());
                if (w != null) {
                    cb.applyTo(w);
                    registry.invalidate(webhook.getId()); // evict stale TTL entry after state change
                }
            });
        } catch (Exception e) {
            log.errorf("Failed to persist send result webhook=%s: %s",
                webhook.getId(), e.getMessage());
        }

        // Schedule retry if failed and backoff has time remaining
        if (!result.success()) {
            long nextDelayMs = backOff.nextBackOffMillis();
            if (nextDelayMs != ExponentialBackOff.STOP) {
                log.debugf("Scheduling retry %d for webhook %s in %dms",
                    Integer.valueOf(attempt + 1), webhook.getId(), Long.valueOf(nextDelayMs));
                executor.schedule(
                    () -> sendWithRetry(payloadJson, realmId, webhook,
                        webhookEventId, eventType, cb, backOff, attempt + 1),
                    nextDelayMs, TimeUnit.MILLISECONDS);
            } else {
                log.debugf("Max retry time exceeded for webhook %s after %d attempt(s)",
                    webhook.getId(), Integer.valueOf(attempt + 1));
            }
        }
    }

    /** Graceful shutdown — waits up to 30s for in-flight tasks. */
    public void shutdown() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            executor.shutdownNow();
        }
    }
}
