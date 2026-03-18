package dev.montell.keycloak.unit;

import dev.montell.keycloak.sender.HmacSigner;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class HmacSignerTest {

    @Test
    void hmacSha256_returns_64_char_lowercase_hex() {
        String sig = HmacSigner.sign("payload", "secret", "HmacSHA256");
        assertNotNull(sig);
        assertEquals(64, sig.length());
        assertTrue(sig.matches("[0-9a-f]+"), "should be lowercase hex");
    }

    @Test
    void hmacSha256_is_deterministic() {
        String s1 = HmacSigner.sign("payload", "secret", "HmacSHA256");
        String s2 = HmacSigner.sign("payload", "secret", "HmacSHA256");
        assertEquals(s1, s2);
    }

    @Test
    void different_payloads_produce_different_signatures() {
        String s1 = HmacSigner.sign("payload1", "secret", "HmacSHA256");
        String s2 = HmacSigner.sign("payload2", "secret", "HmacSHA256");
        assertNotEquals(s1, s2);
    }

    @Test
    void different_secrets_produce_different_signatures() {
        String s1 = HmacSigner.sign("payload", "secret1", "HmacSHA256");
        String s2 = HmacSigner.sign("payload", "secret2", "HmacSHA256");
        assertNotEquals(s1, s2);
    }

    @Test
    void hmacSha1_returns_40_char_hex() {
        String sig = HmacSigner.sign("payload", "secret", "HmacSHA1");
        assertEquals(40, sig.length());
    }

    @Test
    void unsupported_algorithm_throws_IllegalArgumentException() {
        assertThrows(IllegalArgumentException.class,
            () -> HmacSigner.sign("payload", "secret", "INVALID-ALGO"));
    }
}
