# Webhook Secret Rotation — Design Spec

## Goal

Support zero-downtime rotation of the HMAC secret of a webhook. During a rotation window the dispatcher signs every outgoing request with both the new and the old secret, so consumers can update their verification key without losing events.

## Scope

In scope:
- New REST endpoints to start and complete a rotation
- Two rotation modes: `graceful` (grace period, two active secrets) and `emergency` (immediate invalidation, one secret)
- Server-generated 32-byte random secrets, returned exactly once in the rotation response
- Multi-signature HTTP header in Stripe-style (`sha256=<hex1>, sha256=<hex2>`)
- Lazy expiration of the secondary secret at dispatch time (no scheduler)
- Encryption-at-rest of the secondary secret via the existing `SecretEncryptionConverter`
- UI: new "Secret" card in the webhook drawer, rotation modal, one-time disclosure modal
- Prometheus metrics and structured log audit trail
- Unit, integration, and E2E tests

Out of scope:
- Rotation of the HMAC algorithm (stays `HmacSHA256`)
- User-provided secrets during rotation (always server-generated; manual edit via existing modal remains as escape hatch)
- Automatic scheduled expiration via a background job (lazy expiration only)
- Alerting on long-running rotations (warning UI only)
- Per-operation RBAC (reuses the existing webhook admin role)

## Wire protocol

During rotation the dispatcher sends **one** `X-Keycloak-Signature` header containing both signatures, comma-separated, Stripe-style:

```
X-Keycloak-Signature: sha256=<hex_primary>, sha256=<hex_secondary>
```

When no rotation is in progress, the header carries a single signature (unchanged from today):

```
X-Keycloak-Signature: sha256=<hex>
```

Rationale: Svix, Stripe, Convoy, and Hookdeck all use a single header with delimited multi-signatures. A single header is simpler for consumers (one split + iterate vs. branching on header presence) and matches the industry convention.

**Ordering:** the newest secret is listed first. The first signature is the one the consumer "should" verify with; the second is the compatibility fallback for consumers still holding the old key.

**Primary semantics:** the new secret becomes primary immediately when rotation starts. The old secret moves to `secondary`. On completion (manual or lazy expiration), the secondary is dropped and the primary stays. This is the Stripe model — "complete" is a cleanup, not a swap.

## Data model

### Entity changes — `WebhookEntity.java`

```java
// existing
@Column(name = "SECRET")
@Convert(converter = SecretEncryptionConverter.class)
private String secret;                  // primary, always present

// new
@Column(name = "SECONDARY_SECRET")
@Convert(converter = SecretEncryptionConverter.class)
private String secondarySecret;         // null when no rotation is in progress

@Column(name = "ROTATION_EXPIRES_AT")
private Long rotationExpiresAt;         // epoch millis; null when no rotation

@Column(name = "ROTATION_STARTED_AT")
private Long rotationStartedAt;         // epoch millis; for audit + UI warning
```

Both `secret` and `secondarySecret` use the existing `SecretEncryptionConverter` — AES-256-GCM encryption-at-rest is transparent and inherited automatically.

### Invariants

- `secondarySecret != null` ⟺ `rotationExpiresAt != null` ⟺ `rotationStartedAt != null`
- `secret` (primary) is never null for an active webhook
- `rotationExpiresAt > rotationStartedAt` whenever both are set

### Derived states (not stored)

| State | Condition | Meaning |
|---|---|---|
| `ACTIVE` | `secondarySecret == null` | Normal single-secret operation |
| `ROTATING` | `secondarySecret != null && rotationExpiresAt > now` | Dispatcher signs with both secrets |
| `EXPIRED_ROTATION` | `secondarySecret != null && rotationExpiresAt <= now` | Transient; cleaned up lazily on next dispatch or list sweep |

### Liquibase changeset — `jpa-changelog-webhook-1.2.0.xml`

```xml
<changeSet id="webhook-1.2.0-1" author="montell">
  <addColumn tableName="WEBHOOK">
    <column name="SECONDARY_SECRET" type="VARCHAR(512)"/>
    <column name="ROTATION_EXPIRES_AT" type="BIGINT"/>
    <column name="ROTATION_STARTED_AT" type="BIGINT"/>
  </addColumn>
</changeSet>
```

Added to the master changelog `jpa-changelog-webhook.xml`. Existing webhooks stay `ACTIVE` (all three new columns default to `NULL`).

## REST API

### `POST /realms/{realm}/webhooks/{id}/rotate-secret`

Starts a rotation. The secret value in the response is the only time the plaintext is ever disclosed.

**Request body:**
```json
{
  "mode": "graceful" | "emergency",
  "graceDays": 7
}
```

- `mode` is required.
- `graceDays` is optional; defaults to `7` when `mode=graceful`, ignored when `mode=emergency`. When present, allowed range is 1..30.

**Response `200 OK`:**
```json
{
  "newSecret": "base64-encoded-32-byte-random",
  "rotationExpiresAt": 1712764800000,
  "mode": "graceful"
}
```

`rotationExpiresAt` is `null` in emergency mode.

**Logic:**

- **graceful:**
  - If `secondarySecret != null` → **`409 Conflict`** body `{"error": "rotation_in_progress", "expiresAt": <ms>}`. The user must complete or emergency-rotate first.
  - Otherwise: generate `newSecret = Base64(SecureRandom 32 bytes)`, then atomically set:
    - `secondarySecret = <old primary>`
    - `secret = <newSecret>`
    - `rotationStartedAt = now`
    - `rotationExpiresAt = now + graceDays * 86_400_000`
- **emergency:**
  - Ignores current state (works from both `ACTIVE` and `ROTATING`). Generates `newSecret`, then:
    - `secret = <newSecret>`
    - `secondarySecret = null`
    - `rotationStartedAt = null`
    - `rotationExpiresAt = null`
  - Any in-flight secondary is **discarded**. This is the intended semantics — emergency means "the current secret is compromised, invalidate everything now".

**Errors:**
- `400 Bad Request` — missing `mode`, unknown `mode`, `graceDays` out of range
- `404 Not Found` — unknown webhook id
- `409 Conflict` — graceful rotation on a webhook already rotating

### `POST /realms/{realm}/webhooks/{id}/complete-rotation`

Manually ends an in-progress rotation.

**Response `204 No Content`.**

**Logic:**
- If `secondarySecret == null` → **`409 Conflict`** body `{"error": "no_rotation_in_progress"}`
- Otherwise: `secondarySecret = null`, `rotationExpiresAt = null`, `rotationStartedAt = null`. Primary is untouched.

### `GET /realms/{realm}/webhooks/` and `GET /{id}` — response extension

The existing DTO is extended with three new fields. **Secret values are never exposed** — only booleans and timestamps.

```json
{
  "id": "...",
  "url": "...",
  "hasSecret": true,
  "hasSecondarySecret": true,
  "rotationExpiresAt": 1712764800000,
  "rotationStartedAt": 1712160000000
}
```

`hasSecondarySecret`, `rotationExpiresAt`, `rotationStartedAt` are `null`/`false` when no rotation is in progress.

### Authorization

All three endpoints require the existing webhook admin role (same as `PUT /{id}`). No new role is introduced.

## Dispatcher changes

### Lazy expiration

Before signing, the dispatcher checks whether the rotation has expired. This replaces any need for a scheduled job.

```java
// WebhookEntity
public boolean expireRotationIfDue(long now) {
    if (secondarySecret != null && rotationExpiresAt != null && rotationExpiresAt <= now) {
        secondarySecret = null;
        rotationExpiresAt = null;
        rotationStartedAt = null;
        return true;   // caller must persist
    }
    return false;
}
```

**Who calls it:**
1. The worker that loads the entity before dispatch (e.g. `WebhookDispatchWorker`). If the method returns `true`, the worker persists the update in a short transaction **before** signing.
2. Opportunistically on `GET /webhooks/` (list endpoint): for each webhook already being loaded, call `expireRotationIfDue`. Cost is negligible (we are already iterating), benefit is that the UI never lingers on `EXPIRED_ROTATION` state for webhooks that receive no traffic.

**Concurrency:** JPA optimistic locking on the existing `WebhookEntity.version` field handles concurrent expirations. If two workers race, one wins and the other re-reads fresh state where `secondarySecret` is already null. No double-dispatch, no lost events.

### Signature header construction

`HttpWebhookSender.java` currently sets one header from one secret. Replace with a helper that handles zero, one, or two secrets:

```java
// HmacSigner (or HttpWebhookSender)
static String buildSignatureHeader(String payload, String primary, String secondary, String algorithm) {
    if (primary == null || primary.isBlank()) return null;
    String primarySig = "sha256=" + HmacSigner.sign(payload, primary, algorithm);
    if (secondary == null || secondary.isBlank()) {
        return primarySig;
    }
    String secondarySig = "sha256=" + HmacSigner.sign(payload, secondary, algorithm);
    return primarySig + ", " + secondarySig;
}
```

Call site:
```java
String signatureHeader = buildSignatureHeader(payloadJson, secret, secondarySecret, algorithm);
if (signatureHeader != null) {
    builder.header("X-Keycloak-Signature", signatureHeader);
}
```

**Notes:**
- The `sha256=` prefix is hardcoded. A TODO comment should mark that if other algorithms are supported later, the prefix must be derived from `algorithm`.
- `HmacSigner.sign()` stays stateless and unchanged. It already accepts a single secret and returns lowercase hex. `buildSignatureHeader` is the only point that orchestrates two signatures.
- `HttpWebhookSender.send(...)` signature is extended with a new `String secondarySecret` parameter. Callers that don't have a secondary pass `null`.

### What stays the same

- `HmacSigner.sign()` — no changes
- `SecretEncryptionConverter` — applied to both fields automatically via `@Convert`
- Consumer-side verification — out of scope (consumer is not our code), but the user guide must document the "iterate and accept if any matches" pattern

## UI

### `WebhookDrawer.tsx` — new "Secret" card

Rendered below the existing drawer sections (delivery history, circuit).

**ACTIVE state:**
- Green `Label` "Active"
- Primary button "Rotate secret" (enabled)
- Danger button "Emergency rotate" (always enabled)

**ROTATING state:**
- Orange `Label` "Rotating"
- Text "Secondary expires {formatDate(rotationExpiresAt)}"
- If `now - rotationStartedAt > 14 days`: inline warning `Alert variant="warning"` "Rotation in progress for over 14 days"
- Primary button "Rotate secret" **disabled**, with tooltip "Complete current rotation before starting a new one"
- Secondary button "Complete rotation now"
- Danger button "Emergency rotate"

### `SecretRotationModal.tsx` — new component

One component, two modes via prop.

**`mode="graceful"`:**
- Title: "Rotate secret"
- Body: short explanation + `FormSelect` for `graceDays` with options 1 / 7 / 30 (default 7)
- Inline `Alert variant="info"`: "The current secret will remain valid as a fallback until the chosen expiry. Update your endpoints before then."
- Footer: Cancel / "Rotate" (primary)

**`mode="emergency"`:**
- Title: "Emergency rotate secret"
- Body: `Alert variant="danger"` "This action invalidates the current secret IMMEDIATELY. Webhooks verified with the old secret will fail until the new secret is distributed. Use only when the current secret has been compromised."
- Typed-confirmation input: user must type `rotate` to enable the submit button (same pattern as the delete confirmation)
- Footer: Cancel / "Emergency rotate" (danger)

On submit: `POST /rotate-secret` with the appropriate payload. On 200, close this modal and open `SecretDisclosureModal`.

### `SecretDisclosureModal.tsx` — one-time secret display

- `Alert variant="warning"` "Copy this secret now. You will not be able to view it again. If you lose it, you will need to rotate again."
- `ClipboardCopy` (read-only) containing the new secret
- `Checkbox` "I have copied the secret to a safe place" — the Done button is disabled until checked
- Footer: "Done" (primary, disabled until checkbox)
- On close: refresh the webhook from the server so `hasSecondarySecret` / `rotationExpiresAt` propagate to the drawer

The secret is held in React state only — never persisted, never logged, never stored in `localStorage`.

### `src/lib/api.ts` — new methods

```ts
async rotateSecret(
  id: string,
  mode: 'graceful' | 'emergency',
  graceDays?: number,
): Promise<{ newSecret: string; rotationExpiresAt: number | null; mode: string }>;

async completeRotation(id: string): Promise<void>;
```

`WebhookDto` (TypeScript) is extended with `hasSecondarySecret: boolean`, `rotationExpiresAt: number | null`, `rotationStartedAt: number | null`.

### What stays the same

- `WebhookModal.tsx` (create/edit): no changes to the flow. In edit mode the "Secret" field remains editable as today — an escape hatch equivalent to a hard replace (no secondary, no grace period). A hint line points to the drawer for zero-downtime rotation.
- `WebhookTable.tsx`: no new columns. Rotation state is visible only by opening the drawer — keeping the table signal-to-noise ratio high.

## Observability

### Prometheus metrics — `WebhookMetrics.java`

Two new metrics:

```java
secretRotations =
    Counter.build()
        .name("webhook_secret_rotations_total")
        .help("Webhook secret rotations performed")
        .labelNames("realm", "mode")    // mode: graceful | emergency | expired
        .register(registry);

rotationsInProgress =
    Gauge.build()
        .name("webhook_rotations_in_progress")
        .help("Webhooks currently in rotation (secondary secret active)")
        .labelNames("realm")
        .register(registry);
```

Helper methods:

```java
public void recordSecretRotation(String realm, String mode) { ... }
public void setRotationsInProgress(String realm, int count) { ... }
```

**Semantics:**
- `webhook_secret_rotations_total{mode="graceful"}` — incremented on each successful `POST /rotate-secret` with `mode=graceful`
- `webhook_secret_rotations_total{mode="emergency"}` — same for emergency
- `webhook_secret_rotations_total{mode="expired"}` — incremented when `expireRotationIfDue` transitions a webhook out of `ROTATING` (from either the dispatcher path or the list-endpoint sweep)
- `webhook_rotations_in_progress` — refreshed on `GET /webhooks/` from a `SELECT COUNT(*) WHERE secondary_secret IS NOT NULL GROUP BY realm` query. Refresh-on-list is chosen over imperative updates to avoid drift across restarts and concurrent operations.

**Manual completion is intentionally not counted** in `webhook_secret_rotations_total`. The counter measures rotation lifecycle transitions initiated by secret change (`graceful`, `emergency`) or by timer (`expired`). Manual completion is a cleanup of an already-started rotation and is captured in the audit log but not in the metric. This keeps the `mode` label set closed and the rate of the counter interpretable as "new secrets issued".

### Audit trail — structured logs

Structured SLF4J logs at `INFO`, matching the pattern already used by the circuit breaker. Three event types:

- `webhook.secret.rotated` — on `POST /rotate-secret`. Fields: `realm`, `webhookId`, `mode`, `graceDays` (for graceful), `userId`.
- `webhook.rotation.completed` — on `POST /complete-rotation`. Fields: `realm`, `webhookId`, `userId`.
- `webhook.rotation.expired` — when `expireRotationIfDue` cleans up a webhook. Fields: `realm`, `webhookId`. No `userId` (automatic).

We do not use Keycloak's `EventBuilder`: it is designed for auth events and has no `CUSTOM` type, and the rest of the provider already logs operational events via SLF4J.

### What we don't add

- No pre-configured Prometheus alerts for long-running rotations. The UI warning at 14 days covers the user-facing case; operators can author alerts on the metrics if they want to.
- No new Grafana dashboard. The new metrics join the existing webhook metrics dashboard.

## Testing

### Unit tests

**`HmacSignerTest.java`** (extension):
- `buildSignatureHeader` with primary only → `sha256=<hex>`
- `buildSignatureHeader` with primary + secondary → `sha256=<hex1>, sha256=<hex2>`, correct order, correct separator
- `buildSignatureHeader` with primary null or blank → returns `null` (no header emitted)
- `buildSignatureHeader` with blank secondary → treated as absent (primary only)
- Roundtrip: build header, split it back, verify both signatures match the payload independently

**`WebhookEntityTest.java`:**
- `expireRotationIfDue` with `secondarySecret == null` → `false`, state unchanged
- `expireRotationIfDue` with `rotationExpiresAt > now` → `false`, state unchanged
- `expireRotationIfDue` with `rotationExpiresAt <= now` → `true`, all three rotation fields cleared
- Called twice in a row → first `true`, second `false` (idempotent)

**`WebhooksResourceTest.java`** (extension):
- `POST /rotate-secret` graceful on `ACTIVE` → 200, response contains `newSecret`, entity state correct (primary = newSecret, secondary = old primary, expiry ≈ now + 7 days)
- `POST /rotate-secret` graceful on `ROTATING` → 409 `rotation_in_progress`
- `POST /rotate-secret` emergency on `ACTIVE` → 200, secondary null
- `POST /rotate-secret` emergency on `ROTATING` → 200, previous secondary discarded, new primary in place
- `POST /rotate-secret` with `graceDays=0` or `graceDays=31` → 400
- `POST /rotate-secret` with unknown `mode` → 400
- `POST /complete-rotation` on `ACTIVE` → 409 `no_rotation_in_progress`
- `POST /complete-rotation` on `ROTATING` → 204, entity returns to `ACTIVE`
- `GET /webhooks/` with a webhook whose rotation is expired in the DB → sweep triggers, response reports `hasSecondarySecret=false`
- `GET /webhooks/` never exposes `secret` or `secondarySecret` plaintext (only booleans + timestamps)
- All three endpoints require the webhook admin role; without it → 403

### Integration tests

**`JpaWebhookProviderIT.java`** (extension):
- Create webhook, start graceful rotation → read `SECONDARY_SECRET` column directly via JDBC → value is ciphertext, not plaintext (verifies encryption-at-rest on the new field)
- Re-read the same webhook via the provider → `getSecret()` and `getSecondarySecret()` return the original plaintext values
- Liquibase migration from 1.1.0 → 1.2.0: new columns added, pre-existing webhooks stay in `ACTIVE` state (all three rotation fields default to `NULL`)

**`HttpWebhookSender` integration** (unit-style if no IT exists):
- Webhook in `ACTIVE` → outgoing request has one `X-Keycloak-Signature` value
- Webhook in `ROTATING` → outgoing request has two comma-separated signatures, primary first
- Webhook with expired rotation → dispatcher invokes `expireRotationIfDue`, persists, then signs with primary only
- Consumer simulation: iterate signatures, accept if any matches — must accept with both old and new secret during rotation

### E2E — `e2e/tests/07-secret-rotation.spec.ts` (new)

**Happy path (graceful):**
1. Create a webhook via API (fixture)
2. Navigate to the UI, open the drawer for the webhook
3. Secret card shows "Active" badge
4. Click "Rotate secret" → modal appears, pick 7 days, click Rotate
5. `SecretDisclosureModal` opens → assert the new secret is present in the `ClipboardCopy`, check the acknowledgement checkbox, click Done
6. Drawer now shows "Rotating" badge and the expiry timestamp
7. API oracle: `GET /webhooks/{id}` returns `hasSecondarySecret=true`, `rotationExpiresAt > now`
8. Click "Complete rotation now", confirm
9. Drawer returns to "Active"; API oracle: `hasSecondarySecret=false`

**Emergency path:**
1. Create a webhook, start a graceful rotation (via API for speed)
2. Open the drawer, click "Emergency rotate"
3. In the confirmation modal type `rotate`, submit
4. `SecretDisclosureModal` shows the new secret; acknowledge and close
5. API oracle: `hasSecondarySecret=false` (the pending secondary was discarded)

**Double-rotation is blocked:**
1. Webhook in `ROTATING` state (set up via API)
2. Open the drawer → "Rotate secret" button is `isDisabled`, tooltip visible
3. (The 409 response itself is covered in unit tests, not E2E)

**Not tested in E2E:**
- Actual HTTP delivery to an external endpoint — covered by existing dispatcher tests
- Lazy expiration — requires clock manipulation, lives in unit/integration tests with injected clock

### Test infrastructure

- `webhookAdminToken` fixture in `e2e/fixtures/ports.ts` is reused as the API oracle
- Auto-cleanup webhook fixture in `ports.ts` (added in Phase 5 of the e2e cleanup refactor) handles teardown
- No new fixtures are needed
