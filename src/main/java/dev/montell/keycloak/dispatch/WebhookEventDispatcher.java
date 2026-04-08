package dev.montell.keycloak.dispatch;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import dev.montell.keycloak.event.EventPatternMatcher;
import dev.montell.keycloak.event.WebhookPayload;
import dev.montell.keycloak.logging.AuditLogger;
import dev.montell.keycloak.metrics.WebhookMetrics;
import dev.montell.keycloak.model.KeycloakEventType;
import dev.montell.keycloak.model.WebhookModel;
import dev.montell.keycloak.sender.HttpSendResult;
import dev.montell.keycloak.sender.HttpWebhookSender;
import dev.montell.keycloak.spi.WebhookProvider;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.RealmModel;
import org.keycloak.models.utils.KeycloakModelUtils;

/**
 * Central orchestrator for asynchronous webhook delivery. Manages the full lifecycle: event
 * persistence, webhook matching, HTTP dispatch with circuit breaker protection, and exponential
 * backoff retry scheduling.
 *
 * <p>Uses a {@link ScheduledExecutorService} with {@code nCPUs} threads and a cap of {@value
 * #MAX_PENDING} pending tasks for backpressure. Events exceeding the cap are dropped with a warning
 * log.
 *
 * <p>Thread safety: the dispatcher is a singleton shared across all Keycloak request threads.
 * Enqueue is non-blocking; all I/O happens on executor threads.
 */
@JBossLog
public class WebhookEventDispatcher {

    public static final int MAX_PENDING = 10_000;

    private static final int DEFAULT_FAILURE_THRESHOLD = 5;
    private static final int DEFAULT_OPEN_SECONDS = 60;
    private static final int DEFAULT_MAX_ELAPSED_S = 900;
    private static final int DEFAULT_MAX_INTERVAL_S = 180;

    private static final ObjectMapper MAPPER =
            new ObjectMapper()
                    .registerModule(new JavaTimeModule())
                    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final KeycloakSessionFactory factory;
    private final HttpWebhookSender httpSender;
    private final ScheduledExecutorService executor;
    private final AtomicInteger pendingTasks = new AtomicInteger(0);
    private final int maxPending;
    private final CircuitBreakerRegistry registry;
    private final WebhookMetrics metrics;

    /** Production constructor — creates default executor, sender, and registry. */
    public WebhookEventDispatcher(KeycloakSessionFactory factory) {
        this(
                factory,
                new HttpWebhookSender(),
                new ScheduledThreadPoolExecutor(Runtime.getRuntime().availableProcessors()),
                MAX_PENDING,
                new CircuitBreakerRegistry(DEFAULT_FAILURE_THRESHOLD, DEFAULT_OPEN_SECONDS),
                new WebhookMetrics());
    }

    /** Public for testing: inject mock executor. */
    public WebhookEventDispatcher(
            KeycloakSessionFactory factory,
            HttpWebhookSender httpSender,
            ScheduledExecutorService executor) {
        this(
                factory,
                httpSender,
                executor,
                MAX_PENDING,
                new CircuitBreakerRegistry(DEFAULT_FAILURE_THRESHOLD, DEFAULT_OPEN_SECONDS),
                new WebhookMetrics(new io.prometheus.client.CollectorRegistry()));
    }

    /** Public for testing: override maxPending (e.g. 0 to test drop). */
    public WebhookEventDispatcher(
            KeycloakSessionFactory factory,
            HttpWebhookSender httpSender,
            ScheduledExecutorService executor,
            int maxPending) {
        this(
                factory,
                httpSender,
                executor,
                maxPending,
                new CircuitBreakerRegistry(DEFAULT_FAILURE_THRESHOLD, DEFAULT_OPEN_SECONDS),
                new WebhookMetrics(new io.prometheus.client.CollectorRegistry()));
    }

    public WebhookEventDispatcher(
            KeycloakSessionFactory factory,
            HttpWebhookSender httpSender,
            ScheduledExecutorService executor,
            int maxPending,
            CircuitBreakerRegistry registry,
            WebhookMetrics metrics) {
        this.factory = factory;
        this.httpSender = httpSender;
        this.executor = executor;
        this.maxPending = maxPending;
        this.registry = registry;
        this.metrics = metrics;
    }

    /**
     * Enqueues a dispatch task. Non-blocking. Drops the event (with WARN log) when {@code
     * maxPending} tasks are already queued.
     *
     * @param kcEventId Keycloak's own event ID (null for AdminEvent)
     */
    public void enqueue(WebhookPayload payload, String kcEventId, String realmId) {
        if (pendingTasks.get() >= maxPending) {
            log.warnf(
                    "Webhook dispatch queue full (%d pending), dropping event: %s",
                    maxPending, payload.type());
            metrics.recordEventDropped(realmId);
            AuditLogger.eventDropped(realmId, payload.type(), pendingTasks.get());
            return;
        }
        pendingTasks.incrementAndGet();
        metrics.recordEventReceived(realmId, payload.type());
        metrics.setQueuePending(pendingTasks.get());
        final WebhookMetrics m = metrics;
        executor.submit(
                () -> {
                    try {
                        processAndSend(payload, kcEventId, realmId);
                    } finally {
                        pendingTasks.decrementAndGet();
                        m.setQueuePending(pendingTasks.get());
                    }
                });
    }

    private void processAndSend(WebhookPayload payload, String kcEventId, String realmId) {
        // Serialize payload to JSON (needed for both storeEvent and HTTP body)
        String payloadJson;
        try {
            payloadJson = MAPPER.writeValueAsString(payload);
        } catch (Exception e) {
            log.errorf(
                    "Failed to serialize payload realm=%s type=%s: %s",
                    realmId, payload.type(), e.getMessage());
            return;
        }

        KeycloakEventType eventType =
                (payload instanceof WebhookPayload.AccessEvent)
                        ? KeycloakEventType.USER
                        : KeycloakEventType.ADMIN;

        // Step 1: persist event + collect enabled, matching webhooks + realm CB config (one tx)
        final String[] webhookEventId = {null};
        final List<WebhookModel> webhooks = new ArrayList<>();
        final int[] cbConfig = {DEFAULT_FAILURE_THRESHOLD, DEFAULT_OPEN_SECONDS};
        try {
            KeycloakModelUtils.runJobInTransaction(
                    factory,
                    session -> {
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

                        // Read realm-level circuit breaker thresholds (override defaults if
                        // present)
                        String ftAttr = realm.getAttribute("_webhook.circuit.failure_threshold");
                        String osAttr = realm.getAttribute("_webhook.circuit.open_seconds");
                        if (ftAttr != null) {
                            try {
                                cbConfig[0] = Integer.parseInt(ftAttr);
                            } catch (NumberFormatException ignored) {
                            }
                        }
                        if (osAttr != null) {
                            try {
                                cbConfig[1] = Integer.parseInt(osAttr);
                            } catch (NumberFormatException ignored) {
                            }
                        }

                        var eventModel =
                                provider.storeEvent(realm, eventType, kcEventId, payloadJson);
                        if (eventModel != null) webhookEventId[0] = eventModel.getId();

                        Instant now = Instant.now();
                        provider.getWebhooksStream(realm)
                                .filter(WebhookModel::isEnabled)
                                .filter(
                                        w ->
                                                EventPatternMatcher.matches(
                                                        w.getEventTypes(), payload.type()))
                                .forEach(
                                        w -> {
                                            if (w.expireRotationIfDue(now)) {
                                                metrics.recordSecretRotation(realmId, "expired");
                                                dev.montell.keycloak.logging.AuditLogger
                                                        .rotationExpired(realmId, w.getId());
                                            }
                                            webhooks.add(w);
                                        });
                    });
        } catch (Exception e) {
            log.errorf(
                    "DB error storing event realm=%s: %s — proceeding best-effort",
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
                String reason =
                        CircuitBreaker.HALF_OPEN.equals(cb.getState())
                                ? "probe in flight"
                                : "circuit OPEN";
                log.debugf(
                        "Skipping webhook %s — %s — %s", webhook.getId(), reason, payload.type());
                continue;
            }

            long maxElapsedS =
                    webhook.getRetryMaxElapsedSeconds() != null
                            ? webhook.getRetryMaxElapsedSeconds()
                            : DEFAULT_MAX_ELAPSED_S;
            long maxIntervalS =
                    webhook.getRetryMaxIntervalSeconds() != null
                            ? webhook.getRetryMaxIntervalSeconds()
                            : DEFAULT_MAX_INTERVAL_S;

            ExponentialBackOff backOff = new ExponentialBackOff(maxElapsedS, maxIntervalS);
            sendWithRetry(
                    payloadJson,
                    realmId,
                    webhook,
                    webhookEventId[0],
                    payload.type(),
                    cb,
                    backOff,
                    0);
        }
    }

    private void sendWithRetry(
            String payloadJson,
            String realmId,
            WebhookModel webhook,
            String webhookEventId,
            String eventType,
            CircuitBreaker cb,
            ExponentialBackOff backOff,
            int attempt) {
        long startNanos = System.nanoTime();
        HttpSendResult result =
                httpSender.send(
                        webhook.getUrl(),
                        payloadJson,
                        webhook.getId(),
                        webhook.getSecret(),
                        webhook.getAlgorithm(),
                        webhook.getSecondarySecret());
        double durationSeconds = (System.nanoTime() - startNanos) / 1_000_000_000.0;

        metrics.recordDispatch(realmId, result.success(), durationSeconds);

        if (result.success()) {
            AuditLogger.dispatchSuccess(
                    realmId,
                    webhook.getId(),
                    eventType,
                    attempt,
                    webhook.getUrl(),
                    result.httpStatus(),
                    durationSeconds);
        } else {
            AuditLogger.dispatchFailure(
                    realmId,
                    webhook.getId(),
                    eventType,
                    attempt,
                    webhook.getUrl(),
                    result.httpStatus(),
                    result.errorMessage(),
                    durationSeconds);
        }

        if (result.success()) cb.onSuccess();
        else cb.onFailure();

        // Persist send record + updated circuit state
        final int finalAttempt = attempt;
        try {
            KeycloakModelUtils.runJobInTransaction(
                    factory,
                    session -> {
                        WebhookProvider provider = session.getProvider(WebhookProvider.class);
                        if (provider == null) return;
                        RealmModel realm = session.realms().getRealm(realmId);
                        if (realm == null) return;

                        provider.storeSend(
                                realm,
                                webhook.getId(),
                                webhookEventId,
                                eventType,
                                result.httpStatus(),
                                result.success(),
                                finalAttempt);

                        WebhookModel w = provider.getWebhookById(realm, webhook.getId());
                        if (w != null) {
                            // Apply delta to current DB state instead of blindly
                            // overwriting with (potentially stale) in-memory CB state.
                            // This avoids lost updates when concurrent retry chains
                            // hold references to different CircuitBreaker snapshots.
                            if (result.success()) {
                                w.setCircuitState(CircuitBreaker.CLOSED);
                                w.setFailureCount(0);
                                w.setLastFailureAt(null);
                            } else {
                                int newCount = w.getFailureCount() + 1;
                                w.setFailureCount(newCount);
                                w.setLastFailureAt(Instant.now());
                                if (newCount >= cb.getFailureThreshold()) {
                                    w.setCircuitState(CircuitBreaker.OPEN);
                                }
                            }
                            registry.invalidate(
                                    webhook.getId()); // evict stale TTL entry after state change
                            metrics.setCircuitState(realmId, webhook.getId(), w.getCircuitState());
                            if ("OPEN".equals(w.getCircuitState())) {
                                AuditLogger.circuitOpened(
                                        realmId, webhook.getId(), w.getFailureCount());
                            } else if ("CLOSED".equals(w.getCircuitState()) && result.success()) {
                                AuditLogger.circuitReset(realmId, webhook.getId());
                            }
                        }
                    });
        } catch (Exception e) {
            log.errorf(
                    "Failed to persist send result webhook=%s: %s",
                    webhook.getId(), e.getMessage());
        }

        // Schedule retry if failed and backoff has time remaining
        if (!result.success()) {
            long nextDelayMs = backOff.nextBackOffMillis();
            if (nextDelayMs != ExponentialBackOff.STOP) {
                log.debugf(
                        "Scheduling retry %d for webhook %s in %dms",
                        Integer.valueOf(attempt + 1), webhook.getId(), Long.valueOf(nextDelayMs));
                metrics.recordRetry(realmId);
                AuditLogger.retryScheduled(
                        realmId, webhook.getId(), eventType, attempt + 1, nextDelayMs / 1000.0);
                executor.schedule(
                        () ->
                                sendWithRetry(
                                        payloadJson,
                                        realmId,
                                        webhook,
                                        webhookEventId,
                                        eventType,
                                        cb,
                                        backOff,
                                        attempt + 1),
                        nextDelayMs,
                        TimeUnit.MILLISECONDS);
            } else {
                log.debugf(
                        "Max retry time exceeded for webhook %s after %d attempt(s)",
                        webhook.getId(), Integer.valueOf(attempt + 1));
                metrics.recordRetryExhausted(realmId);
                AuditLogger.retryExhausted(realmId, webhook.getId(), eventType, attempt + 1);
            }
        }
    }

    public HttpWebhookSender getHttpSender() {
        return httpSender;
    }

    public CircuitBreakerRegistry getRegistry() {
        return registry;
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
