# Keycloak Webhook Provider

A production-ready Keycloak SPI that delivers webhook notifications for realm events — login, logout, user creation, role changes, and more — with circuit breaker, HMAC signing, async dispatch, and a full REST management API.

Built for Keycloak 26.x.

## Features

- **Async dispatch** — events are queued and sent without blocking the Keycloak request thread
- **Automatic retry** with exponential backoff
- **Circuit breaker** — stops hammering unreachable endpoints; auto-recovers
- **HMAC signing** — `X-Webhook-Signature` header (HmacSHA256 or HmacSHA1) for payload verification
- **Event filtering** — subscribe to specific event types per webhook
- **Send history** — every delivery attempt is logged (status, duration, error)
- **REST API** — 16 endpoints to manage webhooks, inspect history, control circuit breakers
- **Persistence** — PostgreSQL via JPA/Liquibase (uses Keycloak's existing datasource)

## Requirements

- Keycloak 26.x
- PostgreSQL (Keycloak's default datasource)
- Java 17 (build only)

## Installation

### Option 1: Download pre-built JAR

Download `keycloak-webhook-provider-*.jar` from the [Releases](https://github.com/monte97/keycloak-webhook-provider/releases) page and place it in Keycloak's `providers/` directory.

### Option 2: Use with keycloak-kickstart

[keycloak-kickstart](https://github.com/monte97/keycloak-kickstart) includes the JAR pre-configured. Clone, configure, and `docker compose up`.

### Option 3: Build from source

```bash
# Requires Java 17 and Maven
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

| Prefix | Examples |
|--------|---------|
| `access.*` | `access.LOGIN`, `access.LOGOUT`, `access.REGISTER`, `access.LOGIN_ERROR` |
| `admin.*` | `admin.USER-CREATE`, `admin.USER-DELETE`, `admin.CLIENT_ROLE_MAPPING-CREATE`, `admin.GROUP_MEMBERSHIP-CREATE` |

Use `*` to subscribe to all events of a category (not recommended in production — high volume).

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

## REST API

All endpoints are under `/auth/realms/{realm}/webhooks`.

Authentication: Bearer token with `manage-realm` (write) or `view-realm` (read) role.

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
# Unit tests (82 tests, no Docker required)
mvn test -Dmaven.failsafe.skip=true

# All tests including integration (requires Docker for Testcontainers)
mvn verify
```

## License

MIT License — Copyright (c) 2026 Francesco Montelli

---

Built by [Francesco Montelli](https://montelli.dev) · Part of the [Keycloak SSO Setup](https://montelli.dev/servizi/keycloak) productized service
