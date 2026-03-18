// src/main/java/dev/montell/keycloak/event/AuthDetails.java
package dev.montell.keycloak.event;

public record AuthDetails(
    String realmId,
    String clientId,
    String userId,
    String username,
    String ipAddress
) {}
