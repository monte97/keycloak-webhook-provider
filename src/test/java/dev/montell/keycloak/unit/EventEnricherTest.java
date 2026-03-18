// src/test/java/dev/montell/keycloak/unit/EventEnricherTest.java
package dev.montell.keycloak.unit;

import dev.montell.keycloak.event.EventEnricher;
import dev.montell.keycloak.event.WebhookPayload;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.events.Event;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.events.admin.OperationType;
import org.keycloak.events.admin.ResourceType;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class EventEnricherTest {

    @Test
    void enrich_access_event_produces_correct_type_prefix() {
        Event event = new Event();
        event.setType(EventType.LOGIN);
        event.setRealmId("realm-1");
        event.setTime(1_000_000L);

        WebhookPayload.AccessEvent result = EventEnricher.enrich(event, null);

        assertEquals("access.LOGIN", result.type());
        assertEquals("realm-1", result.realmId());
        assertNotNull(result.uid());
        assertNotNull(result.occurredAt());
    }

    @Test
    void enrich_access_event_sets_userId_and_sessionId() {
        Event event = new Event();
        event.setType(EventType.LOGOUT);
        event.setRealmId("realm-1");
        event.setUserId("user-42");
        event.setSessionId("session-99");
        event.setTime(1_000_000L);

        WebhookPayload.AccessEvent result = EventEnricher.enrich(event, null);

        assertEquals("user-42",    result.userId());
        assertEquals("session-99", result.sessionId());
    }

    @Test
    void enrich_access_event_returns_empty_details_when_null() {
        Event event = new Event();
        event.setType(EventType.REGISTER);
        event.setRealmId("realm-1");
        event.setTime(1_000_000L);
        event.setDetails(null);

        WebhookPayload.AccessEvent result = EventEnricher.enrich(event, null);

        assertNotNull(result.details());
        assertTrue(result.details().isEmpty());
    }

    @Test
    void enrich_access_event_preserves_details_map() {
        Event event = new Event();
        event.setType(EventType.LOGIN);
        event.setRealmId("realm-1");
        event.setTime(1_000_000L);
        event.setDetails(Map.of("client_id", "my-client"));

        WebhookPayload.AccessEvent result = EventEnricher.enrich(event, null);

        assertEquals("my-client", result.details().get("client_id"));
    }

    @Test
    void enrich_admin_event_builds_type_string() {
        AdminEvent event = new AdminEvent();
        event.setRealmId("realm-1");
        event.setResourceType(ResourceType.USER);
        event.setOperationType(OperationType.CREATE);
        event.setResourcePath("users/abc");
        event.setTime(2_000_000L);

        WebhookPayload.AdminEvent result = EventEnricher.enrich(event, null);

        assertEquals("admin.USER-CREATE",  result.type());
        assertEquals("CREATE",             result.operationType());
        assertEquals("users/abc",          result.resourcePath());
        assertNull(result.authDetails());
        assertNull(result.representation());
    }

    @Test
    void enrich_admin_event_with_null_userId_does_not_throw() {
        AdminEvent event = new AdminEvent();
        event.setRealmId("realm-1");
        event.setResourceType(ResourceType.CLIENT);
        event.setOperationType(OperationType.UPDATE);
        event.setTime(2_000_000L);

        org.keycloak.events.admin.AuthDetails ad = new org.keycloak.events.admin.AuthDetails();
        ad.setUserId(null);
        event.setAuthDetails(ad);

        assertDoesNotThrow(() -> EventEnricher.enrich(event, null));
    }

    @Test
    void enrich_admin_event_parses_representation_json() throws Exception {
        AdminEvent event = new AdminEvent();
        event.setRealmId("realm-1");
        event.setResourceType(ResourceType.USER);
        event.setOperationType(OperationType.CREATE);
        event.setTime(2_000_000L);
        event.setRepresentation("{\"username\":\"alice\"}");

        WebhookPayload.AdminEvent result = EventEnricher.enrich(event, null);

        assertNotNull(result.representation());
        assertEquals("alice", result.representation().get("username").asText());
    }
}
