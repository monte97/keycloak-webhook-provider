package dev.montell.keycloak.unit;

import dev.montell.keycloak.resources.WebhooksResource;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakContext;
import org.keycloak.models.KeycloakUriInfo;
import org.keycloak.models.RealmModel;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.URI;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

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
        when(session.getContext()).thenReturn(context);
        when(context.getUri()).thenReturn(uriInfo);
        when(uriInfo.getBaseUri()).thenReturn(URI.create("http://localhost:8080/auth/"));

        Response response = resource.serveUi();

        assertEquals(200, response.getStatus());
        assertEquals("text/html", response.getMediaType().toString());
        String body = (String) response.getEntity();
        assertTrue(body.contains("window.__KC_REALM__ = \"test-realm\""), "Should contain realm");
        assertTrue(body.contains("window.__KC_BASE__ = \"/auth\""), "Should contain base path");
        assertTrue(body.contains("<base href=\"/auth/realms/test-realm/webhooks/ui/\">"), "Should contain base tag");
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
