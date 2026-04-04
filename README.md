# Keycloak Webhook Provider

A production-ready Keycloak SPI that delivers webhook notifications for realm events — login, logout, user creation, role changes, and more — with circuit breaker, HMAC signing, async dispatch, a full REST management API, and an embedded admin UI.

Built for Keycloak 26.x.

## Features

- **Async dispatch** — events are queued and sent without blocking the Keycloak request thread
- **Automatic retry** with exponential backoff
- **Circuit breaker** — stops hammering unreachable endpoints; auto-recovers
- **HMAC signing** — `X-Webhook-Signature` header (HmacSHA256 or HmacSHA1) for payload verification
- **Event filtering** — subscribe to specific event types per webhook (wildcards, regex)
- **Send history** — every delivery attempt is logged (status, duration, error)
- **REST API** — 18 endpoints for CRUD, history, circuit control, delivery operations
- **[Admin UI](webhook-ui/)** — embedded React + PatternFly SPA for browser-based management
- **Persistence** — PostgreSQL via JPA/Liquibase (uses Keycloak's existing datasource)

## Requirements

- Keycloak 26.x
- PostgreSQL (uses Keycloak's existing datasource — no separate DB needed)

## Installation

### 1. Get the JAR

**Pre-built** — download from [Releases](https://github.com/monte97/keycloak-webhook-provider/releases).

**Build from source:**

```bash
make package          # Docker-based, no local deps needed
make package BUILD=local  # requires Java 17 + Maven + Node 20
```

### 2. Deploy

**Bare-metal / VM:**

```bash
cp keycloak-webhook-provider-*.jar /opt/keycloak/providers/
/opt/keycloak/bin/kc.sh build
/opt/keycloak/bin/kc.sh start
```

**Docker Compose:**

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.0.0
    command: start-dev
    volumes:
      - ./keycloak-webhook-provider-*.jar:/opt/keycloak/providers/keycloak-webhook-provider.jar
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
    depends_on:
      - postgres

  postgres:
    image: postgres:18
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
```

The Liquibase migration runs automatically on first start and creates the `WEBHOOK`, `WEBHOOK_EVENT`, and `WEBHOOK_SEND` tables in Keycloak's schema.

### 3. Enable the event listener

In **Keycloak Admin Console**:

1. Select your realm
2. Go to **Realm Settings → Events → Event listeners**
3. Add `webhook-provider` to the list
4. Save

Or via Admin CLI:

```bash
kcadm.sh update events/config -r {realm} \
  -s 'eventsListeners=["jboss-logging","webhook-provider"]'
```

### 4. Create your first webhook

Open the Admin UI at `http://localhost:8080/realms/{realm}/webhooks/ui`, or use the REST API:

```bash
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=admin&grant_type=password" \
  | jq -r '.access_token')

curl -X POST "http://localhost:8080/realms/{realm}/webhooks/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-service.example.com/webhook",
    "secret": "your-signing-secret",
    "enabled": true,
    "eventTypes": ["access.LOGIN", "access.LOGOUT"]
  }'
```

## Configuration

Register webhooks via the [Admin UI](#admin-ui) or the REST API (see [Installation → step 4](#4-create-your-first-webhook)).

### Event types

Events follow a `category.ACTION` pattern:

- **Access events** (`access.*`): user-facing — login, logout, registration, token operations. 96 types from `org.keycloak.events.EventType`.
- **Admin events** (`admin.*`): management — `admin.{ResourceType}-{OperationType}`. 36 resource types x 4 operations (CREATE, UPDATE, DELETE, ACTION).

Use `*` for all events, `access.*` / `admin.*` for a category, or regex like `admin.USER-.*`.

See [`docs/openapi.yaml`](docs/openapi.yaml) for the full event type reference.

### HMAC signature verification

When a secret is configured, every delivery includes `X-Webhook-Signature: sha256=<hmac-hex-digest>`. Verify example:

```python
import hmac, hashlib

def verify(secret: str, body: bytes, signature_header: str) -> bool:
    algo, received = signature_header.split("=", 1)
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)
```

## Admin UI

Access at `http://localhost:8080/realms/{realm}/webhooks/ui`. Each realm has its own independent UI — no manual OIDC client setup required.

See [webhook-ui/README.md](webhook-ui/README.md) for details, screenshots, and development workflow.

## REST API

All endpoints under `/realms/{realm}/webhooks`. Bearer token with `manage-realm` (write) or `view-realm` (read) role.

Full spec: [`docs/openapi.yaml`](docs/openapi.yaml) (OpenAPI 3.1) — import into Swagger UI, Postman, or use with openapi-generator.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List webhooks (paginated) |
| `POST` | `/` | Create webhook |
| `GET` | `/{id}` | Get webhook |
| `PUT` | `/{id}` | Update webhook |
| `DELETE` | `/{id}` | Delete webhook |
| `GET` | `/count` | Count webhooks |
| `GET` | `/{id}/secret` | Secret status (configured or not) |
| `GET` | `/{id}/events` | Event history |
| `GET` | `/{id}/sends` | Delivery attempt history |
| `GET` | `/events/{type}/{kcEventId}` | Look up event by KC event ID |
| `GET` | `/sends/{type}/{kcEventId}` | Look up sends by KC event ID |
| `GET` | `/{id}/circuit` | Circuit breaker status |
| `POST` | `/{id}/circuit/reset` | Force reset to CLOSED |
| `POST` | `/{id}/test` | Send test ping |
| `POST` | `/{id}/sends/{sid}/resend` | Resend a specific delivery |
| `POST` | `/{id}/resend-failed` | Bulk resend failed deliveries |

See [Installation → step 4](#4-create-your-first-webhook) for a full example.

## Observability

### Prometheus metrics

A Prometheus-compatible scrape endpoint is exposed at:

```
GET /realms/{realm}/webhooks/metrics
```

Requires `view-realm` role. Metrics include counters for events received, dispatched, retried, exhausted, and dropped; a histogram for HTTP dispatch latency; a gauge for circuit breaker state per webhook; and a gauge for pending queue depth.

Key metric names:

| Metric | Type | Description |
|--------|------|-------------|
| `webhook_events_received_total` | Counter | Events enqueued for dispatch |
| `webhook_dispatches_total` | Counter | HTTP send attempts (labelled by success) |
| `webhook_dispatch_duration_seconds` | Histogram | HTTP send latency |
| `webhook_retries_total` | Counter | Retry attempts scheduled |
| `webhook_retries_exhausted_total` | Counter | Retry chains terminated without success |
| `webhook_events_dropped_total` | Counter | Events dropped due to full queue |
| `webhook_circuit_state` | Gauge | Circuit breaker state: 0=CLOSED, 2=OPEN |
| `webhook_queue_pending` | Gauge | Tasks currently pending in the executor |

### Structured audit logging

All significant dispatch events (received, success, failure, retry, circuit open/reset, drop) are written to stdout as structured JSON via JUL (`java.util.logging`). Each log entry is a single-line JSON object with fields `timestamp`, `event`, `realm`, `webhookId`, `eventType`, and relevant context fields.

Example output:

```json
{"timestamp":"2026-04-04T20:00:00Z","event":"dispatch.success","realm":"myrealm","webhookId":"abc123","eventType":"access.LOGIN","attempt":0,"url":"https://example.com/hook","httpStatus":200,"durationSeconds":0.042}
```

No log aggregation agent is required — the structured output is directly ingestible by Loki, Fluentd, or any JSON-aware log shipper.

### OpenTelemetry (future)

Full OpenTelemetry SDK integration (distributed traces, OTLP push) is not included in this release.
Keycloak 26 has experimental OTel support, but does not expose a documented API for SPI providers to access the initialized OTel instance. The structured logging approach used here (JUL with `JsonFormatter`) is forward-compatible with a future OTel JUL log bridge when that integration matures.

To enable OTel tracing in a future release, the recommended path is to use the OTel JUL log bridge, which allows the existing structured log output to flow into an OTel pipeline without changes to provider code.

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

Circuit breaker states: **CLOSED** (normal) → **OPEN** (delivery skipped after threshold failures) → **HALF_OPEN** (probe sent; success → CLOSED, failure → OPEN).

## Development

```bash
make help             # show all targets
make test-unit        # Java + UI unit tests
make test-integration # Testcontainers integration tests
make test             # all tests
make test-mutation    # Pitest mutation coverage
make openapi-lint     # validate OpenAPI spec
make openapi-diff     # check spec/code drift
```

All targets run via Docker by default. Use `BUILD=local` for local toolchain.

See [docs/developer-guide.md](docs/developer-guide.md) and [docs/architecture.md](docs/architecture.md) for internals.

## License

MIT — Copyright (c) 2026 Francesco Montelli

---

Built by [Francesco Montelli](https://montelli.dev) · [Blog](https://montelli.dev) · [LinkedIn](https://www.linkedin.com/in/francesco-montelli)
