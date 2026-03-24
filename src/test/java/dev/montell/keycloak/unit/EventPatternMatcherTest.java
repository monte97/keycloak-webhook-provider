// src/test/java/dev/montell/keycloak/unit/EventPatternMatcherTest.java
package dev.montell.keycloak.unit;

import dev.montell.keycloak.event.EventPatternMatcher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class EventPatternMatcherTest {

    @Test
    void wildcard_matches_everything() {
        assertTrue(EventPatternMatcher.matches(Set.of("*"), "access.LOGIN"));
        assertTrue(EventPatternMatcher.matches(Set.of("*"), "admin.USER-CREATE"));
    }

    @Test
    void access_prefix_matches_access_events_only() {
        assertTrue(EventPatternMatcher.matches(Set.of("access.*"), "access.LOGIN"));
        assertTrue(EventPatternMatcher.matches(Set.of("access.*"), "access.REGISTER"));
        assertFalse(EventPatternMatcher.matches(Set.of("access.*"), "admin.USER-CREATE"));
    }

    @Test
    void admin_prefix_matches_admin_events_only() {
        assertTrue(EventPatternMatcher.matches(Set.of("admin.*"), "admin.USER-CREATE"));
        assertFalse(EventPatternMatcher.matches(Set.of("admin.*"), "access.LOGIN"));
    }

    @Test
    void exact_match() {
        assertTrue(EventPatternMatcher.matches(Set.of("access.LOGIN"), "access.LOGIN"));
        assertFalse(EventPatternMatcher.matches(Set.of("access.LOGIN"), "access.LOGOUT"));
    }

    @Test
    void regex_match() {
        assertTrue(EventPatternMatcher.matches(Set.of("admin.USER-.*"), "admin.USER-CREATE"));
        assertTrue(EventPatternMatcher.matches(Set.of("admin.USER-.*"), "admin.USER-DELETE"));
        assertFalse(EventPatternMatcher.matches(Set.of("admin.USER-.*"), "admin.CLIENT-CREATE"));
    }

    @Test
    void invalid_regex_returns_false_no_exception() {
        // pattern [invalid does not throw exception, returns false
        assertFalse(EventPatternMatcher.matches(Set.of("[invalid"), "access.LOGIN"));
    }

    @Test
    void null_event_type_returns_false() {
        assertFalse(EventPatternMatcher.matches(Set.of("*"), null));
    }

    @Test
    void empty_patterns_returns_false() {
        assertFalse(EventPatternMatcher.matches(Set.of(), "access.LOGIN"));
    }

    @Test
    void null_patterns_returns_false() {
        assertFalse(EventPatternMatcher.matches(null, "access.LOGIN"));
    }

    @Test
    void access_prefix_requires_dot_separator() {
        // Kills shortcut-bypass mutation: "accessLOGIN" has no dot → startsWith("access.") is false
        // but "accessLOGIN".matches("access.*") is true (regex fallback)
        assertFalse(EventPatternMatcher.matches(Set.of("access.*"), "accessLOGIN"));
        assertFalse(EventPatternMatcher.matches(Set.of("admin.*"),  "adminUSER"));
    }

    @Test
    void exact_match_on_pattern_with_regex_metachar() {
        // "access(LOGIN)" equals "access(LOGIN)" → exact-match shortcut returns true
        // but regex "access(LOGIN)" matches "accessLOGIN", NOT "access(LOGIN)" → false
        // Removing the exact-match shortcut would make this return false → test fails → kills mutation
        assertTrue(EventPatternMatcher.matches(Set.of("access(LOGIN)"), "access(LOGIN)"));
    }

    @Test
    void multiple_patterns_any_match_returns_true() {
        assertTrue(EventPatternMatcher.matches(
            Set.of("admin.USER-DELETE", "access.LOGIN"), "access.LOGIN"));
    }
}
