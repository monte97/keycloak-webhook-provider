// src/main/java/dev/montell/keycloak/model/KeycloakEventType.java
package dev.montell.keycloak.model;

/**
 * Coarse classification of Keycloak events into user (access) and admin categories. Used as a
 * discriminator column in {@code WEBHOOK_EVENT} and for routing logic.
 */
public enum KeycloakEventType {
    USER, // access.* events (login, register, logout…)
    ADMIN, // admin.* events (USER-CREATE, USER-DELETE…)
    UNKNOWN;

    /**
     * Classifies a canonical prefixed event type string into its coarse category.
     *
     * @param eventType the prefixed event type string as stored by this provider, e.g.
     *     "access.LOGIN" or "admin.USER-CREATE". Raw Keycloak {@code EventType} names (e.g.
     *     "LOGIN") are NOT supported — callers must apply the "access." / "admin." prefix first.
     * @return USER for "access.*", ADMIN for "admin.*", UNKNOWN otherwise
     */
    public static KeycloakEventType fromPrefix(String eventType) {
        if (eventType == null) return UNKNOWN;
        if (eventType.startsWith("access.")) return USER;
        if (eventType.startsWith("admin.")) return ADMIN;
        return UNKNOWN;
    }
}
