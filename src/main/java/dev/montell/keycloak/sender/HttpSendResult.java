package dev.montell.keycloak.sender;

/** Result of a single HTTP webhook send attempt. */
public record HttpSendResult(int httpStatus, boolean success, long durationMs) {}
