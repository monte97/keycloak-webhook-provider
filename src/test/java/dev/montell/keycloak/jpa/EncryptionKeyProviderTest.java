package dev.montell.keycloak.jpa;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Base64;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class EncryptionKeyProviderTest {

    @AfterEach
    void cleanup() {
        EncryptionKeyProvider.reset();
    }

    @Test
    void init_with_valid_32_byte_key_succeeds() {
        byte[] raw = new byte[32];
        raw[0] = 42;
        String b64 = Base64.getEncoder().encodeToString(raw);
        EncryptionKeyProvider.init(b64);
        SecretKey key = EncryptionKeyProvider.getKey();
        assertNotNull(key);
        assertEquals("AES", key.getAlgorithm());
        assertEquals(32, key.getEncoded().length);
    }

    @Test
    void init_with_null_throws() {
        IllegalStateException ex =
                assertThrows(IllegalStateException.class, () -> EncryptionKeyProvider.init(null));
        assertTrue(ex.getMessage().contains("WEBHOOK_ENCRYPTION_KEY"));
    }

    @Test
    void init_with_blank_throws() {
        IllegalStateException ex =
                assertThrows(IllegalStateException.class, () -> EncryptionKeyProvider.init("  "));
        assertTrue(ex.getMessage().contains("WEBHOOK_ENCRYPTION_KEY"));
    }

    @Test
    void init_with_wrong_length_throws() {
        String b64 = Base64.getEncoder().encodeToString(new byte[16]);
        IllegalStateException ex =
                assertThrows(IllegalStateException.class, () -> EncryptionKeyProvider.init(b64));
        assertTrue(ex.getMessage().contains("32 bytes"));
    }

    @Test
    void getKey_before_init_throws() {
        assertThrows(IllegalStateException.class, EncryptionKeyProvider::getKey);
    }
}
