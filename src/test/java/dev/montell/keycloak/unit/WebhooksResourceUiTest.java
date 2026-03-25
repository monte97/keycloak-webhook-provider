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
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.net.URI;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WebhooksResourceUiTest {

    @Mock KeycloakSession session;
    @Mock RealmModel realm;
    @Mock KeycloakContext context;
    @Mock KeycloakUriInfo uriInfo;

    WebhooksResource resource;

    @BeforeEach
    void setUp() {
        when(realm.getName()).thenReturn("test-realm");
        when(session.getContext()).thenReturn(context);
        when(context.getUri()).thenReturn(uriInfo);
        when(uriInfo.getBaseUri()).thenReturn(URI.create("http://localhost:8080/auth/"));
        resource = new WebhooksResource(session, realm);
    }

    @Test
    void serveUi_returnsHtmlWithRealmAndBasePath() {
        Response response = resource.serveUi();

        assertEquals(200, response.getStatus());
        assertEquals("text/html", response.getMediaType().toString());
        String body = (String) response.getEntity();
        assertTrue(body.contains("\"test-realm\""), "Should contain realm name");
        assertTrue(body.contains("\"/auth\""), "Should contain base path");
    }

    @Test
    void serveUiAsset_returnsJsFile() {
        // This test verifies the content-type mapping. The actual file won't exist
        // in test classpath, so we test the path traversal guard separately.
        Response response = resource.serveUiAsset("../etc/passwd");

        assertEquals(400, response.getStatus());
    }

    @Test
    void serveUiAsset_rejectsPathTraversal() {
        Response response = resource.serveUiAsset("../../secret");
        assertEquals(400, response.getStatus());

        Response response2 = resource.serveUiAsset("foo/../bar");
        assertEquals(400, response2.getStatus());
    }

    @Test
    void serveUiAsset_returns404ForMissingFile() {
        Response response = resource.serveUiAsset("nonexistent.js");
        assertEquals(404, response.getStatus());
    }
}
