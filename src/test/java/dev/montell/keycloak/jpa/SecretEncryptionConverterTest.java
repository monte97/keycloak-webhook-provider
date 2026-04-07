package dev.montell.keycloak.jpa;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Base64;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class SecretEncryptionConverterTest {

    static final String TEST_KEY_B64 =
            Base64.getEncoder().encodeToString(new byte[32]);

    final SecretEncryptionConverter converter = new SecretEncryptionConverter();

    @BeforeAll
    static void initKey() {
        EncryptionKeyProvider.init(TEST_KEY_B64);
    }

    @Test
    void encrypt_then_decrypt_round_trip() {
        String plaintext = "my-secret-key";
        String encrypted = converter.convertToDatabaseColumn(plaintext);
        assertNotNull(encrypted);
        assertNotEquals(plaintext, encrypted);

        String decrypted = converter.convertToEntityAttribute(encrypted);
        assertEquals(plaintext, decrypted);
    }

    @Test
    void null_input_returns_null_for_encrypt() {
        assertNull(converter.convertToDatabaseColumn(null));
    }

    @Test
    void null_input_returns_null_for_decrypt() {
        assertNull(converter.convertToEntityAttribute(null));
    }

    @Test
    void two_encryptions_produce_different_ciphertext() {
        String plaintext = "same-secret";
        String enc1 = converter.convertToDatabaseColumn(plaintext);
        String enc2 = converter.convertToDatabaseColumn(plaintext);
        assertNotEquals(enc1, enc2, "Random IV should produce different ciphertext each time");

        // Both decrypt to same plaintext
        assertEquals(plaintext, converter.convertToEntityAttribute(enc1));
        assertEquals(plaintext, converter.convertToEntityAttribute(enc2));
    }

    @Test
    void decrypt_with_wrong_key_throws() {
        String encrypted = converter.convertToDatabaseColumn("secret");

        // Swap to a different key
        byte[] wrongKeyBytes = new byte[32];
        wrongKeyBytes[0] = 99;
        EncryptionKeyProvider.init(
                Base64.getEncoder().encodeToString(wrongKeyBytes));

        assertThrows(
                IllegalStateException.class,
                () -> converter.convertToEntityAttribute(encrypted));

        // Restore original key
        EncryptionKeyProvider.init(TEST_KEY_B64);
    }

    @Test
    void decrypt_garbage_throws() {
        assertThrows(
                IllegalStateException.class,
                () -> converter.convertToEntityAttribute("not-valid-base64!!!"));
    }
}
