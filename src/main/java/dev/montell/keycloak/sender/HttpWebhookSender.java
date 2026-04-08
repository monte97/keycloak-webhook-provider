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
     * X-Keycloak-Webhook-Id} always; sets {@code X-Keycloak-Signature} when {@code secret} is
     * non-null and non-blank. When {@code secondarySecret} is also non-null and non-blank, emits a
     * comma-separated list of two signatures (primary first) in Stripe-style format.
     */
    public HttpSendResult send(
            String url,
            String payloadJson,
            String webhookId,
            String secret,
            String algorithm,
            String secondarySecret) {
        long start = System.currentTimeMillis();
        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .timeout(Duration.ofSeconds(READ_TIMEOUT_S))
                        .header("Content-Type", "application/json")
                        .header("X-Keycloak-Webhook-Id", webhookId)
                        .POST(HttpRequest.BodyPublishers.ofString(payloadJson));

        String signatureHeader =
                buildSignatureHeader(payloadJson, secret, secondarySecret, algorithm);
        if (signatureHeader != null) {
            builder.header("X-Keycloak-Signature", signatureHeader);
        }

        try {
            HttpResponse<String> response =
                    httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            long durationMs = System.currentTimeMillis() - start;
            boolean success = response.statusCode() >= 200 && response.statusCode() < 300;
            return new HttpSendResult(response.statusCode(), success, durationMs, null);
        } catch (Exception e) {
            long durationMs = System.currentTimeMillis() - start;
            log.warnf("HTTP send failed for webhook %s url=%s: %s", webhookId, url, e.getMessage());
            return new HttpSendResult(-1, false, durationMs, e.getMessage());
        }
    }

    /**
     * Builds the {@code X-Keycloak-Signature} header value. Returns {@code null} when no primary
     * secret is configured (no header emitted). Format:
     *
     * <ul>
     *   <li>primary only: {@code sha256=<hex>}
     *   <li>primary + secondary: {@code sha256=<hex1>, sha256=<hex2>} (primary first)
     * </ul>
     */
    static String buildSignatureHeader(
            String payload, String primary, String secondary, String algorithm) {
        if (primary == null || primary.isBlank()) return null;
        String primarySig = "sha256=" + HmacSigner.sign(payload, primary, algorithm);
        if (secondary == null || secondary.isBlank()) {
            return primarySig;
        }
        String secondarySig = "sha256=" + HmacSigner.sign(payload, secondary, algorithm);
        return primarySig + ", " + secondarySig;
    }
}
