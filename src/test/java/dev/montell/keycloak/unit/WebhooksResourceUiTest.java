package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import dev.montell.keycloak.resources.WebhooksResource;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.models.ClientModel;
import org.keycloak.models.KeycloakContext;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakUriInfo;
import org.keycloak.models.RealmModel;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class WebhooksResourceUiTest {

    @Mock KeycloakSession session;
    @Mock RealmModel realm;
    @Mock KeycloakContext context;
    @Mock KeycloakUriInfo uriInfo;

    WebhooksResource resource;

    @BeforeEach
    void setUp() {
        resource = new WebhooksResource(session, realm);
    }

    @Test
    void serveUi_returnsHtmlWithBaseTag() {
        when(realm.getName()).thenReturn("test-realm");
        when(realm.getClientByClientId("webhook-ui")).thenReturn(mock(ClientModel.class));
        when(session.getContext()).thenReturn(context);
        when(context.getUri()).thenReturn(uriInfo);
        when(uriInfo.getBaseUri()).thenReturn(URI.create("http://localhost:8080/auth/"));

        Response response = resource.serveUi();

        assertEquals(200, response.getStatus());
        assertEquals("text/html", response.getMediaType().toString());
        String body = (String) response.getEntity();
        assertTrue(body.contains("window.__KC_REALM__ = \"test-realm\""), "Should contain realm");
        assertTrue(body.contains("window.__KC_BASE__ = \"/auth\""), "Should contain base path");
        assertTrue(
                body.contains("<base href=\"/auth/realms/test-realm/webhooks/ui/\">"),
                "Should contain base tag");
    }

    @Test
    void serveUi_createsClientIfMissing() {
        ClientModel createdClient = mock(ClientModel.class);
        when(realm.getName()).thenReturn("test-realm");
        when(realm.getClientByClientId("webhook-ui")).thenReturn(null);
        when(realm.addClient("webhook-ui")).thenReturn(createdClient);
        when(session.getContext()).thenReturn(context);
        when(context.getUri()).thenReturn(uriInfo);
        when(uriInfo.getBaseUri()).thenReturn(URI.create("http://localhost:8080/auth/"));

        Response response = resource.serveUi();

        assertEquals(200, response.getStatus());
        verify(realm).addClient("webhook-ui");
        verify(createdClient).setPublicClient(true);
        verify(createdClient).setEnabled(true);
    }

    @Test
    void serveUiAsset_rejectsPathTraversal() {
        assertEquals(400, resource.serveUiAsset("../etc/passwd").getStatus());
        assertEquals(400, resource.serveUiAsset("../../secret").getStatus());
        assertEquals(400, resource.serveUiAsset("foo/../bar").getStatus());
    }

    @Test
    void serveUiAsset_rejectsNullByte() {
        assertEquals(400, resource.serveUiAsset("foo\0.js").getStatus());
    }

    @Test
    void serveUiAsset_returns404ForMissingFile() {
        assertEquals(404, resource.serveUiAsset("nonexistent.js").getStatus());
    }
}
