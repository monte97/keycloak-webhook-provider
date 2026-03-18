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
        try { new java.net.URI(rep.url); } catch (Exception e) {
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
        return Response.ok(java.util.Map.of("type", "secret", "value",
            w.getSecret() != null ? w.getSecret() : "")).build();
    }

    // --- PUT /{id} ---
    @PUT @Path("{id}")
    public Response updateWebhook(@PathParam("id") String id, WebhookRepresentation rep) {
        requireManageEvents();
        WebhookModel w = provider().getWebhookById(realm, id);
        if (w == null) throw new NotFoundException();
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

    private AuthenticationManager.AuthResult authResult() {
        return new AppAuthManager.BearerTokenAuthenticator(session)
            .setRealm(realm).authenticate();
    }

    // NOTE: simplified auth — both view and manage require realm admin for now.
    // Plan 3 will replace with AdminPermissionEvaluator.realm().canViewEvents() /
    // canManageEvents() to support delegated view-events / manage-events roles.
    private void requireViewEvents() {
        var auth = authResult();
        if (auth == null || !auth.getToken().getRealmAccess().isUserInRole("admin")) {
            throw new NotAuthorizedException("Bearer");
        }
    }

    private void requireManageEvents() {
        requireViewEvents();
    }
}
