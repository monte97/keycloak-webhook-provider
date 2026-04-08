package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;

import dev.montell.keycloak.jpa.entity.WebhookEntity;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class WebhookEntityTest {

    private WebhookEntity webhookWith(String secondary, Instant expiresAt, Instant startedAt) {
        WebhookEntity e = new WebhookEntity();
        e.setSecret("primary");
        e.setSecondarySecret(secondary);
        e.setRotationExpiresAt(expiresAt);
        e.setRotationStartedAt(startedAt);
        return e;
    }

    @Test
    void expireRotationIfDue_returns_false_when_no_rotation() {
        WebhookEntity e = webhookWith(null, null, null);
        assertFalse(e.expireRotationIfDue(Instant.now()));
        assertNull(e.getSecondarySecret());
    }

    @Test
    void expireRotationIfDue_returns_false_when_not_yet_expired() {
        Instant now = Instant.parse("2026-04-08T12:00:00Z");
        Instant future = now.plusSeconds(3600);
        WebhookEntity e = webhookWith("old", future, now);
        assertFalse(e.expireRotationIfDue(now));
        assertEquals("old", e.getSecondarySecret());
        assertEquals(future, e.getRotationExpiresAt());
    }

    @Test
    void expireRotationIfDue_clears_all_rotation_fields_when_expired() {
        Instant now = Instant.parse("2026-04-08T12:00:00Z");
        Instant past = now.minusSeconds(1);
        WebhookEntity e = webhookWith("old", past, past.minusSeconds(3600));
        assertTrue(e.expireRotationIfDue(now));
        assertNull(e.getSecondarySecret());
        assertNull(e.getRotationExpiresAt());
        assertNull(e.getRotationStartedAt());
        assertEquals("primary", e.getSecret(), "primary must be untouched");
    }

    @Test
    void expireRotationIfDue_is_idempotent_when_called_twice() {
        Instant now = Instant.parse("2026-04-08T12:00:00Z");
        WebhookEntity e = webhookWith("old", now.minusSeconds(1), now.minusSeconds(3600));
        assertTrue(e.expireRotationIfDue(now));
        assertFalse(e.expireRotationIfDue(now));
    }

    @Test
    void expireRotationIfDue_treats_exact_equality_as_expired() {
        Instant now = Instant.parse("2026-04-08T12:00:00Z");
        WebhookEntity e = webhookWith("old", now, now.minusSeconds(3600));
        assertTrue(e.expireRotationIfDue(now), "expiresAt == now must be treated as expired");
    }
}
