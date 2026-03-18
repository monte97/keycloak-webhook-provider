// src/main/java/dev/montell/keycloak/event/EventPatternMatcher.java
package dev.montell.keycloak.event;

import java.util.Set;
import java.util.regex.PatternSyntaxException;
import lombok.extern.jbosslog.JBossLog;

@JBossLog
public final class EventPatternMatcher {

    private EventPatternMatcher() {}

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
