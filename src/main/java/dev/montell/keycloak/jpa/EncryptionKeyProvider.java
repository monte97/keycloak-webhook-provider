package dev.montell.keycloak.jpa;

import java.util.Base64;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

/**
 * Static holder for the AES-256 encryption key used by {@link SecretEncryptionConverter}. Must be
 * initialized once at startup via {@link #init()} before any JPA entity operations involving the
 * {@code secret} field.
 */
public final class EncryptionKeyProvider {

    private static volatile SecretKey key;

    private EncryptionKeyProvider() {}

    /** Reads the key from the {@code WEBHOOK_ENCRYPTION_KEY} environment variable. */
    public static void init() {
        init(System.getenv("WEBHOOK_ENCRYPTION_KEY"));
    }

    /** Initializes with an explicit base64-encoded key. Package-private for testing. */
    static void init(String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            throw new IllegalStateException(
                    "WEBHOOK_ENCRYPTION_KEY environment variable is required");
        }
        byte[] raw = Base64.getDecoder().decode(base64Key);
        if (raw.length != 32) {
            throw new IllegalStateException(
                    "WEBHOOK_ENCRYPTION_KEY must be 32 bytes (256-bit AES key), got "
                            + raw.length);
        }
        key = new SecretKeySpec(raw, "AES");
    }

    public static SecretKey getKey() {
        SecretKey k = key;
        if (k == null) {
            throw new IllegalStateException("EncryptionKeyProvider not initialized");
        }
        return k;
    }

    /** Resets state. Package-private for testing. */
    static void reset() {
        key = null;
    }
}
