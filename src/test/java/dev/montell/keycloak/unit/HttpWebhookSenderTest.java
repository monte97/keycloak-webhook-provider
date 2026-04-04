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
                        .send("https://example.com/hook", "{}", "wh-id", "secret", "HmacSHA256");

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
                        .send("https://example.com/hook", "{}", "wh-id", "secret", "HmacSHA256");

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
                        .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256");

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
                .send("https://example.com/hook", "{}", "wh-id", "secret", "HmacSHA256");

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
                .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256");

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
                        .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256");

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
                        .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256");

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
                        .send("https://example.com/hook", "{}", "wh-id", null, "HmacSHA256");

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
                .send("https://example.com/hook", "{}", "my-webhook-id", null, "HmacSHA256");

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
}
