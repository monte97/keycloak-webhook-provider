// src/main/java/dev/montell/keycloak/resources/WebhooksResource.java
package dev.montell.keycloak.resources;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import dev.montell.keycloak.event.WebhookPayload;
import dev.montell.keycloak.model.WebhookEventModel;
import dev.montell.keycloak.model.WebhookModel;
import dev.montell.keycloak.model.WebhookSendModel;
import dev.montell.keycloak.spi.WebhookProvider;
import io.prometheus.client.CollectorRegistry;
import io.prometheus.client.exporter.common.TextFormat;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import java.io.IOException;
import java.io.StringWriter;
import java.net.URI;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.models.ClientModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.representations.AccessToken;
import org.keycloak.services.managers.AppAuthManager;
import org.keycloak.services.managers.AuthenticationManager;
import org.keycloak.services.resources.admin.AdminAuth;
import org.keycloak.services.resources.admin.permissions.AdminPermissionEvaluator;
import org.keycloak.services.resources.admin.permissions.AdminPermissions;

/**
 * JAX-RS resource providing 18 REST endpoints for webhook management, event/send history, circuit
 * breaker control, and delivery operations. Mounted at {@code /realms/{realm}/webhooks} via {@link
 * WebhooksResourceProviderFactory}.
 *
 * <p>Authorization uses Keycloak's {@link AdminPermissionEvaluator} with lazy initialization:
 *
 * <ul>
 *   <li>{@code manage-realm} role: create, update, delete webhooks; get secret; test/resend
 *   <li>{@code view-realm} role: read webhooks, events, sends, circuit state
 * </ul>
 */
@JBossLog
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class WebhooksResource {

    private static final java.security.SecureRandom SECURE_RANDOM =
            new java.security.SecureRandom();

    private static final ObjectMapper MAPPER =
            new ObjectMapper()
                    .registerModule(new JavaTimeModule())
                    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private final KeycloakSession session;
    private final RealmModel realm;

    private AuthenticationManager.AuthResult cachedAuthResult;
    private AdminPermissionEvaluator permissions;
    private boolean authInitialized;

    public WebhooksResource(KeycloakSession session, RealmModel realm) {
        this.session = session;
        this.realm = realm;
    }

    private WebhookProvider provider() {
        return session.getProvider(WebhookProvider.class);
    }

    // --- GET / ---
    @GET
    public List<WebhookRepresentation> listWebhooks(
            @QueryParam("first") @DefaultValue("0") Integer first,
            @QueryParam("max") @DefaultValue("100") Integer max) {
        requireViewEvents();
        Instant now = Instant.now();
        List<WebhookModel> all = provider().getWebhooksStream(realm, first, max).toList();

        int rotatingCount = 0;
        for (WebhookModel w : all) {
            w.expireRotationIfDue(now);
            if (w.getSecondarySecret() != null && !w.getSecondarySecret().isBlank()) {
                rotatingCount++;
            }
        }

        var metrics = dev.montell.keycloak.dispatch.WebhookComponentHolder.metrics();
        if (metrics != null) metrics.setRotationsInProgress(realm.getId(), rotatingCount);

        return all.stream().map(WebhookRepresentation::from).toList();
    }

    // --- GET /count ---
    @GET
    @Path("count")
    public Response countWebhooks() {
        requireViewEvents();
        return Response.ok(provider().getWebhooksCount(realm)).build();
    }

    // --- POST / ---
    @POST
    public Response createWebhook(WebhookRepresentation rep, @Context UriInfo uriInfo) {
        requireManageEvents();
        if (rep.url == null || rep.url.isBlank())
            return Response.status(400).entity("url is required").build();
        try {
            java.net.URI uri = new java.net.URI(rep.url);
            if (!"http".equals(uri.getScheme()) && !"https".equals(uri.getScheme())) {
                return Response.status(400).entity("url must use http or https scheme").build();
            }
        } catch (Exception e) {
            return Response.status(400).entity("invalid url").build();
        }
        var user = authResult().getUser();
        WebhookModel w = provider().createWebhook(realm, rep.url, user);
        applyRepresentation(w, rep);
        URI location = uriInfo.getAbsolutePathBuilder().path(w.getId()).build();
        return Response.created(location).entity(WebhookRepresentation.from(w)).build();
    }

    // --- GET /{id} ---
    @GET
    @Path("{id}")
    public WebhookRepresentation getWebhook(@PathParam("id") String id) {
        requireViewEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        return WebhookRepresentation.from(w);
    }

    // --- GET /{id}/secret ---
    @GET
    @Path("{id}/secret")
    public Response getSecret(@PathParam("id") String id) {
        requireManageEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException();
        return Response.ok(java.util.Map.of("type", "secret", "configured", w.getSecret() != null))
                .build();
    }

    // --- GET /{id}/events ---
    @GET
    @Path("{id}/events")
    public Response getEvents(
            @PathParam("id") String id,
            @QueryParam("first") @DefaultValue("0") Integer first,
            @QueryParam("max") @DefaultValue("20") Integer max) {
        requireViewEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        var events =
                provider()
                        .getEventsByWebhookId(realm, id, first, max)
                        .map(this::toEventMap)
                        .toList();
        return Response.ok(events).build();
    }

    // --- GET /{id}/sends ---
    @GET
    @Path("{id}/sends")
    public Response getSends(
            @PathParam("id") String id,
            @QueryParam("first") @DefaultValue("0") Integer first,
            @QueryParam("max") @DefaultValue("20") Integer max,
            @QueryParam("success") Boolean success) {
        requireViewEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        var sends =
                provider()
                        .getSendsByWebhook(realm, id, first, max, success)
                        .map(this::toSendMap)
                        .toList();
        return Response.ok(sends).build();
    }

    // --- GET /events/{type}/{kid} ---
    @GET
    @Path("events/{type}/{kid}")
    public Response getEventByKcId(@PathParam("type") String type, @PathParam("kid") String kid) {
        requireViewEvents();
        if (!"USER".equals(type) && !"ADMIN".equals(type))
            return Response.status(400).entity("type must be USER or ADMIN").build();
        var event = provider().getEventByKcId(realm, kid);
        if (event == null) throw new NotFoundException("event not found");
        if (!event.getEventType().name().equals(type))
            throw new NotFoundException("event not found");
        return Response.ok(toEventMap(event)).build();
    }

    // --- GET /sends/{type}/{kid} ---
    @GET
    @Path("sends/{type}/{kid}")
    public Response getSendsByKcId(@PathParam("type") String type, @PathParam("kid") String kid) {
        requireViewEvents();
        if (!"USER".equals(type) && !"ADMIN".equals(type))
            return Response.status(400).entity("type must be USER or ADMIN").build();
        var event = provider().getEventByKcId(realm, kid);
        if (event == null) throw new NotFoundException("event not found");
        if (!event.getEventType().name().equals(type))
            throw new NotFoundException("event not found");
        var sends = provider().getSendsByEvent(realm, event.getId()).map(this::toSendMap).toList();
        return Response.ok(sends).build();
    }

    // --- GET /{id}/circuit ---
    @GET
    @Path("{id}/circuit")
    public Response getCircuit(@PathParam("id") String id) {
        requireViewEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        int failureThreshold = getRealmIntAttribute("_webhook.circuit.failure_threshold", 5);
        int openSeconds = getRealmIntAttribute("_webhook.circuit.open_seconds", 60);
        var body = new java.util.LinkedHashMap<String, Object>();
        body.put("state", w.getCircuitState());
        body.put("failureCount", w.getFailureCount());
        body.put(
                "lastFailureAt",
                w.getLastFailureAt() != null ? w.getLastFailureAt().toString() : null);
        body.put("failureThreshold", failureThreshold);
        body.put("openSeconds", openSeconds);
        return Response.ok(body).build();
    }

    // --- POST /{id}/rotate-secret ---
    @POST
    @Path("{id}/rotate-secret")
    public Response rotateSecret(@PathParam("id") String id, java.util.Map<String, ?> body) {
        requireManageEvents();
        if (body == null || !body.containsKey("mode")) {
            return Response.status(400).entity("mode is required").build();
        }
        String mode = String.valueOf(body.get("mode"));
        if (!"graceful".equals(mode) && !"emergency".equals(mode)) {
            return Response.status(400).entity("mode must be 'graceful' or 'emergency'").build();
        }

        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);

        int graceDays = 7;
        if ("graceful".equals(mode)) {
            if (body.get("graceDays") != null) {
                try {
                    graceDays = ((Number) body.get("graceDays")).intValue();
                } catch (ClassCastException e) {
                    return Response.status(400).entity("graceDays must be a number").build();
                }
                if (graceDays < 1 || graceDays > 30) {
                    return Response.status(400)
                            .entity("graceDays must be between 1 and 30")
                            .build();
                }
            }
            // Block double-rotation
            if (w.getSecondarySecret() != null && !w.getSecondarySecret().isBlank()) {
                var errBody = new java.util.LinkedHashMap<String, Object>();
                errBody.put("error", "rotation_in_progress");
                errBody.put(
                        "expiresAt",
                        w.getRotationExpiresAt() != null
                                ? w.getRotationExpiresAt().toString()
                                : null);
                return Response.status(409).entity(errBody).build();
            }
        }

        String newSecret = generateSecret();
        Instant now = Instant.now();

        String oldPrimary = w.getSecret();
        Instant rotationExpiresAt = null;
        if ("graceful".equals(mode)) {
            rotationExpiresAt = now.plus(java.time.Duration.ofDays(graceDays));
            w.setSecondarySecret(oldPrimary);
            w.setRotationStartedAt(now);
            w.setRotationExpiresAt(rotationExpiresAt);
        } else { // emergency
            w.setSecondarySecret(null);
            w.setRotationStartedAt(null);
            w.setRotationExpiresAt(null);
        }
        w.setSecret(newSecret);

        var metrics = dev.montell.keycloak.dispatch.WebhookComponentHolder.metrics();
        if (metrics != null) metrics.recordSecretRotation(realm.getId(), mode);
        var authResultValue = authResult();
        String userId =
                (authResultValue != null && authResultValue.getUser() != null)
                        ? authResultValue.getUser().getId()
                        : "unknown";
        dev.montell.keycloak.logging.AuditLogger.secretRotated(
                realm.getId(), id, mode, "graceful".equals(mode) ? graceDays : null, userId);

        var respBody = new java.util.LinkedHashMap<String, Object>();
        respBody.put("newSecret", newSecret);
        respBody.put(
                "rotationExpiresAt",
                rotationExpiresAt != null ? rotationExpiresAt.toString() : null);
        respBody.put("mode", mode);
        return Response.ok(respBody).build();
    }

    private static String generateSecret() {
        byte[] raw = new byte[32];
        SECURE_RANDOM.nextBytes(raw);
        return java.util.Base64.getEncoder().encodeToString(raw);
    }

    // --- POST /{id}/complete-rotation ---
    @POST
    @Path("{id}/complete-rotation")
    public Response completeRotation(@PathParam("id") String id) {
        requireManageEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);

        if (w.getSecondarySecret() == null || w.getSecondarySecret().isBlank()) {
            return Response.status(409)
                    .entity(java.util.Map.of("error", "no_rotation_in_progress"))
                    .build();
        }

        w.setSecondarySecret(null);
        w.setRotationExpiresAt(null);
        w.setRotationStartedAt(null);

        var metrics = dev.montell.keycloak.dispatch.WebhookComponentHolder.metrics();
        if (metrics != null) metrics.recordSecretRotation(realm.getId(), "completed");
        var authResultValue = authResult();
        String userId =
                (authResultValue != null && authResultValue.getUser() != null)
                        ? authResultValue.getUser().getId()
                        : "unknown";
        dev.montell.keycloak.logging.AuditLogger.rotationCompleted(realm.getId(), id, userId);

        return Response.noContent().build();
    }

    // --- POST /{id}/circuit/reset ---
    @POST
    @Path("{id}/circuit/reset")
    public Response resetCircuit(@PathParam("id") String id) {
        requireManageEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        w.setCircuitState("CLOSED");
        w.setFailureCount(0);
        w.setLastFailureAt(null);
        var registry = dev.montell.keycloak.dispatch.WebhookComponentHolder.registry();
        if (registry != null) registry.invalidate(id);
        return Response.noContent().build();
    }

    // --- POST /{id}/test ---
    @POST
    @Path("{id}/test")
    public Response testWebhook(@PathParam("id") String id) {
        requireManageEvents();
        var sender = dev.montell.keycloak.dispatch.WebhookComponentHolder.httpSender();
        if (sender == null)
            return Response.status(503).entity("Webhook sender not initialized").build();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        var testEvent =
                new WebhookPayload.AccessEvent(
                        UUID.randomUUID().toString(),
                        "test.PING",
                        realm.getId(),
                        null,
                        null,
                        Instant.now(),
                        Collections.emptyMap());
        String payload;
        try {
            payload = MAPPER.writeValueAsString(testEvent);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return Response.serverError().entity("Failed to serialize test payload").build();
        }
        var result =
                sender.send(
                        w.getUrl(),
                        payload,
                        w.getId(),
                        w.getSecret(),
                        w.getAlgorithm(),
                        w.getSecondarySecret());
        return Response.ok(
                        java.util.Map.of(
                                "httpStatus", result.httpStatus(),
                                "success", result.success(),
                                "durationMs", result.durationMs()))
                .build();
    }

    // --- POST /{id}/sends/{sid}/resend ---
    @POST
    @Path("{id}/sends/{sid}/resend")
    public Response resendSingle(
            @PathParam("id") String id,
            @PathParam("sid") String sid,
            @QueryParam("force") @DefaultValue("false") boolean force) {
        requireManageEvents();
        var sender = dev.montell.keycloak.dispatch.WebhookComponentHolder.httpSender();
        var registryHolder = dev.montell.keycloak.dispatch.WebhookComponentHolder.registry();
        if (sender == null || registryHolder == null)
            return Response.status(503).entity("Webhook components not initialized").build();

        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);

        var send = provider().getSendById(realm, sid);
        if (send == null) throw new NotFoundException("send not found: " + sid);

        // Svix-style: respect circuit breaker
        int failureThreshold = getRealmIntAttribute("_webhook.circuit.failure_threshold", 5);
        int openSeconds = getRealmIntAttribute("_webhook.circuit.open_seconds", 60);
        var cb = registryHolder.get(w, failureThreshold, openSeconds);
        if (!force && !cb.allowRequest())
            return Response.status(409)
                    .entity(
                            "Circuit breaker is OPEN — reset it via POST /{id}/circuit/reset, or retry with ?force=true")
                    .build();

        // Load original event payload
        var event = provider().getEventById(realm, send.getWebhookEventId());
        if (event == null) return Response.status(404).entity("Original event not found").build();

        // Send synchronously
        var result =
                sender.send(
                        w.getUrl(),
                        event.getEventObject(),
                        w.getId(),
                        w.getSecret(),
                        w.getAlgorithm(),
                        w.getSecondarySecret());

        // Update CB state
        if (result.success()) cb.onSuccess();
        else cb.onFailure();
        cb.applyTo(w);
        registryHolder.invalidate(id);

        // Update send record
        provider()
                .storeSend(
                        realm,
                        id,
                        send.getWebhookEventId(),
                        send.getEventType(),
                        result.httpStatus(),
                        result.success(),
                        send.getRetries() + 1);

        return Response.ok(
                        java.util.Map.of(
                                "httpStatus", result.httpStatus(),
                                "success", result.success(),
                                "durationMs", result.durationMs()))
                .build();
    }

    // --- GET /{id}/sends/{sendId}/payload ---
    @GET
    @Path("{id}/sends/{sendId}/payload")
    public Response getSendPayload(@PathParam("id") String id, @PathParam("sendId") String sendId) {
        requireManageEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException();
        WebhookSendModel send = provider().getSendById(realm, sendId);
        if (send == null) throw new NotFoundException();
        WebhookEventModel event = provider().getEventById(realm, send.getWebhookEventId());
        if (event == null) throw new NotFoundException();
        return Response.ok(java.util.Map.of("eventObject", event.getEventObject())).build();
    }

    // --- POST /{id}/resend-failed ---
    @POST
    @Path("{id}/resend-failed")
    public Response resendFailed(
            @PathParam("id") String id, @QueryParam("hours") @DefaultValue("24") int hours) {
        requireManageEvents();
        var sender = dev.montell.keycloak.dispatch.WebhookComponentHolder.httpSender();
        var registryHolder = dev.montell.keycloak.dispatch.WebhookComponentHolder.registry();
        if (sender == null || registryHolder == null)
            return Response.status(503).entity("Webhook components not initialized").build();

        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);

        int failureThreshold = getRealmIntAttribute("_webhook.circuit.failure_threshold", 5);
        int openSeconds = getRealmIntAttribute("_webhook.circuit.open_seconds", 60);
        var cb = registryHolder.get(w, failureThreshold, openSeconds);
        if (!cb.allowRequest())
            return Response.status(409).entity("Circuit breaker is OPEN — reset it first").build();

        java.time.Instant since = java.time.Instant.now().minus(java.time.Duration.ofHours(hours));
        var failedSends = provider().getFailedSendsSince(realm, id, since).toList();

        int resent = 0;
        int failed = 0;
        int skipped = 0;
        for (var send : failedSends) {
            if (!cb.allowRequest()) {
                skipped = failedSends.size() - resent - failed;
                break; // circuit breaker opened during batch
            }

            var event = provider().getEventById(realm, send.getWebhookEventId());
            if (event == null) continue;

            var result =
                    sender.send(
                            w.getUrl(),
                            event.getEventObject(),
                            w.getId(),
                            w.getSecret(),
                            w.getAlgorithm(),
                            w.getSecondarySecret());
            if (result.success()) cb.onSuccess();
            else cb.onFailure();
            cb.applyTo(w);
            registryHolder.invalidate(id);

            provider()
                    .storeSend(
                            realm,
                            id,
                            send.getWebhookEventId(),
                            send.getEventType(),
                            result.httpStatus(),
                            result.success(),
                            send.getRetries() + 1);

            if (result.success()) resent++;
            else failed++;
        }

        return Response.ok(java.util.Map.of("resent", resent, "failed", failed, "skipped", skipped))
                .build();
    }

    // --- PUT /{id} ---
    @PUT
    @Path("{id}")
    public Response updateWebhook(@PathParam("id") String id, WebhookRepresentation rep) {
        requireManageEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException();
        if (rep.url != null) {
            try {
                java.net.URI uri = new java.net.URI(rep.url);
                if (!"http".equals(uri.getScheme()) && !"https".equals(uri.getScheme())) {
                    return Response.status(400).entity("url must use http or https scheme").build();
                }
            } catch (Exception e) {
                return Response.status(400).entity("invalid url").build();
            }
        }
        applyRepresentation(w, rep);
        return Response.ok(WebhookRepresentation.from(w)).build();
    }

    // --- DELETE /{id} ---
    @DELETE
    @Path("{id}")
    public Response deleteWebhook(@PathParam("id") String id) {
        requireManageEvents();
        boolean removed = provider().removeWebhook(realm, id);
        if (!removed) throw new NotFoundException();
        return Response.noContent().build();
    }

    // --- GET /realm-settings ---
    @GET
    @Path("realm-settings")
    public Response getRealmSettings() {
        requireManageEvents();
        var settings = new java.util.LinkedHashMap<String, Object>();
        settings.put("retentionEventDays",
                getRealmIntAttribute("_webhook.retention.events.days", 30));
        settings.put("retentionSendDays",
                getRealmIntAttribute("_webhook.retention.sends.days", 90));
        settings.put("circuitFailureThreshold",
                getRealmIntAttribute("_webhook.circuit.failure_threshold", 5));
        settings.put("circuitOpenSeconds",
                getRealmIntAttribute("_webhook.circuit.open_seconds", 60));
        return Response.ok(settings).build();
    }

    // --- PUT /realm-settings ---
    @PUT
    @Path("realm-settings")
    public Response updateRealmSettings(java.util.Map<String, ?> body) {
        requireManageEvents();
        if (body == null) body = java.util.Collections.emptyMap();

        String[] fields = {
            "retentionEventDays", "retentionSendDays",
            "circuitFailureThreshold", "circuitOpenSeconds"
        };
        String[] attrs = {
            "_webhook.retention.events.days", "_webhook.retention.sends.days",
            "_webhook.circuit.failure_threshold", "_webhook.circuit.open_seconds"
        };

        for (int i = 0; i < fields.length; i++) {
            Object val = body.get(fields[i]);
            if (val == null) continue;
            int v;
            try {
                v = ((Number) val).intValue();
            } catch (ClassCastException e) {
                return Response.status(400)
                        .entity(fields[i] + " must be a positive integer")
                        .build();
            }
            if (v <= 0) {
                return Response.status(400)
                        .entity(fields[i] + " must be a positive integer")
                        .build();
            }
            realm.setAttribute(attrs[i], String.valueOf(v));
        }

        var updated = new java.util.LinkedHashMap<String, Object>();
        updated.put("retentionEventDays",
                getRealmIntAttribute("_webhook.retention.events.days", 30));
        updated.put("retentionSendDays",
                getRealmIntAttribute("_webhook.retention.sends.days", 90));
        updated.put("circuitFailureThreshold",
                getRealmIntAttribute("_webhook.circuit.failure_threshold", 5));
        updated.put("circuitOpenSeconds",
                getRealmIntAttribute("_webhook.circuit.open_seconds", 60));
        return Response.ok(updated).build();
    }

    // --- GET /metrics ---

    /** Prometheus metrics endpoint. Returns all webhook metrics across all realms. */
    @GET
    @Path("metrics")
    @Produces("text/plain; version=0.0.4; charset=utf-8")
    public Response metrics() {
        requireViewEvents();
        StringWriter writer = new StringWriter();
        try {
            TextFormat.write004(writer, CollectorRegistry.defaultRegistry.metricFamilySamples());
        } catch (IOException e) {
            return Response.serverError().build();
        }
        return Response.ok(writer.toString()).build();
    }

    // --- UI static file serving ---

    private static final String UI_CLIENT_ID = "webhook-ui";

    private void ensureUiClient() {
        if (realm.getClientByClientId(UI_CLIENT_ID) != null) return;
        var client = realm.addClient(UI_CLIENT_ID);
        client.setProtocol("openid-connect");
        client.setPublicClient(true);
        client.setDirectAccessGrantsEnabled(true);
        client.setRedirectUris(java.util.Set.of("*"));
        client.setWebOrigins(java.util.Set.of("+"));
        client.setFullScopeAllowed(true);
        client.setEnabled(true);
        log.infof("Auto-created '%s' OIDC client in realm '%s'", UI_CLIENT_ID, realm.getName());
    }

    @GET
    @Path("ui")
    @Produces("text/html")
    public Response serveUi() {
        ensureUiClient();
        try (var is = getClass().getClassLoader().getResourceAsStream("webhook-ui/index.html")) {
            if (is == null) return Response.status(404).entity("UI not found").build();
            String html = new String(is.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            String basePath = session.getContext().getUri().getBaseUri().getPath();
            if (basePath.endsWith("/")) basePath = basePath.substring(0, basePath.length() - 1);
            // Inject <base> so relative asset paths (./assets/) resolve to ui/assets/
            String uiBase = basePath + "/realms/" + realm.getName() + "/webhooks/ui/";
            html = html.replace("<head>", "<head><base href=\"" + uiBase + "\">");
            html = html.replace("{{REALM}}", realm.getName()).replace("{{BASE_PATH}}", basePath);
            return Response.ok(html).type("text/html").header("Cache-Control", "no-cache").build();
        } catch (java.io.IOException e) {
            return Response.serverError().entity("Failed to read UI").build();
        }
    }

    @GET
    @Path("ui/{path: .+}")
    @Produces({
        "application/javascript",
        "text/css",
        "text/html",
        "image/svg+xml",
        "font/woff2",
        "application/json",
        "application/octet-stream"
    })
    public Response serveUiAsset(@PathParam("path") String path) {
        if (path.contains("..") || path.contains("\0")) {
            return Response.status(400).entity("Invalid path").build();
        }
        try (var is = getClass().getClassLoader().getResourceAsStream("webhook-ui/" + path)) {
            if (is == null) return Response.status(404).entity("Not found").build();
            byte[] bytes = is.readAllBytes();
            String contentType = guessContentType(path);
            String cacheControl =
                    path.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
            return Response.ok(bytes)
                    .type(contentType)
                    .header("Cache-Control", cacheControl)
                    .build();
        } catch (java.io.IOException e) {
            return Response.serverError().entity("Failed to read asset").build();
        }
    }

    private String guessContentType(String path) {
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        return "application/octet-stream";
    }

    // --- mapping helpers ---
    private java.util.Map<String, Object> toEventMap(WebhookEventModel e) {
        var m = new java.util.LinkedHashMap<String, Object>();
        m.put("id", e.getId());
        m.put("realmId", e.getRealmId());
        m.put("eventType", e.getEventType().name());
        m.put("kcEventId", e.getKcEventId());
        m.put("eventObject", e.getEventObject());
        m.put("createdAt", e.getCreatedAt().toString());
        return m;
    }

    private java.util.Map<String, Object> toSendMap(WebhookSendModel s) {
        var m = new java.util.LinkedHashMap<String, Object>();
        m.put("id", s.getId());
        m.put("webhookId", s.getWebhookId());
        m.put("webhookEventId", s.getWebhookEventId());
        m.put("eventType", s.getEventType());
        m.put("httpStatus", s.getHttpStatus());
        m.put("success", s.isSuccess());
        m.put("retries", s.getRetries());
        m.put("sentAt", s.getSentAt().toString());
        m.put("lastAttemptAt", s.getLastAttemptAt().toString());
        return m;
    }

    // --- helpers ---
    private void applyRepresentation(WebhookModel w, WebhookRepresentation rep) {
        if (rep.url != null) w.setUrl(rep.url);
        if (rep.secret != null) w.setSecret(rep.secret);
        if (rep.algorithm != null) w.setAlgorithm(rep.algorithm);
        if (rep.enabled != null) w.setEnabled(rep.enabled);
        if (rep.eventTypes != null) w.setEventTypes(rep.eventTypes);
        if (rep.retryMaxElapsedSeconds != null)
            w.setRetryMaxElapsedSeconds(rep.retryMaxElapsedSeconds);
        if (rep.retryMaxIntervalSeconds != null)
            w.setRetryMaxIntervalSeconds(rep.retryMaxIntervalSeconds);
    }

    private int getRealmIntAttribute(String key, int defaultValue) {
        String val = realm.getAttribute(key);
        if (val == null) return defaultValue;
        try {
            return Integer.parseInt(val);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    protected AuthenticationManager.AuthResult authResult() {
        initAuth();
        return cachedAuthResult;
    }

    private void initAuth() {
        if (authInitialized) return;
        cachedAuthResult =
                new AppAuthManager.BearerTokenAuthenticator(session).setRealm(realm).authenticate();
        if (cachedAuthResult == null) {
            throw new NotAuthorizedException("Bearer");
        }
        AccessToken token = cachedAuthResult.getToken();
        ClientModel client = realm.getClientByClientId(token.getIssuedFor());
        if (client == null) {
            throw new NotFoundException("Could not find client for authorization");
        }
        AdminAuth adminAuth = new AdminAuth(realm, token, cachedAuthResult.getUser(), client);
        permissions = AdminPermissions.evaluator(session, realm, adminAuth);
        authInitialized = true;
    }

    protected void requireViewEvents() {
        initAuth();
        permissions.realm().requireViewEvents();
    }

    protected void requireManageEvents() {
        initAuth();
        permissions.realm().requireManageEvents();
    }
}
