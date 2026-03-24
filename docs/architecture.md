# Architecture — keycloak-webhook-provider

Technical reference for contributors and operators. Covers component design, data model, dispatch pipeline, and key design decisions.

## Overview

The provider integrates with Keycloak as a standard SPI and adds three capabilities:

1. **Event capture** — intercepts Keycloak events (login, logout, admin actions) via the `EventListenerProvider` SPI
2. **Webhook delivery** — async HTTP dispatch with retry, HMAC signing, and circuit breaker
3. **Management API** — 16 REST endpoints under `/realms/{realm}/webhooks` for CRUD, history, and circuit control

All state (webhooks, events, send history, circuit breaker) is persisted in PostgreSQL via Keycloak's existing JPA datasource.

---

## Component map

```
Keycloak event (access or admin)
        │
        ▼
┌─────────────────────────────────┐
│  WebhookEventListenerProvider   │  SPI — receives KC events, enqueues
└────────────────┬────────────────┘
                 │ enqueue(payload, kcEventId, realmId)
                 ▼
┌─────────────────────────────────┐
│    WebhookEventDispatcher       │  Singleton — owns executor and registry
│  ┌──────────────────────────┐   │
│  │  ScheduledExecutorService│   │  Thread pool: nCPUs threads
│  │  pendingTasks: AtomicInt  │   │  Queue cap: 10,000 tasks
│  └──────────────────────────┘   │
└────────────────┬────────────────┘
                 │ processAndSend (worker thread)
                 ▼
        ┌────────────────┐
        │  Transaction 1 │  persist event, load matching webhooks
        │  (JPA session) │
        └───────┬────────┘
                │ per webhook
                ▼
        ┌────────────────┐
        │ CircuitBreaker │  check allowRequest()
        │   (registry)   │
        └───────┬────────┘
                │ if CLOSED or HALF_OPEN
                ▼
        ┌────────────────┐
        │HttpWebhookSender│  POST, 3s connect / 10s read timeout
        │  + HmacSigner   │  X-Keycloak-Signature header
        └───────┬────────┘
                │ HttpSendResult
                ▼
        ┌────────────────┐
        │  Transaction 2 │  persist send record, update CB state
        │  (JPA session) │
        └───────┬────────┘
                │ if failed and backoff has time
                ▼
        ┌────────────────┐
        │ExponentialBackOff│  schedule retry via executor.schedule()
        └────────────────┘

Parallel:
┌─────────────────────────────────┐
│     WebhooksResource (REST)     │  JAX-RS — 16 endpoints
│  GET/POST/PUT/DELETE webhooks   │  Requires manage-realm / view-realm
│  events, sends, circuit, resend │
└─────────────────────────────────┘
```

---

## SPI registration

Three SPI factories are registered via `META-INF/services/`:

| Factory | SPI | Role |
|---------|-----|------|
| `WebhookEventListenerProviderFactory` | `EventListenerProvider` | Receives events from Keycloak |
| `JpaWebhookProviderFactory` | `WebhookProvider` (custom) | Data access layer |
| `WebhooksResourceProviderFactory` | `RealmResourceProvider` | Mounts REST endpoints |
| `WebhookEntityProviderFactory` | `JpaEntityProvider` | Registers JPA entities |

Keycloak discovers all factories via Java ServiceLoader on startup. The init container (`keycloak-kickstart`) enables `ext-event-webhook` as an event listener per realm — this is what activates event capture.

---

## Data model

### Tables

```
WEBHOOK
├── ID                    VARCHAR(36)  PK
├── REALM_ID              VARCHAR      NOT NULL
├── URL                   VARCHAR(2048) NOT NULL
├── SECRET                VARCHAR      nullable
├── ALGORITHM             VARCHAR      default 'HmacSHA256'
├── ENABLED               BOOLEAN      default false
├── CIRCUIT_STATE         VARCHAR(16)  default 'CLOSED'
├── FAILURE_COUNT         INT          default 0
├── LAST_FAILURE_AT       TIMESTAMP    nullable
├── RETRY_MAX_ELAPSED_SECONDS   INT    nullable (defaults applied in dispatcher)
├── RETRY_MAX_INTERVAL_SECONDS  INT    nullable
├── CREATED_BY            VARCHAR      nullable
├── CREATED_AT            TIMESTAMP
└── UPDATED_AT            TIMESTAMP

WEBHOOK_EVENT_TYPE
├── WEBHOOK_ID            FK → WEBHOOK.ID
└── EVENT_TYPE            VARCHAR      (e.g. "access.LOGIN", "admin.USER-DELETE")

WEBHOOK_EVENT
├── ID                    VARCHAR(36)  PK
├── REALM_ID              VARCHAR      NOT NULL
├── KC_EVENT_ID           VARCHAR      nullable (null for AdminEvent)
├── EVENT_TYPE            VARCHAR(8)   'USER' or 'ADMIN'
├── PAYLOAD               TEXT         full JSON payload
└── CREATED_AT            TIMESTAMP

WEBHOOK_SEND
├── ID                    VARCHAR(36)  PK
├── WEBHOOK_ID            FK → WEBHOOK.ID
├── EVENT_ID              FK → WEBHOOK_EVENT.ID
├── EVENT_TYPE            VARCHAR      (mirrored for lookup queries)
├── HTTP_STATUS           INT          (-1 on network error)
├── SUCCESS               BOOLEAN
├── ATTEMPT               INT          (0 = first try)
├── ERROR_MSG             VARCHAR      nullable
├── CREATED_AT            TIMESTAMP
└── SENT_AT               TIMESTAMP
```

Schema migrations are managed by **Liquibase**, applied automatically on Keycloak startup. Changelog: `src/main/resources/META-INF/jpa-changelog-webhook.xml`.

### Relationships

```
WEBHOOK (1) ──── (N) WEBHOOK_EVENT_TYPE   event filter subscriptions
WEBHOOK (1) ──── (N) WEBHOOK_SEND         delivery attempts
WEBHOOK_EVENT (1)─── (N) WEBHOOK_SEND     one event → N sends (one per webhook)
```

---

## Dispatch pipeline — detailed

### Step 0: Event listener

`WebhookEventListenerProvider` implements `onEvent(Event)` and `onEvent(AdminEvent, boolean)`. Both paths:

1. Enrich the event into a `WebhookPayload` (sealed class with `AccessEvent` and `AdminEvent` variants)
2. Call `dispatcher.enqueue(payload, kcEventId, realmId)` — non-blocking

The enricher adds auth context (userId, username, clientId, IP address) from the Keycloak session.

### Step 1: Queue guard

`enqueue()` checks `pendingTasks >= maxPending` (10,000). If the queue is full, the event is **dropped with a WARN log** — this is an intentional backpressure decision. See [Design decisions](#design-decisions).

### Step 2: Persist event + load webhooks (Transaction 1)

In a JPA transaction:
- Store the event as `WebhookEvent` (full payload JSON, event type, KC event ID)
- Load all enabled webhooks for the realm
- Filter by `EventPatternMatcher` — checks `webhook.eventTypes` against `payload.type()`
- Read realm-level circuit breaker config from realm attributes (`_webhook.circuit.failure_threshold`, `_webhook.circuit.open_seconds`) — allows per-realm override of defaults (5 failures, 60s open)

### Step 3: Per-webhook dispatch

For each matching webhook:

1. **Circuit breaker check** — `CircuitBreakerRegistry.get(webhook)` loads (or creates) a `CircuitBreaker` for this webhook ID. If `OPEN` and `openSeconds` haven't elapsed, the send is skipped entirely.

2. **HTTP send** — `HttpWebhookSender.send()`:
   - `POST` with `Content-Type: application/json`
   - `X-Keycloak-Webhook-Id: <webhookId>`
   - `X-Keycloak-Signature: sha256=<hmac>` (if secret is set)
   - Connect timeout: 3s, read timeout: 10s
   - Returns `HttpSendResult(httpStatus, success, durationMs)`
   - `success` = HTTP 2xx. Any other status (4xx, 5xx, network error) = failure.

3. **Circuit breaker update** — `onSuccess()` resets to CLOSED; `onFailure()` increments counter, sets OPEN if threshold reached.

4. **Persist send record** (Transaction 2) — stores the delivery attempt and writes circuit state back to `WebhookEntity`.

5. **Retry scheduling** — if failed and `ExponentialBackOff.nextBackOffMillis() != STOP`, schedules a retry via `executor.schedule()`. Each retry is a new call to `sendWithRetry()` — the payload is already serialized and held in memory.

### Exponential backoff parameters

| Parameter | Default | Override |
|-----------|---------|----------|
| Initial interval | 500ms | — |
| Multiplier | ×5 | — |
| Jitter factor | ±50% | — |
| Max interval | 180s | `WEBHOOK.RETRY_MAX_INTERVAL_SECONDS` |
| Max elapsed time | 900s (15 min) | `WEBHOOK.RETRY_MAX_ELAPSED_SECONDS` |

Retry sequence (approximate, with jitter): 500ms → 2.5s → 12.5s → 62.5s → 180s → 180s → … until 900s total.

---

## Circuit breaker

State machine per webhook, persisted to `WEBHOOK.CIRCUIT_STATE`:

```
              N failures
  CLOSED ─────────────────▶ OPEN
    ▲                         │
    │  success                │ openSeconds elapsed
    │                         ▼
    └──────────────────── HALF_OPEN
           (probe attempt)
```

| State | `allowRequest()` | Transitions |
|-------|-----------------|-------------|
| `CLOSED` | always true | → OPEN after N consecutive failures |
| `OPEN` | false until `openSeconds` elapsed | → HALF_OPEN (probe) when timer expires |
| `HALF_OPEN` | true (one probe) | → CLOSED on success, → OPEN on failure |

**Defaults:** 5 failures to open, 60s open duration.

**Per-realm override** via Keycloak realm attributes:
```
_webhook.circuit.failure_threshold = 3
_webhook.circuit.open_seconds = 120
```

**`CircuitBreakerRegistry`** — TTL cache keyed by webhook ID. Entries expire after `openSeconds` to force reload of persisted state (which may have been reset via REST API). Prevents stale in-memory state across JVM restarts or cluster nodes.

---

## HMAC signing

`HmacSigner.sign(payload, secret, algorithm)`:

1. Compute `HMAC-SHA256(secret.getBytes(UTF-8), payload.getBytes(UTF-8))`
2. Hex-encode the digest
3. Prefix with algorithm name: `sha256=<hex>`

Supported algorithms: `HmacSHA256` (default), `HmacSHA1`.

The header name is `X-Keycloak-Signature`. This deviates from GitHub's `X-Hub-Signature-256` and Svix's `svix-signature` — it's Keycloak-specific. Consumers should verify using constant-time comparison (`hmac.compare_digest` in Python, `MessageDigest.isEqual` in Java).

---

## REST API — authorization model

Endpoints require an admin bearer token. Two permission levels:

| Operation | Required role |
|-----------|--------------|
| Create, update, delete webhooks | `manage-realm` (or `realm-admin`) |
| Read webhooks, events, sends, circuit | `view-realm` |
| Get secret | `manage-realm` |

Enforcement uses Keycloak's `AdminPermissionEvaluator` with lazy initialization — the evaluator is only instantiated when the endpoint is actually called.

---

## Webhook payload format

```json
{
  "type": "access.LOGIN",
  "timestamp": "2026-03-24T10:00:00Z",
  "realmId": "my-realm",
  "userId": "uuid",
  "username": "alice",
  "clientId": "my-app",
  "sessionId": "uuid",
  "ipAddress": "1.2.3.4",
  "error": null
}
```

Admin event variant:

```json
{
  "type": "admin.USER-CREATE",
  "timestamp": "2026-03-24T10:00:00Z",
  "realmId": "my-realm",
  "resourceType": "USER",
  "operationType": "CREATE",
  "resourcePath": "users/uuid",
  "representation": "{...}",
  "authDetails": {
    "realmId": "master",
    "clientId": "admin-cli",
    "userId": "uuid",
    "ipAddress": "1.2.3.4"
  }
}
```

---

## Threading model

| Component | Thread |
|-----------|--------|
| `WebhookEventListenerProvider.onEvent()` | Keycloak request thread — must return fast |
| `dispatcher.enqueue()` | Keycloak request thread — non-blocking, just submits |
| `processAndSend()` | Executor worker thread (nCPUs pool) |
| `sendWithRetry()` retries | Executor scheduled thread |
| `WebhooksResource` endpoints | Keycloak request thread (JAX-RS) |

The executor is a `ScheduledThreadPoolExecutor` with `nCPUs` core threads. Retries are scheduled via `executor.schedule()` without creating additional threads.

`pendingTasks` is an `AtomicInteger` tracking in-flight tasks. When it reaches `MAX_PENDING` (10,000), new events are dropped. This prevents memory exhaustion if the target endpoint is down for an extended period.

---

## Design decisions

### Why async dispatch?

Keycloak's `onEvent()` is called synchronously on the request thread. A slow or unresponsive webhook target would directly increase login latency. All I/O is moved off the request thread via the executor queue.

**Trade-off:** if Keycloak crashes before a queued event is processed, that event is lost. The queue is in-memory only. For most use cases (login notifications, audit triggers) this is acceptable — these events are not financial transactions. If durability is critical, consider an outbox pattern with a message broker.

### Why persist events before sending?

Persisting the event in Transaction 1 (before attempting HTTP delivery) means the event record always exists in the database, regardless of whether delivery succeeds. This enables:
- The resend API to retry failed deliveries
- History inspection even for webhooks that were added after the event occurred
- Debugging: you can always see what was captured, independently of what was delivered

**Trade-off:** slight write amplification — every event is written even if no webhooks match it.

### Why circuit breaker instead of just retry?

Retry alone (with backoff) keeps retrying individual sends. If a target endpoint is down for 30 minutes and you have 10 webhooks firing 100 events/minute, you accumulate thousands of retry tasks in the executor queue. The circuit breaker stops sending entirely when a target is consistently failing, reducing queue pressure and log noise.

**Trade-off:** events are silently skipped during the OPEN period (they are still persisted — only delivery is skipped). The REST API exposes circuit state and a manual reset endpoint for operator intervention.

### Why store circuit breaker state in PostgreSQL?

The circuit breaker state must survive JVM restarts and be consistent across cluster nodes (if Keycloak runs in cluster mode). Storing it in the `WEBHOOK` row (which is already in JPA) avoids introducing a separate distributed cache. The `CircuitBreakerRegistry` TTL cache provides fast in-memory access and reloads from DB when the entry expires.

**Trade-off:** in a cluster, two nodes can briefly have inconsistent circuit states (between TTL expiry and DB write). This is acceptable — circuit breaker is a best-effort protection, not a hard guarantee.

### Why not use Keycloak's built-in event listener (ext-event-http-sender)?

The Phase Two `ext-event-http-sender` provider (the `keycloak-events` JAR) provides HTTP webhook delivery but lacks: circuit breaker, HMAC signing, send history, REST management API, and per-webhook event filtering with pattern matching. This provider was built to fill those gaps.

### Why JPA/Liquibase instead of native SQL?

Keycloak already uses JPA internally. Reusing the same datasource and entity provider infrastructure means no additional database connection configuration. Liquibase ensures schema migrations run automatically on upgrade, which matters for a provider that's installed and forgotten.

---

## Operational considerations

### Monitoring

Key metrics to watch (via Keycloak logs or external monitoring):

| Signal | What it means |
|--------|--------------|
| `WARN: Webhook dispatch queue full` | Target is down; queue at 10,000 cap. Check circuit state. |
| `WARN: HTTP send failed` | Individual send failure. Retry scheduled. |
| Circuit state = OPEN | Endpoint consistently unreachable. Use `POST /{id}/circuit/reset` after target recovers. |
| High `WEBHOOK_SEND` row count | Normal — consider a retention policy |

### Retention

`WEBHOOK_EVENT` and `WEBHOOK_SEND` rows accumulate indefinitely. The provider includes a `RetentionCleanupTask` — configure via Keycloak's scheduled task mechanism or implement a periodic cron against the database:

```sql
-- Delete events older than 90 days
DELETE FROM WEBHOOK_SEND WHERE CREATED_AT < NOW() - INTERVAL '90 days';
DELETE FROM WEBHOOK_EVENT WHERE CREATED_AT < NOW() - INTERVAL '90 days'
  AND ID NOT IN (SELECT DISTINCT EVENT_ID FROM WEBHOOK_SEND);
```

### Scaling

The executor pool size is `nCPUs`. For high-volume scenarios (many events, many webhooks), this can be a bottleneck. Options:
- Increase pool size by modifying the constructor (requires source change)
- Reduce the number of event subscriptions per webhook (use specific event types instead of wildcards)
- Consider horizontal scaling (multiple Keycloak nodes, each dispatching independently)

### Upgrading

The provider is compiled against Keycloak 26.0.0. After a major Keycloak upgrade:
1. Check if `EventListenerProvider`, `RealmResourceProvider`, or `JpaEntityProvider` SPI interfaces changed
2. Rebuild with the new KC version in `pom.xml`: `<keycloak.version>XX.X.X</keycloak.version>`
3. Run tests: `mvn verify`
4. Deploy new JAR to `providers/` and rebuild: `/opt/keycloak/bin/kc.sh build`
