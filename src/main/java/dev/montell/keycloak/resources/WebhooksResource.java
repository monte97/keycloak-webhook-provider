// src/main/java/dev/montell/keycloak/resources/WebhooksResource.java
package dev.montell.keycloak.resources;

import dev.montell.keycloak.model.WebhookModel;
import dev.montell.keycloak.spi.WebhookProvider;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import java.net.URI;
import java.util.List;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.services.managers.AppAuthManager;
import org.keycloak.services.managers.AuthenticationManager;

@JBossLog
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class WebhooksResource {

    private final KeycloakSession session;
    private final RealmModel      realm;

    public WebhooksResource(KeycloakSession session, RealmModel realm) {
        this.session = session;
        this.realm   = realm;
    }

    private WebhookProvider provider() {
        return session.getProvider(WebhookProvider.class);
    }

    // --- GET / ---
    @GET
    public List<WebhookRepresentation> listWebhooks(
            @QueryParam("first") @DefaultValue("0")   Integer first,
            @QueryParam("max")   @DefaultValue("100") Integer max) {
        requireViewEvents();
        return provider().getWebhooksStream(realm, first, max)
            .map(WebhookRepresentation::from)
            .toList();
    }

    // --- GET /count ---
    @GET @Path("count")
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
        var user   = authResult().getUser();
        WebhookModel w = provider().createWebhook(realm, rep.url, user);
        applyRepresentation(w, rep);
        URI location = uriInfo.getAbsolutePathBuilder().path(w.getId()).build();
        return Response.created(location).entity(WebhookRepresentation.from(w)).build();
    }

    // --- GET /{id} ---
    @GET @Path("{id}")
    public WebhookRepresentation getWebhook(@PathParam("id") String id) {
        requireViewEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        return WebhookRepresentation.from(w);
    }

    // --- GET /{id}/secret ---
    @GET @Path("{id}/secret")
    public Response getSecret(@PathParam("id") String id) {
        requireManageEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException();
        return Response.ok(java.util.Map.of(
            "type", "secret",
            "configured", w.getSecret() != null
        )).build();
    }

    // --- GET /{id}/events ---
    @GET @Path("{id}/events")
    public Response getEvents(@PathParam("id") String id,
            @QueryParam("first") @DefaultValue("0")  Integer first,
            @QueryParam("max")   @DefaultValue("20") Integer max) {
        requireViewEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        var events = provider().getEventsByWebhookId(realm, id, first, max)
            .map(e -> {
                var m = new java.util.LinkedHashMap<String, Object>();
                m.put("id", e.getId());
                m.put("realmId", e.getRealmId());
                m.put("eventType", e.getEventType().name());
                m.put("kcEventId", e.getKcEventId());
                m.put("eventObject", e.getEventObject());
                m.put("createdAt", e.getCreatedAt().toString());
                return m;
            })
            .toList();
        return Response.ok(events).build();
    }

    // --- GET /{id}/sends ---
    @GET @Path("{id}/sends")
    public Response getSends(@PathParam("id") String id,
            @QueryParam("first")   @DefaultValue("0")  Integer first,
            @QueryParam("max")     @DefaultValue("20") Integer max,
            @QueryParam("success") Boolean success) {
        requireViewEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        var sends = provider().getSendsByWebhook(realm, id, first, max, success)
            .map(s -> {
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
            })
            .toList();
        return Response.ok(sends).build();
    }

    // --- GET /{id}/circuit ---
    @GET @Path("{id}/circuit")
    public Response getCircuit(@PathParam("id") String id) {
        requireViewEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        int failureThreshold = getRealmIntAttribute("_webhook.circuit.failure_threshold", 5);
        int openSeconds      = getRealmIntAttribute("_webhook.circuit.open_seconds", 60);
        var body = new java.util.LinkedHashMap<String, Object>();
        body.put("state", w.getCircuitState());
        body.put("failureCount", w.getFailureCount());
        body.put("lastFailureAt", w.getLastFailureAt() != null ? w.getLastFailureAt().toString() : null);
        body.put("failureThreshold", failureThreshold);
        body.put("openSeconds", openSeconds);
        return Response.ok(body).build();
    }

    // --- POST /{id}/circuit/reset ---
    @POST @Path("{id}/circuit/reset")
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
    @POST @Path("{id}/test")
    public Response testWebhook(@PathParam("id") String id) {
        requireManageEvents();
        var sender = dev.montell.keycloak.dispatch.WebhookComponentHolder.httpSender();
        if (sender == null)
            return Response.status(503).entity("Webhook sender not initialized").build();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);
        String payload = "{\"type\":\"test.PING\",\"uid\":\"" + java.util.UUID.randomUUID()
            + "\",\"realmId\":\"" + realm.getId()
            + "\",\"occurredAt\":\"" + java.time.Instant.now() + "\"}";
        var result = sender.send(w.getUrl(), payload, w.getId(), w.getSecret(), w.getAlgorithm());
        return Response.ok(java.util.Map.of(
            "httpStatus", result.httpStatus(),
            "success", result.success(),
            "durationMs", result.durationMs()
        )).build();
    }

    // --- POST /{id}/sends/{sid}/resend ---
    @POST @Path("{id}/sends/{sid}/resend")
    public Response resendSingle(@PathParam("id") String id, @PathParam("sid") String sid) {
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
        int openSeconds      = getRealmIntAttribute("_webhook.circuit.open_seconds", 60);
        var cb = registryHolder.get(w, failureThreshold, openSeconds);
        if (!cb.allowRequest())
            return Response.status(409).entity("Circuit breaker is OPEN — reset it first via POST /{id}/circuit/reset").build();

        // Load original event payload
        var event = provider().getEventById(realm, send.getWebhookEventId());
        if (event == null)
            return Response.status(404).entity("Original event not found").build();

        // Send synchronously
        var result = sender.send(w.getUrl(), event.getEventObject(), w.getId(), w.getSecret(), w.getAlgorithm());

        // Update CB state
        if (result.success()) cb.onSuccess();
        else                  cb.onFailure();
        cb.applyTo(w);
        registryHolder.invalidate(id);

        // Update send record
        provider().storeSend(realm, id, send.getWebhookEventId(),
            send.getEventType(), result.httpStatus(), result.success(), send.getRetries() + 1);

        return Response.ok(java.util.Map.of(
            "httpStatus", result.httpStatus(),
            "success", result.success(),
            "durationMs", result.durationMs()
        )).build();
    }

    // --- POST /{id}/resend-failed ---
    @POST @Path("{id}/resend-failed")
    public Response resendFailed(@PathParam("id") String id,
            @QueryParam("hours") @DefaultValue("24") int hours) {
        requireManageEvents();
        var sender = dev.montell.keycloak.dispatch.WebhookComponentHolder.httpSender();
        var registryHolder = dev.montell.keycloak.dispatch.WebhookComponentHolder.registry();
        if (sender == null || registryHolder == null)
            return Response.status(503).entity("Webhook components not initialized").build();

        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException("webhook not found: " + id);

        int failureThreshold = getRealmIntAttribute("_webhook.circuit.failure_threshold", 5);
        int openSeconds      = getRealmIntAttribute("_webhook.circuit.open_seconds", 60);
        var cb = registryHolder.get(w, failureThreshold, openSeconds);
        if (!cb.allowRequest())
            return Response.status(409).entity("Circuit breaker is OPEN — reset it first").build();

        java.time.Instant since = java.time.Instant.now().minus(java.time.Duration.ofHours(hours));
        var failedSends = provider().getFailedSendsSince(realm, id, since).toList();

        int resent = 0;
        int failed = 0;
        for (var send : failedSends) {
            var event = provider().getEventById(realm, send.getWebhookEventId());
            if (event == null) continue;

            var result = sender.send(w.getUrl(), event.getEventObject(), w.getId(), w.getSecret(), w.getAlgorithm());
            if (result.success()) cb.onSuccess();
            else                  cb.onFailure();
            cb.applyTo(w);
            registryHolder.invalidate(id);

            provider().storeSend(realm, id, send.getWebhookEventId(),
                send.getEventType(), result.httpStatus(), result.success(), send.getRetries() + 1);

            if (result.success()) {
                resent++;
            } else {
                failed++;
                break; // stop on first failure
            }
        }

        return Response.ok(java.util.Map.of("resent", resent, "failed", failed)).build();
    }

    // --- PUT /{id} ---
    @PUT @Path("{id}")
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
    @DELETE @Path("{id}")
    public Response deleteWebhook(@PathParam("id") String id) {
        requireManageEvents();
        boolean removed = provider().removeWebhook(realm, id);
        if (!removed) throw new NotFoundException();
        return Response.noContent().build();
    }

    // --- helpers ---
    private void applyRepresentation(WebhookModel w, WebhookRepresentation rep) {
        if (rep.url        != null)  w.setUrl(rep.url);
        if (rep.secret     != null)  w.setSecret(rep.secret);
        if (rep.algorithm  != null)  w.setAlgorithm(rep.algorithm);
        if (rep.enabled    != null)  w.setEnabled(rep.enabled);
        if (rep.eventTypes != null)  w.setEventTypes(rep.eventTypes);
        if (rep.retryMaxElapsedSeconds  != null) w.setRetryMaxElapsedSeconds(rep.retryMaxElapsedSeconds);
        if (rep.retryMaxIntervalSeconds != null) w.setRetryMaxIntervalSeconds(rep.retryMaxIntervalSeconds);
    }

    private int getRealmIntAttribute(String key, int defaultValue) {
        String val = realm.getAttribute(key);
        if (val == null) return defaultValue;
        try { return Integer.parseInt(val); } catch (NumberFormatException e) { return defaultValue; }
    }

    protected AuthenticationManager.AuthResult authResult() {
        return new AppAuthManager.BearerTokenAuthenticator(session)
            .setRealm(realm).authenticate();
    }

    // NOTE: simplified auth — both view and manage require realm admin for now.
    // Plan 3 will replace with AdminPermissionEvaluator.realm().canViewEvents() /
    // canManageEvents() to support delegated view-events / manage-events roles.
    protected void requireViewEvents() {
        var auth = authResult();
        if (auth == null
                || auth.getToken().getRealmAccess() == null
                || !auth.getToken().getRealmAccess().isUserInRole("admin")) {
            throw new NotAuthorizedException("Bearer");
        }
    }

    protected void requireManageEvents() {
        requireViewEvents();
    }
}
