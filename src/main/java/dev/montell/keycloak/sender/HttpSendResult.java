package dev.montell.keycloak.sender;

/**
 * Result of a single HTTP webhook delivery attempt.
 *
 * @param httpStatus HTTP response status code, or {@code -1} on network error/timeout
 * @param success {@code true} if the response was HTTP 2xx
 * @param durationMs wall-clock time of the HTTP request in milliseconds
 */
public record HttpSendResult(int httpStatus, boolean success, long durationMs) {}
