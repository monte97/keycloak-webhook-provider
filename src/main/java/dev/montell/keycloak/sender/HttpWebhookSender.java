package dev.montell.keycloak.sender;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import lombok.extern.jbosslog.JBossLog;

/**
 * Sends webhook payloads via HTTP POST with optional HMAC signature. Uses Java's built-in {@link
 * HttpClient} with a 3-second connect timeout and 10-second read timeout.
 *
 * <p>Headers sent on every request:
 *
 * <ul>
 *   <li>{@code Content-Type: application/json}
 *   <li>{@code X-Keycloak-Webhook-Id: <webhookId>}
 *   <li>{@code X-Keycloak-Signature: sha256=<hex>} (only when a secret is configured)
 * </ul>
 *
 * <p>Success is defined as any HTTP 2xx response. Network errors and non-2xx statuses are returned
 * as failures with {@code httpStatus = -1} or the actual status code.
 */
@JBossLog
public class HttpWebhookSender {

    private static final int CONNECT_TIMEOUT_S = 3;
    private static final int READ_TIMEOUT_S = 10;

    private final HttpClient httpClient;

    public HttpWebhookSender() {
        this.httpClient =
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(CONNECT_TIMEOUT_S))
                        .build();
    }

    /** Constructor for testing — allows injecting a mock HttpClient. */
    public HttpWebhookSender(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    /**
     * Sends a POST to {@code url} with {@code payloadJson} as body. Sets {@code
     * X-Keycloak-Webhook-Id} always; sets {@code X-Keycloak-Signature} only when {@code secret} is
     * non-null and non-blank.
     */
    public HttpSendResult send(
            String url, String payloadJson, String webhookId, String secret, String algorithm) {
        long start = System.currentTimeMillis();
        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .timeout(Duration.ofSeconds(READ_TIMEOUT_S))
                        .header("Content-Type", "application/json")
                        .header("X-Keycloak-Webhook-Id", webhookId)
                        .POST(HttpRequest.BodyPublishers.ofString(payloadJson));

        if (secret != null && !secret.isBlank()) {
            builder.header("X-Keycloak-Signature", HmacSigner.sign(payloadJson, secret, algorithm));
        }

        try {
            HttpResponse<String> response =
                    httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            long durationMs = System.currentTimeMillis() - start;
            boolean success = response.statusCode() >= 200 && response.statusCode() < 300;
            return new HttpSendResult(response.statusCode(), success, durationMs);
        } catch (Exception e) {
            long durationMs = System.currentTimeMillis() - start;
            log.warnf("HTTP send failed for webhook %s url=%s: %s", webhookId, url, e.getMessage());
            return new HttpSendResult(-1, false, durationMs);
        }
    }
}
