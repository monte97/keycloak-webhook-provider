// src/main/java/dev/montell/keycloak/event/EventEnricher.java
package dev.montell.keycloak.event;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.jbosslog.JBossLog;
import org.keycloak.events.Event;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.UserModel;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@JBossLog
public final class EventEnricher {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private EventEnricher() {}

    public static WebhookPayload.AccessEvent enrich(Event event, KeycloakSession session) {
        return new WebhookPayload.AccessEvent(
            UUID.randomUUID().toString(),
            "access." + event.getType().name(),
            event.getRealmId(),
            event.getUserId(),
            event.getSessionId(),
            Instant.ofEpochMilli(event.getTime()),
            event.getDetails() != null ? event.getDetails() : Map.of()
        );
    }

    public static WebhookPayload.AdminEvent enrich(AdminEvent event, KeycloakSession session) {
        AuthDetails authDetails = null;
        if (event.getAuthDetails() != null) {
            org.keycloak.events.admin.AuthDetails ad = event.getAuthDetails();
            authDetails = new AuthDetails(
                ad.getRealmId(),
                ad.getClientId(),
                ad.getUserId(),
                resolveUsername(ad.getUserId(), session),
                ad.getIpAddress()
            );
        }

        JsonNode representation = null;
        if (event.getRepresentation() != null) {
            try {
                representation = MAPPER.readTree(event.getRepresentation());
            } catch (Exception e) {
                log.warnf("Failed to parse admin event representation: %s", e.getMessage());
            }
        }

        String type = "admin." + event.getResourceType().name()
                    + "-" + event.getOperationType().name();

        return new WebhookPayload.AdminEvent(
            UUID.randomUUID().toString(),
            type,
            event.getRealmId(),
            event.getResourcePath(),
            event.getOperationType().name(),
            authDetails,
            Instant.ofEpochMilli(event.getTime()),
            representation
        );
    }

    private static String resolveUsername(String userId, KeycloakSession session) {
        if (userId == null || session == null) return null;
        try {
            UserModel user = session.users().getUserById(
                session.getContext().getRealm(), userId);
            return user != null ? user.getUsername() : null;
        } catch (Exception e) {
            log.debugf("Failed to resolve username for userId=%s: %s", userId, e.getMessage());
            return null;
        }
    }
}
