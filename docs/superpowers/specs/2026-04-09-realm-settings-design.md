# Realm Settings Design

## Goal

Expose all realm-level webhook configuration (retention periods and circuit breaker parameters) via a dedicated API endpoint and make them editable from the existing Settings page in the UI.

## Architecture

On-demand fetch: the UI loads realm settings once at startup and persists changes via `PUT`. No DB schema changes — values are stored as Keycloak realm attributes, the same mechanism already used by `RetentionCleanupTask` and the webhook dispatcher.

**Tech Stack:** Java JAX-RS (backend), React + PatternFly v5 (frontend), OpenAPI 3.1 (spec).

---

## Backend

### New endpoints

```
GET  /realms/{realm}/webhooks/realm-settings
PUT  /realms/{realm}/webhooks/realm-settings
```

Authorization: `requireManageEvents()` — same as all other webhook endpoints.

### GET logic

Read the 4 realm attributes using the existing `getRealmIntAttribute` helper, returning defaults when absent:

| Field | Realm attribute | Default |
|-------|----------------|---------|
| `retentionEventDays` | `_webhook.retention.events.days` | 30 |
| `retentionSendDays` | `_webhook.retention.sends.days` | 90 |
| `circuitFailureThreshold` | `_webhook.circuit.failure_threshold` | 5 |
| `circuitOpenSeconds` | `_webhook.circuit.open_seconds` | 60 |

### PUT logic

1. Deserialize body into `RealmSettingsRepresentation`.
2. Validate: each present field must be an integer > 0. Return **400** on failure with message `"Field X must be a positive integer"`.
3. Call `realm.setAttribute(key, String.valueOf(value))` for each field present in the body.
4. Return **200** with the full updated settings (same shape as GET response).

Patch semantics: fields absent from the body are left unchanged. A `null` field value is treated as absent.

### Response schema

```json
{
  "retentionEventDays": 30,
  "retentionSendDays": 90,
  "circuitFailureThreshold": 5,
  "circuitOpenSeconds": 60
}
```

---

## Frontend

### New type (`types.ts`)

```ts
export interface RealmSettings {
  retentionEventDays: number;
  retentionSendDays: number;
  circuitFailureThreshold: number;
  circuitOpenSeconds: number;
}
```

### API client (`webhookApi.ts`)

```ts
getRealmSettings(): Promise<RealmSettings>
updateRealmSettings(patch: Partial<RealmSettings>): Promise<RealmSettings>
```

Both map to `GET /realm-settings` and `PUT /realm-settings`.

### App.tsx changes

- `useEffect` on mount: call `api.getRealmSettings()`, store in `realmSettings` state.
- Pass `realmSettings`, `realmSettingsLoading`, `realmSettingsError`, and `onUpdateRealmSettings` callback to `SettingsPage`.
- `onUpdateRealmSettings`: calls `api.updateRealmSettings(patch)`, updates state on success, shows error on failure.

### SettingsPage changes

New card **"Configurazione server"** added below the existing cards. Contains 4 numeric inputs using the existing `RetryInput` component pattern (on-blur commit, positive-integer validation, error message inline):

| Label | Field | Placeholder |
|-------|-------|-------------|
| Event retention (days) | `retentionEventDays` | 30 (default server) |
| Send retention (days) | `retentionSendDays` | 90 (default server) |
| Circuit failure threshold | `circuitFailureThreshold` | 5 (default server) |
| Circuit open duration (seconds) | `circuitOpenSeconds` | 60 (default server) |

While loading: `Spinner` inside the card body.  
On GET error: inline `Alert variant="danger"` with error message.  
On PUT error: inline `Alert variant="danger"`, input value rolled back to the previous server value.

---

## OpenAPI

Add path `/realm-settings` under the existing webhook paths base:

```yaml
/realm-settings:
  get:
    operationId: getRealmSettings
    summary: Get realm-level webhook configuration
    tags: [Settings]
    responses:
      "200":
        description: Realm settings
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/RealmSettings"
      "401":
        $ref: "#/components/responses/Unauthorized"
      "403":
        $ref: "#/components/responses/Forbidden"
  put:
    operationId: updateRealmSettings
    summary: Update realm-level webhook configuration
    tags: [Settings]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/RealmSettings"
    responses:
      "200":
        description: Updated realm settings
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/RealmSettings"
      "400":
        $ref: "#/components/responses/BadRequest"
      "401":
        $ref: "#/components/responses/Unauthorized"
      "403":
        $ref: "#/components/responses/Forbidden"
```

New schema:
```yaml
RealmSettings:
  type: object
  properties:
    retentionEventDays:
      type: integer
      description: Days to retain webhook events (default 30)
    retentionSendDays:
      type: integer
      description: Days to retain webhook send records (default 90)
    circuitFailureThreshold:
      type: integer
      description: Number of failures before circuit opens (default 5)
    circuitOpenSeconds:
      type: integer
      description: Seconds the circuit stays open before half-open (default 60)
```

---

## Error Handling

| Situation | Backend response | Frontend behavior |
|-----------|-----------------|-------------------|
| GET — realm attributes not set | 200 with defaults | Inputs show default values |
| PUT — field ≤ 0 | 400 "Field X must be a positive integer" | Inline alert, value rolled back |
| PUT — non-numeric field | 400 | Inline alert, value rolled back |
| Network error (GET) | — | Spinner stops, danger alert shown in card |
| Network error (PUT) | — | Danger alert shown in card, value rolled back |

---

## Testing

### Backend unit (`WebhooksResourceTest.java`)

New nested classes `GetRealmSettings` and `UpdateRealmSettings`:
- GET returns all 4 defaults when no realm attributes are set
- GET returns configured values when attributes are present
- PUT saves all 4 fields and returns updated values
- PUT with a field ≤ 0 returns 400
- PUT with a non-integer field returns 400

### Frontend unit

`SettingsPage.test.tsx` additions:
- Renders the "Configurazione server" card with values from props
- Calls `onUpdateRealmSettings` with correct field+value on blur
- Shows Spinner while loading
- Shows danger Alert when GET error is provided

### E2E (`e2e/tests/09-realm-settings.spec.ts`)

1. Navigate to Settings page
2. Verify the 4 fields show the default values (30, 90, 5, 60)
3. Change `retentionEventDays` to 45
4. Reload the page
5. Verify `retentionEventDays` is still 45 after reload
