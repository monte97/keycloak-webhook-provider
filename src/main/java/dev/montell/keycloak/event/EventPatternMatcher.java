// src/main/java/dev/montell/keycloak/event/EventPatternMatcher.java
package dev.montell.keycloak.event;

import java.util.Set;
import java.util.regex.PatternSyntaxException;
import lombok.extern.jbosslog.JBossLog;

/**
 * Matches event type strings against webhook subscription patterns. Supports wildcards
 * ({@code *}, {@code access.*}, {@code admin.*}), exact match, and Java regex.
 *
 * <p>This is a stateless utility class. All methods are static.
 */
@JBossLog
public final class EventPatternMatcher {

    private EventPatternMatcher() {}

    /**
     * Checks whether any pattern in the set matches the given event type.
     * Pattern resolution order (first match wins):
     * <ol>
     *   <li>{@code *} — matches everything</li>
     *   <li>{@code access.*} — prefix match for all user (access) events</li>
     *   <li>{@code admin.*} — prefix match for all admin events</li>
     *   <li>exact string equality</li>
     *   <li>Java regex (via {@link String#matches}) — note: {@code .} is a regex wildcard here,
     *       not a literal dot. Patterns like {@code admin.USER-.*} work as expected.</li>
     * </ol>
     */
    public static boolean matches(Set<String> patterns, String eventType) {
        if (eventType == null || patterns == null || patterns.isEmpty()) return false;
        for (String pattern : patterns) {
            if (matchesSingle(pattern, eventType)) return true;
        }
        return false;
    }

    private static boolean matchesSingle(String pattern, String eventType) {
        if ("*".equals(pattern))          return true;
        if ("access.*".equals(pattern))   return eventType.startsWith("access.");
        if ("admin.*".equals(pattern))    return eventType.startsWith("admin.");
        if (pattern.equals(eventType))    return true;
        try {
            return eventType.matches(pattern);
        } catch (PatternSyntaxException e) {
            log.warnf("Invalid regex pattern in webhook eventTypes: '%s' — ignoring", pattern);
            return false;
        }
    }
}
