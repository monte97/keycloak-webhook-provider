# Keycloak Webhook Provider

A production-ready Keycloak SPI that delivers webhook notifications for realm events — login, logout, user creation, role changes, and more — with circuit breaker, HMAC signing, async dispatch, a full REST management API, and an embedded admin UI.

Built for Keycloak 26.x.

## Features

- **Async dispatch** — events are queued and sent without blocking the Keycloak request thread
- **Automatic retry** with exponential backoff
- **Circuit breaker** — stops hammering unreachable endpoints; auto-recovers
- **HMAC signing** — `X-Webhook-Signature` header (HmacSHA256 or HmacSHA1) for payload verification
- **Event filtering** — subscribe to specific event types per webhook
- **Send history** — every delivery attempt is logged (status, duration, error)
- **REST API** — 18 endpoints to manage webhooks, inspect history, control circuit breakers
- **Admin UI** — embedded React + PatternFly SPA for browser-based management
- **Auto-provisioning** — OIDC client (`webhook-ui`) created automatically on first UI access
- **Persistence** — PostgreSQL via JPA/Liquibase (uses Keycloak's existing datasource)

## Requirements

- Keycloak 26.x
- PostgreSQL (Keycloak's default datasource)
- Java 17 (build only)
- Node.js 20+ (frontend build only)

## Installation

### Option 1: Download pre-built JAR

Download `keycloak-webhook-provider-*.jar` from the [Releases](https://github.com/monte97/keycloak-webhook-provider/releases) page and place it in Keycloak's `providers/` directory.

### Option 2: Use with keycloak-kickstart

[keycloak-kickstart](https://github.com/monte97/keycloak-kickstart) includes the JAR pre-configured. Clone, configure, and `docker compose up`.

### Option 3: Build from source

```bash
# Build the frontend (one-time, or after UI changes)
cd webhook-ui && npm ci && npm run build && cd ..

# Build the JAR (includes the compiled UI assets)
mvn package -Dmaven.failsafe.skip=true
# Output: target/keycloak-webhook-provider-*.jar
```

Copy the JAR to Keycloak's `providers/` directory and rebuild:

```bash
/opt/keycloak/bin/kc.sh build
```

## Configuration

Webhooks are configured per realm. You can register them via the REST API or — if you use keycloak-kickstart — via the seed YAML:

```yaml
realms:
  - name: my-realm
    webhooks:
      - url: "https://your-service.example.com/webhook"
        events:
          - access.LOGIN
          - access.LOGOUT
          - admin.USER-DELETE
          - admin.GROUP_MEMBERSHIP-CREATE
```

### Event types

Events follow a `category.ACTION` pattern:

- **Access events**: `access.{EventType}` — user-facing events (login, logout, registration, token operations)
- **Admin events**: `admin.{ResourceType}-{OperationType}` — realm management events (user created, role assigned, client updated)

Use `*` to subscribe to all events, `access.*` or `admin.*` for a whole category. Exact strings and Java regexes (e.g. `admin.USER-.*`) are also supported.

#### Access events (`access.*`)

All 96 values from `org.keycloak.events.EventType` (Keycloak 26.x):

| Event type |
|------------|
| `access.AUTHREQID_TO_TOKEN` |
| `access.AUTHREQID_TO_TOKEN_ERROR` |
| `access.CLIENT_DELETE` |
| `access.CLIENT_DELETE_ERROR` |
| `access.CLIENT_INFO` |
| `access.CLIENT_INFO_ERROR` |
| `access.CLIENT_INITIATED_ACCOUNT_LINKING` |
| `access.CLIENT_INITIATED_ACCOUNT_LINKING_ERROR` |
| `access.CLIENT_LOGIN` |
| `access.CLIENT_LOGIN_ERROR` |
| `access.CLIENT_REGISTER` |
| `access.CLIENT_REGISTER_ERROR` |
| `access.CLIENT_UPDATE` |
| `access.CLIENT_UPDATE_ERROR` |
| `access.CODE_TO_TOKEN` |
| `access.CODE_TO_TOKEN_ERROR` |
| `access.CUSTOM_REQUIRED_ACTION` |
| `access.CUSTOM_REQUIRED_ACTION_ERROR` |
| `access.DELETE_ACCOUNT` |
| `access.DELETE_ACCOUNT_ERROR` |
| `access.EXECUTE_ACTIONS` |
| `access.EXECUTE_ACTIONS_ERROR` |
| `access.EXECUTE_ACTION_TOKEN` |
| `access.EXECUTE_ACTION_TOKEN_ERROR` |
| `access.FEDERATED_IDENTITY_LINK` |
| `access.FEDERATED_IDENTITY_LINK_ERROR` |
| `access.FEDERATED_IDENTITY_OVERRIDE_LINK` |
| `access.FEDERATED_IDENTITY_OVERRIDE_LINK_ERROR` |
| `access.GRANT_CONSENT` |
| `access.GRANT_CONSENT_ERROR` |
| `access.IDENTITY_PROVIDER_FIRST_LOGIN` |
| `access.IDENTITY_PROVIDER_FIRST_LOGIN_ERROR` |
| `access.IDENTITY_PROVIDER_LINK_ACCOUNT` |
| `access.IDENTITY_PROVIDER_LINK_ACCOUNT_ERROR` |
| `access.IDENTITY_PROVIDER_LOGIN` |
| `access.IDENTITY_PROVIDER_LOGIN_ERROR` |
| `access.IDENTITY_PROVIDER_POST_LOGIN` |
| `access.IDENTITY_PROVIDER_POST_LOGIN_ERROR` |
| `access.IDENTITY_PROVIDER_RESPONSE` |
| `access.IDENTITY_PROVIDER_RESPONSE_ERROR` |
| `access.IDENTITY_PROVIDER_RETRIEVE_TOKEN` |
| `access.IDENTITY_PROVIDER_RETRIEVE_TOKEN_ERROR` |
| `access.IMPERSONATE` |
| `access.IMPERSONATE_ERROR` |
| `access.INTROSPECT_TOKEN` |
| `access.INTROSPECT_TOKEN_ERROR` |
| `access.INVALID_SIGNATURE` |
| `access.INVALID_SIGNATURE_ERROR` |
| `access.INVITE_ORG` |
| `access.INVITE_ORG_ERROR` |
| `access.LOGIN` |
| `access.LOGIN_ERROR` |
| `access.LOGOUT` |
| `access.LOGOUT_ERROR` |
| `access.OAUTH2_DEVICE_AUTH` |
| `access.OAUTH2_DEVICE_AUTH_ERROR` |
| `access.OAUTH2_DEVICE_CODE_TO_TOKEN` |
| `access.OAUTH2_DEVICE_CODE_TO_TOKEN_ERROR` |
| `access.OAUTH2_DEVICE_VERIFY_USER_CODE` |
| `access.OAUTH2_DEVICE_VERIFY_USER_CODE_ERROR` |
| `access.OAUTH2_EXTENSION_GRANT` |
| `access.OAUTH2_EXTENSION_GRANT_ERROR` |
| `access.PERMISSION_TOKEN` |
| `access.PERMISSION_TOKEN_ERROR` |
| `access.PUSHED_AUTHORIZATION_REQUEST` |
| `access.PUSHED_AUTHORIZATION_REQUEST_ERROR` |
| `access.REFRESH_TOKEN` |
| `access.REFRESH_TOKEN_ERROR` |
| `access.REGISTER` |
| `access.REGISTER_ERROR` |
| `access.REGISTER_NODE` |
| `access.REGISTER_NODE_ERROR` |
| `access.REMOVE_CREDENTIAL` |
| `access.REMOVE_CREDENTIAL_ERROR` |
| `access.REMOVE_FEDERATED_IDENTITY` |
| `access.REMOVE_FEDERATED_IDENTITY_ERROR` |
| `access.REMOVE_TOTP` |
| `access.REMOVE_TOTP_ERROR` |
| `access.RESET_PASSWORD` |
| `access.RESET_PASSWORD_ERROR` |
| `access.RESTART_AUTHENTICATION` |
| `access.RESTART_AUTHENTICATION_ERROR` |
| `access.REVOKE_GRANT` |
| `access.REVOKE_GRANT_ERROR` |
| `access.SEND_IDENTITY_PROVIDER_LINK` |
| `access.SEND_IDENTITY_PROVIDER_LINK_ERROR` |
| `access.SEND_RESET_PASSWORD` |
| `access.SEND_RESET_PASSWORD_ERROR` |
| `access.SEND_VERIFY_EMAIL` |
| `access.SEND_VERIFY_EMAIL_ERROR` |
| `access.TOKEN_EXCHANGE` |
| `access.TOKEN_EXCHANGE_ERROR` |
| `access.UNREGISTER_NODE` |
| `access.UNREGISTER_NODE_ERROR` |
| `access.UPDATE_CONSENT` |
| `access.UPDATE_CONSENT_ERROR` |
| `access.UPDATE_CREDENTIAL` |
| `access.UPDATE_CREDENTIAL_ERROR` |
| `access.UPDATE_EMAIL` |
| `access.UPDATE_EMAIL_ERROR` |
| `access.UPDATE_PASSWORD` |
| `access.UPDATE_PASSWORD_ERROR` |
| `access.UPDATE_PROFILE` |
| `access.UPDATE_PROFILE_ERROR` |
| `access.UPDATE_TOTP` |
| `access.UPDATE_TOTP_ERROR` |
| `access.USER_DISABLED_BY_PERMANENT_LOCKOUT` |
| `access.USER_DISABLED_BY_PERMANENT_LOCKOUT_ERROR` |
| `access.USER_DISABLED_BY_TEMPORARY_LOCKOUT` |
| `access.USER_DISABLED_BY_TEMPORARY_LOCKOUT_ERROR` |
| `access.USER_INFO_REQUEST` |
| `access.USER_INFO_REQUEST_ERROR` |
| `access.VALIDATE_ACCESS_TOKEN` |
| `access.VALIDATE_ACCESS_TOKEN_ERROR` |
| `access.VERIFY_EMAIL` |
| `access.VERIFY_EMAIL_ERROR` |
| `access.VERIFY_PROFILE` |
| `access.VERIFY_PROFILE_ERROR` |

#### Admin events (`admin.*`)

Format: `admin.{ResourceType}-{OperationType}`

**Operations** (4): `CREATE`, `UPDATE`, `DELETE`, `ACTION`

**Resource types** (36 values from `org.keycloak.events.admin.ResourceType`):

| Resource type | Example event types |
|---------------|---------------------|
| `AUTHENTICATOR_CONFIG` | `admin.AUTHENTICATOR_CONFIG-CREATE` |
| `AUTH_EXECUTION` | `admin.AUTH_EXECUTION-CREATE` |
| `AUTH_EXECUTION_FLOW` | `admin.AUTH_EXECUTION_FLOW-CREATE` |
| `AUTH_FLOW` | `admin.AUTH_FLOW-CREATE` |
| `AUTHORIZATION_POLICY` | `admin.AUTHORIZATION_POLICY-CREATE` |
| `AUTHORIZATION_RESOURCE` | `admin.AUTHORIZATION_RESOURCE-CREATE` |
| `AUTHORIZATION_RESOURCE_SERVER` | `admin.AUTHORIZATION_RESOURCE_SERVER-UPDATE` |
| `AUTHORIZATION_SCOPE` | `admin.AUTHORIZATION_SCOPE-CREATE` |
| `CLIENT` | `admin.CLIENT-CREATE`, `admin.CLIENT-UPDATE`, `admin.CLIENT-DELETE` |
| `CLIENT_INITIAL_ACCESS_MODEL` | `admin.CLIENT_INITIAL_ACCESS_MODEL-CREATE` |
| `CLIENT_ROLE` | `admin.CLIENT_ROLE-CREATE`, `admin.CLIENT_ROLE-DELETE` |
| `CLIENT_ROLE_MAPPING` | `admin.CLIENT_ROLE_MAPPING-CREATE`, `admin.CLIENT_ROLE_MAPPING-DELETE` |
| `CLIENT_SCOPE` | `admin.CLIENT_SCOPE-CREATE` |
| `CLIENT_SCOPE_CLIENT_MAPPING` | `admin.CLIENT_SCOPE_CLIENT_MAPPING-CREATE` |
| `CLIENT_SCOPE_MAPPING` | `admin.CLIENT_SCOPE_MAPPING-CREATE` |
| `CLUSTER_NODE` | `admin.CLUSTER_NODE-CREATE` |
| `COMPONENT` | `admin.COMPONENT-CREATE` |
| `CUSTOM` | `admin.CUSTOM-ACTION` |
| `GROUP` | `admin.GROUP-CREATE`, `admin.GROUP-UPDATE`, `admin.GROUP-DELETE` |
| `GROUP_MEMBERSHIP` | `admin.GROUP_MEMBERSHIP-CREATE`, `admin.GROUP_MEMBERSHIP-DELETE` |
| `IDENTITY_PROVIDER` | `admin.IDENTITY_PROVIDER-CREATE` |
| `IDENTITY_PROVIDER_MAPPER` | `admin.IDENTITY_PROVIDER_MAPPER-CREATE` |
| `ORGANIZATION` | `admin.ORGANIZATION-CREATE` |
| `ORGANIZATION_MEMBERSHIP` | `admin.ORGANIZATION_MEMBERSHIP-CREATE` |
| `PROTOCOL_MAPPER` | `admin.PROTOCOL_MAPPER-CREATE` |
| `REALM` | `admin.REALM-UPDATE` |
| `REALM_ROLE` | `admin.REALM_ROLE-CREATE`, `admin.REALM_ROLE-DELETE` |
| `REALM_ROLE_MAPPING` | `admin.REALM_ROLE_MAPPING-CREATE`, `admin.REALM_ROLE_MAPPING-DELETE` |
| `REALM_SCOPE_MAPPING` | `admin.REALM_SCOPE_MAPPING-CREATE` |
| `REQUIRED_ACTION` | `admin.REQUIRED_ACTION-CREATE` |
| `REQUIRED_ACTION_CONFIG` | `admin.REQUIRED_ACTION_CONFIG-UPDATE` |
| `USER` | `admin.USER-CREATE`, `admin.USER-UPDATE`, `admin.USER-DELETE` |
| `USER_FEDERATION_MAPPER` | `admin.USER_FEDERATION_MAPPER-CREATE` |
| `USER_FEDERATION_PROVIDER` | `admin.USER_FEDERATION_PROVIDER-CREATE` |
| `USER_LOGIN_FAILURE` | `admin.USER_LOGIN_FAILURE-DELETE` |
| `USER_PROFILE` | `admin.USER_PROFILE-UPDATE` |
| `USER_SESSION` | `admin.USER_SESSION-DELETE` |

### HMAC signature verification

When a secret is set on a webhook, every request includes an `X-Webhook-Signature` header:

```
X-Webhook-Signature: sha256=<hmac-hex-digest>
```

Verify on your end:

```python
import hmac, hashlib

def verify(secret: str, body: bytes, signature_header: str) -> bool:
    algo, received = signature_header.split("=", 1)
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)
```

## Admin UI

The provider ships an embedded single-page application for managing webhooks from the browser. Each realm has its own independent UI instance:

```
http://localhost:8080/auth/realms/{realm}/webhooks/ui
```

For example, `/auth/realms/test/webhooks/ui` manages webhooks for the `test` realm, `/auth/realms/master/webhooks/ui` for `master`, and so on. Each UI authenticates against its own realm and only shows webhooks belonging to that realm.

Features:
- Create, edit, and delete webhooks
- Searchable event type dropdown with human-readable descriptions
- Circuit breaker status monitoring with manual reset
- Send test pings
- Authentication via Keycloak JS adapter (realm's own OIDC)

On first access to a realm's UI, the provider auto-creates a public OIDC client (`webhook-ui`) in that realm. No manual configuration is required.

**Tech stack:** React 18, PatternFly 5, TypeScript, Vite — compiled at build time and served as static assets from the JAR.

## REST API

All endpoints are under `/auth/realms/{realm}/webhooks`.

Authentication: Bearer token with `manage-realm` (write) or `view-realm` (read) role.

The full API is described in [`docs/openapi.yaml`](docs/openapi.yaml) (OpenAPI 3.1). You can use it to generate client SDKs with [openapi-generator](https://openapi-generator.tech/) or import it into tools like Swagger UI and Postman.

### Webhook management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List webhooks (paginated) |
| `GET` | `/count` | Count webhooks |
| `POST` | `/` | Create webhook |
| `GET` | `/{id}` | Get webhook |
| `PUT` | `/{id}` | Update webhook |
| `DELETE` | `/{id}` | Delete webhook |
| `GET` | `/{id}/secret` | Get webhook secret |

### Event and send history

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/{id}/events` | List events for webhook (paginated) |
| `GET` | `/{id}/sends` | List send attempts for webhook (paginated) |
| `GET` | `/events/{type}/{kcEventId}` | Look up event by Keycloak event ID |
| `GET` | `/sends/{type}/{kcEventId}` | Look up send attempts by Keycloak event ID |

### Circuit breaker

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/{id}/circuit` | Get circuit breaker status (CLOSED/OPEN/HALF_OPEN) |
| `POST` | `/{id}/circuit/reset` | Force reset to CLOSED |

### Delivery control

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/{id}/test` | Send a test ping to the webhook URL |
| `POST` | `/{id}/sends/{sid}/resend` | Resend a specific failed delivery |
| `POST` | `/{id}/resend-failed` | Bulk resend all failed deliveries |

### Admin UI

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ui` | Serve the admin UI (HTML) |
| `GET` | `/ui/{path}` | Serve UI static assets (JS, CSS, images) |

### Example: create a webhook

```bash
TOKEN=$(curl -s -X POST "https://keycloak.example.com/auth/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=<PASSWORD>&grant_type=password" \
  | jq -r '.access_token')

curl -X POST "https://keycloak.example.com/auth/realms/my-realm/webhooks/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-service.example.com/webhook",
    "secret": "your-signing-secret",
    "algorithm": "HmacSHA256",
    "enabled": true,
    "eventTypes": ["access.LOGIN", "access.LOGOUT", "admin.USER-DELETE"]
  }'
```

### Example: check circuit breaker status

```bash
curl "https://keycloak.example.com/auth/realms/my-realm/webhooks/<id>/circuit" \
  -H "Authorization: Bearer $TOKEN"
# {"state":"CLOSED","failureCount":0,"lastFailure":null}
```

## How it works

```
Keycloak event
      │
      ▼
WebhookEventListenerProvider
      │  enqueue
      ▼
WebhookEventDispatcher (async queue)
      │
      ├─ EventEnricher        → enriches event with auth context
      ├─ EventPatternMatcher  → filters against webhook subscriptions
      ├─ CircuitBreaker       → skips delivery if target is OPEN
      ├─ HttpWebhookSender    → HTTP POST with HMAC signature
      └─ ExponentialBackOff   → schedules retry on failure
```

Delivery attempts are persisted in PostgreSQL via JPA. Schema is managed by Liquibase and applied on Keycloak startup.

## Circuit breaker behavior

| State | Behavior |
|-------|----------|
| `CLOSED` | Normal delivery |
| `OPEN` | Delivery skipped; retried after recovery timeout |
| `HALF_OPEN` | One probe sent; transitions to CLOSED on success, OPEN on failure |

Thresholds and timeouts are configurable in the provider source.

## Tests

```bash
# Java unit tests (87 tests, no Docker required)
mvn test -Dmaven.failsafe.skip=true

# All Java tests including integration (requires Docker for Testcontainers)
mvn verify

# Frontend tests (24 tests)
cd webhook-ui && npm test
```

## License

MIT License — Copyright (c) 2026 Francesco Montelli

---

Built by [Francesco Montelli](https://montelli.dev) · Part of the [Keycloak SSO Setup](https://montelli.dev/servizi/keycloak) productized service
