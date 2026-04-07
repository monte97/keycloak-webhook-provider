# Secret Encryption at Rest — Design Spec

## Goal

Encrypt HMAC webhook secrets in the database using AES-256-GCM, transparent to the rest of the codebase via a JPA `AttributeConverter`.

## Scope

- JPA `AttributeConverter` that encrypts on persist and decrypts on load
- AES-256-GCM with random IV per encryption
- Encryption key provided via `WEBHOOK_ENCRYPTION_KEY` environment variable (base64-encoded, 32 bytes)
- Liquibase changeset to widen the `SECRET` column from `VARCHAR(255)` to `VARCHAR(512)`
- Unit tests for the converter
- Integration test verifying ciphertext in DB

Out of scope:
- Migration of existing plaintext secrets (manual re-save from UI)
- Fallback to plaintext when env var is absent (hard failure at boot)
- Key rotation mechanism
- UI changes (none needed)

## Architecture

### `SecretEncryptionConverter`

A JPA `@Converter` applied to `WebhookEntity.secret`. All other code (dispatch, HMAC signing, REST endpoints, UI) continues to work with plaintext strings — the converter is the only encryption boundary.

```
                    ┌──────────────────────────────┐
  REST/Dispatch     │      WebhookEntity.secret     │     Database
  (plaintext)  ────>│  @Convert(SecretEncryption…)  │────> (ciphertext)
               <────│  convertToEntityAttribute()   │<──── VARCHAR(512)
                    └──────────────────────────────┘
```

### Cryptographic details

| Parameter | Value |
|-----------|-------|
| Algorithm | `AES/GCM/NoPadding` |
| Key size | 256 bits |
| IV size | 12 bytes (random, `SecureRandom`) |
| GCM tag length | 128 bits (default) |
| Key source | `WEBHOOK_ENCRYPTION_KEY` env var, base64-encoded |
| DB format | `Base64(IV ‖ ciphertext ‖ GCM-tag)` |
| Null handling | `null` in → `null` out (no encryption) |

A fresh random IV is generated for every `convertToDatabaseColumn` call, ensuring identical plaintext values produce different ciphertext.

### Key provisioning

The encryption key is read from the `WEBHOOK_ENCRYPTION_KEY` environment variable:

- Format: base64-encoded 32-byte (256-bit) AES key
- Generate with: `openssl rand -base64 32`
- If absent or invalid (not exactly 32 bytes after decode): the provider factory throws an exception at startup, preventing Keycloak from loading the webhook plugin

The key is read once at `WebhookJpaEntityProviderFactory.init()` and stored in a static field accessible to the converter. JPA `AttributeConverter` instances do not participate in dependency injection, so a static accessor is the standard pattern in Keycloak SPI plugins.

### Components

| Component | File | Change |
|-----------|------|--------|
| `SecretEncryptionConverter` | `src/main/java/dev/montell/keycloak/jpa/SecretEncryptionConverter.java` | New file |
| `EncryptionKeyProvider` | `src/main/java/dev/montell/keycloak/jpa/EncryptionKeyProvider.java` | New file — static holder for the AES key, initialized from env var |
| `WebhookEntity` | `src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntity.java` | Add `@Convert(converter = SecretEncryptionConverter.class)` to `secret` field |
| `WebhookJpaEntityProviderFactory` | `src/main/java/dev/montell/keycloak/jpa/WebhookJpaEntityProviderFactory.java` | Call `EncryptionKeyProvider.init()` in `init()` method |
| Liquibase changelog | `src/main/resources/META-INF/jpa-changelog-webhook-1.1.0.xml` | New changeset: modify `SECRET` column to `VARCHAR(512)` |
| Master changelog | `src/main/resources/META-INF/jpa-changelog-webhook.xml` | Include new changelog file |

### `EncryptionKeyProvider`

A simple static holder:

```java
public final class EncryptionKeyProvider {
    private static SecretKey key;

    public static void init() {
        String b64 = System.getenv("WEBHOOK_ENCRYPTION_KEY");
        if (b64 == null || b64.isBlank()) {
            throw new IllegalStateException(
                "WEBHOOK_ENCRYPTION_KEY environment variable is required");
        }
        byte[] raw = Base64.getDecoder().decode(b64);
        if (raw.length != 32) {
            throw new IllegalStateException(
                "WEBHOOK_ENCRYPTION_KEY must be 32 bytes (256-bit AES key), got " + raw.length);
        }
        key = new SecretKeySpec(raw, "AES");
    }

    public static SecretKey getKey() {
        if (key == null) {
            throw new IllegalStateException("EncryptionKeyProvider not initialized");
        }
        return key;
    }
}
```

### `SecretEncryptionConverter`

```java
@Converter
public class SecretEncryptionConverter implements AttributeConverter<String, String> {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int IV_LENGTH = 12;
    private static final int TAG_LENGTH = 128;

    @Override
    public String convertToDatabaseColumn(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[IV_LENGTH];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, EncryptionKeyProvider.getKey(),
                        new GCMParameterSpec(TAG_LENGTH, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[IV_LENGTH + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, IV_LENGTH);
            System.arraycopy(ciphertext, 0, combined, IV_LENGTH, ciphertext.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to encrypt secret", e);
        }
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        if (dbData == null) return null;
        try {
            byte[] combined = Base64.getDecoder().decode(dbData);
            byte[] iv = new byte[IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH);
            byte[] ciphertext = new byte[combined.length - IV_LENGTH];
            System.arraycopy(combined, IV_LENGTH, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, EncryptionKeyProvider.getKey(),
                        new GCMParameterSpec(TAG_LENGTH, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to decrypt secret", e);
        }
    }
}
```

### Liquibase changeset

New file `jpa-changelog-webhook-1.1.0.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                   http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-4.25.xsd">
  <changeSet id="webhook-1.1.0-1" author="montell">
    <modifyDataType tableName="WEBHOOK" columnName="SECRET" newDataType="VARCHAR(512)"/>
  </changeSet>
</databaseChangeLog>
```

## Error handling

| Scenario | Behavior |
|----------|----------|
| `WEBHOOK_ENCRYPTION_KEY` absent | `IllegalStateException` in `init()` — plugin fails to load, Keycloak logs the error |
| Key not 32 bytes after base64 decode | Same — startup failure with clear message |
| Decrypt fails (wrong key, corrupt data) | `IllegalStateException` at entity load time — the dispatch fails for this webhook. This is the desired behavior: a wrong key means a configuration error that must be fixed, not silently ignored. |
| `secret` field is null | Converter returns null — no encryption, no signature |

## Testing

### Unit — `SecretEncryptionConverterTest.java`

- Encrypt then decrypt round-trip returns original plaintext.
- Null input returns null (both directions).
- Two encryptions of the same plaintext produce different ciphertext (random IV).
- Decryption with wrong key throws `IllegalStateException`.
- Decryption of garbage base64 throws `IllegalStateException`.

### Unit — `EncryptionKeyProviderTest.java`

- `init()` with valid 32-byte base64 key succeeds.
- `init()` with missing env var throws with clear message.
- `init()` with wrong-length key throws with clear message.
- `getKey()` before `init()` throws.

### Integration — `JpaWebhookProviderIT.java` (update)

- Create webhook with secret → query `WEBHOOK.SECRET` column directly via JDBC → value is not the plaintext secret.
- Load the same webhook via provider → `getSecret()` returns the original plaintext.

## Demo stack update

Add `WEBHOOK_ENCRYPTION_KEY` to the Keycloak service in `docker-compose.yml` (or the demo stack equivalent) so the plugin loads in development.

Generate a dev-only key: `openssl rand -base64 32`
