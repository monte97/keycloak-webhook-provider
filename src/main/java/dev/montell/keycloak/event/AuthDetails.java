// src/main/java/dev/montell/keycloak/event/AuthDetails.java
package dev.montell.keycloak.event;

/**
 * Authentication context of the user who triggered an admin event. Included in {@link
 * WebhookPayload.AdminEvent} payloads to identify who performed the action.
 */
public record AuthDetails(
        String realmId, String clientId, String userId, String username, String ipAddress) {}
