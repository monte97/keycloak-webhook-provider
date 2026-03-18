// src/main/java/dev/montell/keycloak/model/KeycloakEventType.java
package dev.montell.keycloak.model;

public enum KeycloakEventType {
    USER,   // access.* events (login, register, logout…)
    ADMIN,  // admin.* events (USER-CREATE, USER-DELETE…)
    UNKNOWN;

    public static KeycloakEventType fromPrefix(String eventType) {
        if (eventType == null) return UNKNOWN;
        if (eventType.startsWith("access.")) return USER;
        if (eventType.startsWith("admin."))  return ADMIN;
        return UNKNOWN;
    }
}
