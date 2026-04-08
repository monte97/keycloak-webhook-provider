package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import dev.montell.keycloak.sender.HttpSendResult;
import dev.montell.keycloak.sender.HttpWebhookSender;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class HttpWebhookSenderTest {

    @Test
    @SuppressWarnings("unchecked")
    void send_200_returns_success_true() throws Exception {
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        HttpSendResult result =
                new HttpWebhookSender(client)
                        .send(
                                "https://example.com/hook",
                                "{}",
                                "wh-id",
                                "secret",
                                "HmacSHA256",
                                null);

        assertTrue(result.success());
        assertEquals(200, result.httpStatus());
    }

    @Test
    @SuppressWarnings("unchecked")
    void send_500_returns_success_false() throws Exception {
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(500);
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        HttpSendResult result =
                new HttpWebhookSender(client)
                        .send(
                                "https://example.com/hook",
                                "{}",
                                "wh-id",
                                "secret",
                                "HmacSHA256",
                                null);

        assertFalse(result.success());
        assertEquals(500, result.httpStatus());
    }

    @Test
    void send_network_exception_returns_minus1_and_false() throws Exception {
        HttpClient client = mock(HttpClient.class);
        when(client.send(any(HttpRequest.class), any()))
                .thenThrow(new java.io.IOException("connection refused"));

        HttpSendResult result =
                new HttpWebhookSender(client)
                        .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256", null);

        assertFalse(result.success());
        assertEquals(-1, result.httpStatus());
        assertEquals("connection refused", result.errorMessage());
    }

    @Test
    @SuppressWarnings("unchecked")
    void send_adds_signature_header_when_secret_present() throws Exception {
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        new HttpWebhookSender(client)
                .send("https://example.com/hook", "{}", "wh-id", "secret", "HmacSHA256", null);

        verify(client)
                .send(
                        argThat(
                                req ->
                                        req.headers()
                                                .firstValue("X-Keycloak-Signature")
                                                .isPresent()),
                        any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void send_omits_signature_header_when_secret_null() throws Exception {
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        new HttpWebhookSender(client)
                .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256", null);

        verify(client)
                .send(
                        argThat(req -> req.headers().firstValue("X-Keycloak-Signature").isEmpty()),
                        any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void send_300_returns_success_false() throws Exception {
        // Kills statusCode < 300 boundary mutation (>= vs >)
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(300);
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        HttpSendResult result =
                new HttpWebhookSender(client)
                        .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256", null);

        assertFalse(result.success());
        assertEquals(300, result.httpStatus());
    }

    @Test
    @SuppressWarnings("unchecked")
    void send_success_duration_is_plausible() throws Exception {
        // Kills durationMs = currentTimeMs - start → + start (+ gives ~2*epoch ≈ 3.4e12 ms)
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        HttpSendResult result =
                new HttpWebhookSender(client)
                        .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256", null);

        assertTrue(
                result.durationMs() >= 0 && result.durationMs() < 1_000,
                "expected durationMs in [0,1000) ms, got: " + result.durationMs());
    }

    @Test
    void send_exception_duration_is_plausible() throws Exception {
        // Kills durationMs subtraction mutation in the catch block
        HttpClient client = mock(HttpClient.class);
        when(client.send(any(HttpRequest.class), any()))
                .thenThrow(new java.io.IOException("timeout"));

        HttpSendResult result =
                new HttpWebhookSender(client)
                        .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256", null);

        assertTrue(
                result.durationMs() >= 0 && result.durationMs() < 1_000,
                "expected durationMs in [0,1000) ms, got: " + result.durationMs());
    }

    @Test
    @SuppressWarnings("unchecked")
    void send_always_includes_webhook_id_header() throws Exception {
        HttpClient client = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        new HttpWebhookSender(client)
                .send("https://example.com/hook", "{}", "my-webhook-id", null, "HmacSHA256", null);

        verify(client)
                .send(
                        argThat(
                                req ->
                                        "my-webhook-id"
                                                .equals(
                                                        req.headers()
                                                                .firstValue("X-Keycloak-Webhook-Id")
                                                                .orElse(null))),
                        any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void single_secret_produces_single_signature_with_sha256_prefix() throws Exception {
        HttpClient mock = mock(HttpClient.class);
        HttpResponse<String> resp = mock(HttpResponse.class);
        when(resp.statusCode()).thenReturn(200);
        doReturn(resp).when(mock).send(any(HttpRequest.class), any());

        HttpWebhookSender sender = new HttpWebhookSender(mock);
        sender.send("http://example/w", "{}", "wid", "primary", "HmacSHA256", null);

        ArgumentCaptor<HttpRequest> cap = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mock).send(cap.capture(), any());
        String sigHeader = cap.getValue().headers().firstValue("X-Keycloak-Signature").orElse(null);
        assertNotNull(sigHeader);
        assertTrue(sigHeader.startsWith("sha256="), "expected sha256= prefix, got: " + sigHeader);
        assertFalse(sigHeader.contains(","), "single secret must not emit comma");
    }

    @Test
    @SuppressWarnings("unchecked")
    void secondary_secret_produces_two_comma_separated_signatures() throws Exception {
        HttpClient mock = mock(HttpClient.class);
        HttpResponse<String> resp = mock(HttpResponse.class);
        when(resp.statusCode()).thenReturn(200);
        doReturn(resp).when(mock).send(any(HttpRequest.class), any());

        HttpWebhookSender sender = new HttpWebhookSender(mock);
        sender.send("http://example/w", "{}", "wid", "primary", "HmacSHA256", "secondary");

        ArgumentCaptor<HttpRequest> cap = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mock).send(cap.capture(), any());
        String sigHeader = cap.getValue().headers().firstValue("X-Keycloak-Signature").orElse(null);
        assertNotNull(sigHeader);
        String[] parts = sigHeader.split(", ");
        assertEquals(2, parts.length, "expected 2 comma-separated signatures, got: " + sigHeader);
        assertTrue(parts[0].startsWith("sha256="));
        assertTrue(parts[1].startsWith("sha256="));

        String expectedPrimary =
                "sha256="
                        + dev.montell.keycloak.sender.HmacSigner.sign(
                                "{}", "primary", "HmacSHA256");
        String expectedSecondary =
                "sha256="
                        + dev.montell.keycloak.sender.HmacSigner.sign(
                                "{}", "secondary", "HmacSHA256");
        assertEquals(expectedPrimary, parts[0]);
        assertEquals(expectedSecondary, parts[1]);
    }

    @Test
    @SuppressWarnings("unchecked")
    void blank_secondary_secret_falls_back_to_single_signature() throws Exception {
        HttpClient mock = mock(HttpClient.class);
        HttpResponse<String> resp = mock(HttpResponse.class);
        when(resp.statusCode()).thenReturn(200);
        doReturn(resp).when(mock).send(any(HttpRequest.class), any());

        HttpWebhookSender sender = new HttpWebhookSender(mock);
        sender.send("http://example/w", "{}", "wid", "primary", "HmacSHA256", "");

        ArgumentCaptor<HttpRequest> cap = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mock).send(cap.capture(), any());
        String sigHeader = cap.getValue().headers().firstValue("X-Keycloak-Signature").orElse(null);
        assertNotNull(sigHeader);
        assertFalse(sigHeader.contains(","), "blank secondary must not emit comma");
    }

    @Test
    @SuppressWarnings("unchecked")
    void null_primary_secret_emits_no_signature_header() throws Exception {
        HttpClient mock = mock(HttpClient.class);
        HttpResponse<String> resp = mock(HttpResponse.class);
        when(resp.statusCode()).thenReturn(200);
        doReturn(resp).when(mock).send(any(HttpRequest.class), any());

        HttpWebhookSender sender = new HttpWebhookSender(mock);
        sender.send("http://example/w", "{}", "wid", null, "HmacSHA256", null);

        ArgumentCaptor<HttpRequest> cap = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mock).send(cap.capture(), any());
        assertFalse(cap.getValue().headers().firstValue("X-Keycloak-Signature").isPresent());
    }
}
