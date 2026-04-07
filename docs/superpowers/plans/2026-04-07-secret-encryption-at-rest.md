# Secret Encryption at Rest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt HMAC webhook secrets in the database using AES-256-GCM via a transparent JPA `AttributeConverter`.

**Architecture:** `EncryptionKeyProvider` reads a 256-bit AES key from `WEBHOOK_ENCRYPTION_KEY` env var at startup. `SecretEncryptionConverter` (a JPA `@Converter`) encrypts on persist and decrypts on load, transparent to all other code. A Liquibase changeset widens the `SECRET` column to accommodate ciphertext.

**Tech Stack:** Java 17, JPA/Hibernate, AES-256-GCM, JUnit 5, Mockito, Testcontainers (PostgreSQL).

---

## File Map

| File | Change |
|------|--------|
| `src/main/java/dev/montell/keycloak/jpa/EncryptionKeyProvider.java` | Create — static holder for AES key |
| `src/main/java/dev/montell/keycloak/jpa/SecretEncryptionConverter.java` | Create — JPA `@Converter` |
| `src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntity.java:45-46` | Modify — add `@Convert` annotation |
| `src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntityProviderFactory.java:33` | Modify — call `EncryptionKeyProvider.init()` |
| `src/main/resources/META-INF/jpa-changelog-webhook-1.1.0.xml` | Create — widen `SECRET` column |
| `src/main/resources/META-INF/jpa-changelog-webhook.xml:6` | Modify — include new changelog |
| `src/test/java/dev/montell/keycloak/unit/EncryptionKeyProviderTest.java` | Create — unit tests |
| `src/test/java/dev/montell/keycloak/unit/SecretEncryptionConverterTest.java` | Create — unit tests |
| `src/test/java/dev/montell/keycloak/it/JpaWebhookProviderIT.java` | Modify — add encryption verification test |

---

### Task 1: `EncryptionKeyProvider` — static key holder

**Files:**
- Create: `src/main/java/dev/montell/keycloak/jpa/EncryptionKeyProvider.java`
- Create: `src/test/java/dev/montell/keycloak/unit/EncryptionKeyProviderTest.java`

- [ ] **Step 1: Write failing tests**

```java
package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;

import dev.montell.keycloak.jpa.EncryptionKeyProvider;
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
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
mvn test -Dtest="dev.montell.keycloak.unit.EncryptionKeyProviderTest" -DfailIfNoTests=false 2>&1 | tail -20
```

Expected: compilation error — `EncryptionKeyProvider` does not exist.

- [ ] **Step 3: Implement `EncryptionKeyProvider`**

```java
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
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
mvn test -Dtest="dev.montell.keycloak.unit.EncryptionKeyProviderTest" 2>&1 | tail -20
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/dev/montell/keycloak/jpa/EncryptionKeyProvider.java \
        src/test/java/dev/montell/keycloak/unit/EncryptionKeyProviderTest.java
git commit -m "feat: add EncryptionKeyProvider for AES-256 key management"
```

---

### Task 2: `SecretEncryptionConverter` — JPA AttributeConverter

**Files:**
- Create: `src/main/java/dev/montell/keycloak/jpa/SecretEncryptionConverter.java`
- Create: `src/test/java/dev/montell/keycloak/unit/SecretEncryptionConverterTest.java`

- [ ] **Step 1: Write failing tests**

```java
package dev.montell.keycloak.unit;

import static org.junit.jupiter.api.Assertions.*;

import dev.montell.keycloak.jpa.EncryptionKeyProvider;
import dev.montell.keycloak.jpa.SecretEncryptionConverter;
import java.util.Base64;
import javax.crypto.spec.SecretKeySpec;
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
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
mvn test -Dtest="dev.montell.keycloak.unit.SecretEncryptionConverterTest" -DfailIfNoTests=false 2>&1 | tail -20
```

Expected: compilation error — `SecretEncryptionConverter` does not exist.

- [ ] **Step 3: Implement `SecretEncryptionConverter`**

```java
package dev.montell.keycloak.jpa;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;

/**
 * JPA converter that encrypts the webhook HMAC secret at rest using AES-256-GCM. A fresh random IV
 * is generated for every encryption, so identical plaintext values produce different ciphertext.
 *
 * <p>The database column stores {@code Base64(IV || ciphertext || GCM-tag)}. Null values pass
 * through unchanged.
 */
@Converter
public class SecretEncryptionConverter implements AttributeConverter<String, String> {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;

    @Override
    public String convertToDatabaseColumn(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[IV_LENGTH];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    EncryptionKeyProvider.getKey(),
                    new GCMParameterSpec(TAG_BITS, iv));
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
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    EncryptionKeyProvider.getKey(),
                    new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to decrypt secret", e);
        }
    }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
mvn test -Dtest="dev.montell.keycloak.unit.SecretEncryptionConverterTest" 2>&1 | tail -20
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/dev/montell/keycloak/jpa/SecretEncryptionConverter.java \
        src/test/java/dev/montell/keycloak/unit/SecretEncryptionConverterTest.java
git commit -m "feat: add SecretEncryptionConverter (AES-256-GCM JPA converter)"
```

---

### Task 3: Wire converter into entity, Liquibase, and factory

**Files:**
- Modify: `src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntity.java:45-46`
- Modify: `src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntityProviderFactory.java:33`
- Create: `src/main/resources/META-INF/jpa-changelog-webhook-1.1.0.xml`
- Modify: `src/main/resources/META-INF/jpa-changelog-webhook.xml:6`

- [ ] **Step 1: Add `@Convert` annotation to `WebhookEntity.secret`**

In `WebhookEntity.java`, replace lines 45-46:

```java
    @Column(name = "SECRET")
    private String secret;
```

with:

```java
    @Convert(converter = dev.montell.keycloak.jpa.SecretEncryptionConverter.class)
    @Column(name = "SECRET")
    private String secret;
```

- [ ] **Step 2: Add `EncryptionKeyProvider.init()` to factory**

In `WebhookEntityProviderFactory.java`, replace the empty `init` method:

```java
    @Override
    public void init(Scope config) {}
```

with:

```java
    @Override
    public void init(Scope config) {
        EncryptionKeyProvider.init();
    }
```

Add the import at the top of the file:

```java
import dev.montell.keycloak.jpa.EncryptionKeyProvider;
```

- [ ] **Step 3: Create Liquibase changeset**

Create `src/main/resources/META-INF/jpa-changelog-webhook-1.1.0.xml`:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                   http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.1.xsd">
    <changeSet id="webhook-1.1.0-1" author="montell">
        <modifyDataType tableName="WEBHOOK" columnName="SECRET" newDataType="VARCHAR(512)"/>
    </changeSet>
</databaseChangeLog>
```

- [ ] **Step 4: Include new changelog in master**

In `jpa-changelog-webhook.xml`, add a second include after the existing one:

```xml
    <include file="META-INF/jpa-changelog-webhook-1.0.0.xml"/>
    <include file="META-INF/jpa-changelog-webhook-1.1.0.xml"/>
```

- [ ] **Step 5: Run all unit tests to verify no regressions**

```bash
mvn test 2>&1 | tail -20
```

Expected: all unit tests pass. (The `@Convert` annotation is not exercised in unit tests — only in IT tests with a real DB.)

- [ ] **Step 6: Commit**

```bash
git add src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntity.java \
        src/main/java/dev/montell/keycloak/jpa/entity/WebhookEntityProviderFactory.java \
        src/main/resources/META-INF/jpa-changelog-webhook-1.1.0.xml \
        src/main/resources/META-INF/jpa-changelog-webhook.xml
git commit -m "feat: wire secret encryption into JPA entity and Liquibase schema"
```

---

### Task 4: Integration test — verify encrypted storage

**Files:**
- Modify: `src/test/java/dev/montell/keycloak/it/JpaWebhookProviderIT.java`

- [ ] **Step 1: Add encryption key initialization and test**

Add `EncryptionKeyProvider.init(...)` call at the top of the existing `@BeforeAll setup()` method, before the `EntityManagerFactory` creation:

```java
    @BeforeAll
    static void setup() {
        EncryptionKeyProvider.init(
                java.util.Base64.getEncoder().encodeToString(new byte[32]));

        Map<String, String> props = new HashMap<>();
        // ... rest of existing setup unchanged
    }
```

Add the import:

```java
import dev.montell.keycloak.jpa.EncryptionKeyProvider;
```

Add a new test method at the end of the class:

```java
    @Test
    @Order(20)
    void secret_is_encrypted_in_database() {
        WebhookModel w = provider.createWebhook(mockRealm, "https://secret.example.com", null);
        w.setSecret("my-hmac-secret");
        em.getTransaction().commit();

        // Read raw column value via native query
        em.getTransaction().begin();
        String raw =
                (String)
                        em.createNativeQuery("SELECT SECRET FROM WEBHOOK WHERE ID = ?1")
                                .setParameter(1, w.getId())
                                .getSingleResult();

        // Raw value should be base64 ciphertext, not plaintext
        assertNotNull(raw);
        assertNotEquals("my-hmac-secret", raw);
        assertTrue(raw.length() > 20, "Ciphertext should be longer than plaintext");

        // Loading through JPA should decrypt back to plaintext
        em.clear(); // Force reload from DB
        WebhookModel loaded = provider.getWebhookById(mockRealm, w.getId());
        assertEquals("my-hmac-secret", loaded.getSecret());
    }
```

- [ ] **Step 2: Run integration tests**

```bash
mvn verify -Dtest=none -Dit.test="dev.montell.keycloak.it.JpaWebhookProviderIT" 2>&1 | tail -30
```

Expected: all IT tests pass including the new encryption test.

- [ ] **Step 3: Commit**

```bash
git add src/test/java/dev/montell/keycloak/it/JpaWebhookProviderIT.java
git commit -m "test(it): verify webhook secret is encrypted in database"
```

---

### Task 5: Format check and documentation

**Files:**
- No new files — run formatting, update version

- [ ] **Step 1: Run Spotless formatting**

```bash
mvn spotless:apply 2>&1 | tail -5
```

- [ ] **Step 2: Run full test suite**

```bash
mvn test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Commit any formatting changes**

```bash
git add -A
git diff --cached --quiet || git commit -m "style: apply Spotless formatting"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Covered in |
|-----------------|-----------|
| `SecretEncryptionConverter` — JPA `@Converter` with AES/GCM | Task 2 |
| `EncryptionKeyProvider` — static key holder from env var | Task 1 |
| `@Convert` on `WebhookEntity.secret` | Task 3 |
| `EncryptionKeyProvider.init()` in factory | Task 3 |
| Liquibase changeset — `VARCHAR(512)` | Task 3 |
| Key absent → startup failure | Task 1 (test + impl) |
| Key wrong length → startup failure | Task 1 (test + impl) |
| Decrypt failure → `IllegalStateException` | Task 2 (test + impl) |
| Null passthrough | Task 2 (test + impl) |
| Random IV per encryption | Task 2 (test + impl) |
| Unit tests — `EncryptionKeyProviderTest` | Task 1 |
| Unit tests — `SecretEncryptionConverterTest` | Task 2 |
| Integration test — encrypted storage | Task 4 |

**No gaps found.**

**Type consistency:** `EncryptionKeyProvider.init(String)`, `.getKey()`, `.reset()` — consistent across all tasks. `SecretEncryptionConverter` referenced by full qualified name in `@Convert` annotation.
