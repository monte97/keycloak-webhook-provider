// src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java
package dev.montell.keycloak.unit;

import dev.montell.keycloak.dispatch.CircuitBreaker;
import dev.montell.keycloak.dispatch.CircuitBreakerRegistry;
import dev.montell.keycloak.dispatch.WebhookComponentHolder;
import dev.montell.keycloak.model.KeycloakEventType;
import dev.montell.keycloak.model.WebhookEventModel;
import dev.montell.keycloak.model.WebhookModel;
import dev.montell.keycloak.model.WebhookSendModel;
import dev.montell.keycloak.resources.WebhooksResource;
import dev.montell.keycloak.sender.HttpSendResult;
import dev.montell.keycloak.sender.HttpWebhookSender;
import dev.montell.keycloak.spi.WebhookProvider;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.services.managers.AuthenticationManager;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WebhooksResourceTest {

    // --- SUT subclass that bypasses auth ---
    static class NoAuthWebhooksResource extends WebhooksResource {
        NoAuthWebhooksResource(KeycloakSession session, RealmModel realm) {
            super(session, realm);
        }

        @Override
        protected void requireViewEvents() { /* no-op */ }

        @Override
        protected void requireManageEvents() { /* no-op */ }

        @Override
        protected AuthenticationManager.AuthResult authResult() { return null; }
    }

    @Mock KeycloakSession session;
    @Mock RealmModel realm;
    @Mock WebhookProvider provider;
    @Mock HttpWebhookSender sender;
    @Mock CircuitBreakerRegistry registry;

    WebhooksResource resource;

    @BeforeEach
    void setUp() {
        WebhookComponentHolder.init(sender, registry);
        when(session.getProvider(WebhookProvider.class)).thenReturn(provider);
        when(realm.getId()).thenReturn("test-realm");
        when(realm.getAttribute("_webhook.circuit.failure_threshold")).thenReturn(null);
        when(realm.getAttribute("_webhook.circuit.open_seconds")).thenReturn(null);
        resource = new NoAuthWebhooksResource(session, realm);
    }

    // -----------------------------------------------------------------------
    // Helper factories
    // -----------------------------------------------------------------------

    private WebhookModel mockWebhook(String id) {
        WebhookModel w = mock(WebhookModel.class);
        when(w.getId()).thenReturn(id);
        when(w.getUrl()).thenReturn("https://example.com/hook");
        when(w.getSecret()).thenReturn(null);
        when(w.getAlgorithm()).thenReturn(null);
        when(w.getCircuitState()).thenReturn(CircuitBreaker.CLOSED);
        when(w.getFailureCount()).thenReturn(0);
        when(w.getLastFailureAt()).thenReturn(null);
        return w;
    }

    private WebhookEventModel mockEvent(String id, String webhookId) {
        WebhookEventModel e = mock(WebhookEventModel.class);
        when(e.getId()).thenReturn(id);
        when(e.getRealmId()).thenReturn("test-realm");
        when(e.getEventType()).thenReturn(KeycloakEventType.USER);
        when(e.getKcEventId()).thenReturn("kc-" + id);
        when(e.getEventObject()).thenReturn("{\"type\":\"access.LOGIN\"}");
        when(e.getCreatedAt()).thenReturn(Instant.parse("2024-01-01T00:00:00Z"));
        return e;
    }

    private WebhookSendModel mockSend(String id, String webhookId, String eventId) {
        WebhookSendModel s = mock(WebhookSendModel.class);
        when(s.getId()).thenReturn(id);
        when(s.getWebhookId()).thenReturn(webhookId);
        when(s.getWebhookEventId()).thenReturn(eventId);
        when(s.getEventType()).thenReturn("access.LOGIN");
        when(s.getHttpStatus()).thenReturn(200);
        when(s.isSuccess()).thenReturn(true);
        when(s.getRetries()).thenReturn(0);
        when(s.getSentAt()).thenReturn(Instant.parse("2024-01-01T00:00:00Z"));
        when(s.getLastAttemptAt()).thenReturn(Instant.parse("2024-01-01T00:00:00Z"));
        return s;
    }

    // -----------------------------------------------------------------------
    // GET /{id}/events
    // -----------------------------------------------------------------------

    @Test
    void getEvents_returns_list() {
        WebhookModel w = mockWebhook("wh-1");
        WebhookEventModel e = mockEvent("ev-1", "wh-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
        when(provider.getEventsByWebhookId(realm, "wh-1", 0, 20)).thenReturn(Stream.of(e));

        Response resp = resource.getEvents("wh-1", 0, 20);

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> body = (List<Map<String, Object>>) resp.getEntity();
        assertEquals(1, body.size());
        assertEquals("ev-1", body.get(0).get("id"));
    }

    @Test
    void getEvents_404_when_not_found() {
        when(provider.getWebhookById(realm, "missing")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.getEvents("missing", 0, 20));
    }

    // -----------------------------------------------------------------------
    // GET /{id}/sends
    // -----------------------------------------------------------------------

    @Test
    void getSends_returns_filtered() {
        WebhookModel w = mockWebhook("wh-1");
        WebhookSendModel s = mockSend("send-1", "wh-1", "ev-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
        when(provider.getSendsByWebhook(realm, "wh-1", 0, 20, null)).thenReturn(Stream.of(s));

        Response resp = resource.getSends("wh-1", 0, 20, null);

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> body = (List<Map<String, Object>>) resp.getEntity();
        assertEquals(1, body.size());
        assertEquals("send-1", body.get(0).get("id"));
    }

    @Test
    void getSends_404_when_not_found() {
        when(provider.getWebhookById(realm, "missing")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.getSends("missing", 0, 20, null));
    }

    // -----------------------------------------------------------------------
    // GET /{id}/circuit
    // -----------------------------------------------------------------------

    @Test
    void getCircuit_returns_state_with_defaults() {
        WebhookModel w = mockWebhook("wh-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);

        Response resp = resource.getCircuit("wh-1");

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) resp.getEntity();
        assertEquals(CircuitBreaker.CLOSED, body.get("state"));
        assertEquals(0, body.get("failureCount"));
        assertEquals(5, body.get("failureThreshold"));
        assertEquals(60, body.get("openSeconds"));
    }

    @Test
    void getCircuit_404_when_not_found() {
        when(provider.getWebhookById(realm, "missing")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.getCircuit("missing"));
    }

    // -----------------------------------------------------------------------
    // POST /{id}/circuit/reset
    // -----------------------------------------------------------------------

    @Test
    void resetCircuit_sets_closed() {
        WebhookModel w = mockWebhook("wh-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);

        Response resp = resource.resetCircuit("wh-1");

        assertEquals(204, resp.getStatus());
        verify(w).setCircuitState("CLOSED");
        verify(w).setFailureCount(0);
        verify(w).setLastFailureAt(null);
        verify(registry).invalidate("wh-1");
    }

    @Test
    void resetCircuit_404_when_not_found() {
        when(provider.getWebhookById(realm, "missing")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.resetCircuit("missing"));
    }

    // -----------------------------------------------------------------------
    // POST /{id}/test
    // -----------------------------------------------------------------------

    @Test
    void test_sends_ping() {
        WebhookModel w = mockWebhook("wh-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
        var payloadCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        when(sender.send(anyString(), payloadCaptor.capture(), eq("wh-1"), isNull(), isNull()))
            .thenReturn(new HttpSendResult(200, true, 42L));

        Response resp = resource.testWebhook("wh-1");

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) resp.getEntity();
        assertEquals(200, body.get("httpStatus"));
        assertEquals(true, body.get("success"));
        assertEquals(42L, body.get("durationMs"));

        // Verify payload is valid JSON with AccessEvent structure
        String payload = payloadCaptor.getValue();
        assertDoesNotThrow(() -> {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper()
                .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());
            var node = mapper.readTree(payload);
            assertEquals("test.PING", node.get("type").asText());
            assertEquals("test-realm", node.get("realmId").asText());
            assertNotNull(node.get("uid"));
            assertNotNull(node.get("occurredAt"));
        });
    }

    @Test
    void test_404_when_not_found() {
        when(provider.getWebhookById(realm, "missing")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.testWebhook("missing"));
    }

    @Test
    void test_503_when_sender_null() {
        WebhookComponentHolder.init(null, registry);
        // Re-create resource so it picks up the reset holder
        resource = new NoAuthWebhooksResource(session, realm);

        Response resp = resource.testWebhook("wh-1");

        assertEquals(503, resp.getStatus());
    }

    // -----------------------------------------------------------------------
    // POST /{id}/sends/{sid}/resend
    // -----------------------------------------------------------------------

    @Test
    void resend_single_success() {
        WebhookModel w = mockWebhook("wh-1");
        WebhookSendModel s = mockSend("send-1", "wh-1", "ev-1");
        WebhookEventModel e = mockEvent("ev-1", "wh-1");

        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
        when(provider.getSendById(realm, "send-1")).thenReturn(s);
        when(provider.getEventById(realm, "ev-1")).thenReturn(e);

        // Use a real registry with CLOSED state
        CircuitBreakerRegistry realRegistry = new CircuitBreakerRegistry(5, 60);
        WebhookComponentHolder.init(sender, realRegistry);

        when(sender.send(anyString(), anyString(), anyString(), any(), any()))
            .thenReturn(new HttpSendResult(200, true, 10L));

        Response resp = resource.resendSingle("wh-1", "send-1");

        assertEquals(200, resp.getStatus());
        // storeSend called with retries+1 = 0+1 = 1
        verify(provider).storeSend(realm, "wh-1", "ev-1", "access.LOGIN", 200, true, 1);
    }

    @Test
    void resend_single_404_webhook() {
        when(provider.getWebhookById(realm, "missing")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.resendSingle("missing", "send-1"));
    }

    @Test
    void resend_single_404_send() {
        WebhookModel w = mockWebhook("wh-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
        when(provider.getSendById(realm, "missing-send")).thenReturn(null);

        assertThrows(NotFoundException.class, () -> resource.resendSingle("wh-1", "missing-send"));
    }

    @Test
    void resend_single_409_circuit_open() {
        // threshold=1 → one onFailure() opens circuit
        CircuitBreakerRegistry realRegistry = new CircuitBreakerRegistry(1, 60);
        WebhookComponentHolder.init(sender, realRegistry);

        WebhookModel w = mockWebhook("wh-1");
        // Simulate already-open circuit by setting state and lastFailureAt in the future
        when(w.getCircuitState()).thenReturn(CircuitBreaker.OPEN);
        when(w.getFailureCount()).thenReturn(1);
        when(w.getLastFailureAt()).thenReturn(Instant.now()); // just failed → still open

        WebhookSendModel s = mockSend("send-1", "wh-1", "ev-1");

        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
        when(provider.getSendById(realm, "send-1")).thenReturn(s);

        Response resp = resource.resendSingle("wh-1", "send-1");

        assertEquals(409, resp.getStatus());
    }

    // -----------------------------------------------------------------------
    // POST /{id}/resend-failed
    // -----------------------------------------------------------------------

    @Test
    void resend_bulk_success() {
        CircuitBreakerRegistry realRegistry = new CircuitBreakerRegistry(5, 60);
        WebhookComponentHolder.init(sender, realRegistry);

        WebhookModel w = mockWebhook("wh-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);

        WebhookSendModel s1 = mockSend("send-1", "wh-1", "ev-1");
        WebhookSendModel s2 = mockSend("send-2", "wh-1", "ev-2");
        when(s1.isSuccess()).thenReturn(false);
        when(s2.isSuccess()).thenReturn(false);

        WebhookEventModel e1 = mockEvent("ev-1", "wh-1");
        WebhookEventModel e2 = mockEvent("ev-2", "wh-1");

        when(provider.getFailedSendsSince(eq(realm), eq("wh-1"), any(Instant.class)))
            .thenReturn(Stream.of(s1, s2));
        when(provider.getEventById(realm, "ev-1")).thenReturn(e1);
        when(provider.getEventById(realm, "ev-2")).thenReturn(e2);

        when(sender.send(anyString(), anyString(), anyString(), any(), any()))
            .thenReturn(new HttpSendResult(200, true, 5L));

        Response resp = resource.resendFailed("wh-1", 24);

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) resp.getEntity();
        assertEquals(2, body.get("resent"));
        assertEquals(0, body.get("failed"));
    }

    @Test
    void resend_bulk_409_circuit_open() {
        CircuitBreakerRegistry realRegistry = new CircuitBreakerRegistry(1, 60);
        WebhookComponentHolder.init(sender, realRegistry);

        WebhookModel w = mockWebhook("wh-1");
        when(w.getCircuitState()).thenReturn(CircuitBreaker.OPEN);
        when(w.getFailureCount()).thenReturn(1);
        when(w.getLastFailureAt()).thenReturn(Instant.now());

        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);

        Response resp = resource.resendFailed("wh-1", 24);

        assertEquals(409, resp.getStatus());
    }

    // -----------------------------------------------------------------------
    // GET /events/{type}/{kid}
    // -----------------------------------------------------------------------

    @Test
    void getEventByKcId_returns_event() {
        WebhookEventModel e = mockEvent("ev-1", "wh-1");
        when(e.getKcEventId()).thenReturn("kc-123");
        when(provider.getEventByKcId(realm, "kc-123")).thenReturn(e);

        Response resp = resource.getEventByKcId("USER", "kc-123");

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) resp.getEntity();
        assertEquals("ev-1", body.get("id"));
        assertEquals("USER", body.get("eventType"));
    }

    @Test
    void getEventByKcId_404_when_not_found() {
        when(provider.getEventByKcId(realm, "missing")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.getEventByKcId("USER", "missing"));
    }

    @Test
    void getEventByKcId_404_when_type_mismatch() {
        WebhookEventModel e = mockEvent("ev-1", "wh-1");
        when(provider.getEventByKcId(realm, "kc-ev-1")).thenReturn(e);
        // mockEvent sets eventType to USER, requesting ADMIN should 404
        assertThrows(NotFoundException.class, () -> resource.getEventByKcId("ADMIN", "kc-ev-1"));
    }

    @Test
    void getEventByKcId_400_invalid_type() {
        Response resp = resource.getEventByKcId("INVALID", "kc-123");
        assertEquals(400, resp.getStatus());
    }

    // -----------------------------------------------------------------------
    // GET /sends/{type}/{kid}
    // -----------------------------------------------------------------------

    @Test
    void getSendsByKcId_returns_sends() {
        WebhookEventModel e = mockEvent("ev-1", "wh-1");
        WebhookSendModel s = mockSend("send-1", "wh-1", "ev-1");
        when(e.getKcEventId()).thenReturn("kc-123");
        when(provider.getEventByKcId(realm, "kc-123")).thenReturn(e);
        when(provider.getSendsByEvent(realm, "ev-1")).thenReturn(Stream.of(s));

        Response resp = resource.getSendsByKcId("USER", "kc-123");

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> body = (List<Map<String, Object>>) resp.getEntity();
        assertEquals(1, body.size());
        assertEquals("send-1", body.get(0).get("id"));
    }

    @Test
    void getSendsByKcId_404_when_event_not_found() {
        when(provider.getEventByKcId(realm, "missing")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.getSendsByKcId("USER", "missing"));
    }

    @Test
    void getSendsByKcId_404_when_type_mismatch() {
        WebhookEventModel e = mockEvent("ev-1", "wh-1");
        when(provider.getEventByKcId(realm, "kc-ev-1")).thenReturn(e);
        assertThrows(NotFoundException.class, () -> resource.getSendsByKcId("ADMIN", "kc-ev-1"));
    }

    @Test
    void getSendsByKcId_400_invalid_type() {
        Response resp = resource.getSendsByKcId("UNKNOWN", "kc-123");
        assertEquals(400, resp.getStatus());
    }

    // -----------------------------------------------------------------------
    // POST /{id}/resend-failed (bulk)
    // -----------------------------------------------------------------------

    @Test
    void resend_bulk_stops_on_first_failure() {
        CircuitBreakerRegistry realRegistry = new CircuitBreakerRegistry(5, 60);
        WebhookComponentHolder.init(sender, realRegistry);

        WebhookModel w = mockWebhook("wh-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);

        WebhookSendModel s1 = mockSend("send-1", "wh-1", "ev-1");
        WebhookSendModel s2 = mockSend("send-2", "wh-1", "ev-2");

        WebhookEventModel e1 = mockEvent("ev-1", "wh-1");

        when(provider.getFailedSendsSince(eq(realm), eq("wh-1"), any(Instant.class)))
            .thenReturn(Stream.of(s1, s2));
        when(provider.getEventById(realm, "ev-1")).thenReturn(e1);

        when(sender.send(anyString(), anyString(), anyString(), any(), any()))
            .thenReturn(new HttpSendResult(500, false, 5L));

        Response resp = resource.resendFailed("wh-1", 24);

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) resp.getEntity();
        assertEquals(0, body.get("resent"));
        assertEquals(1, body.get("failed"));
        // second event should never be loaded
        verify(provider, never()).getEventById(realm, "ev-2");
    }
}
