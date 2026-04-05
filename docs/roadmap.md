# Roadmap

Features ordered by impact/complexity. Items marked with 🔍 were identified by comparing with the OSS ecosystem (notably [p2-inc/keycloak-events](https://github.com/p2-inc/keycloak-events), [vymalo/keycloak-webhook](https://github.com/vymalo/keycloak-webhook), [chintanbuch/keycloak-client-webhook](https://github.com/chintanbuch/keycloak-client-webhook)).

---

## High priority, low complexity

### HALF_OPEN circuit breaker state
The circuit breaker currently transitions directly from OPEN → CLOSED on the next scheduled retry. A proper HALF_OPEN state would allow a single probe request through before fully closing the circuit, reducing the risk of re-opening immediately after recovery.

**Relevant code:** `CircuitBreaker`, `WebhookEventDispatcher.sendWithRetry()`  
**Metric already reserved:** `webhook_circuit_state` gauge value `1 = HALF_OPEN`

### Configurable retry on specific HTTP status codes
Currently the dispatcher retries on any failed response (non-2xx) and network errors. Some status codes (400, 401, 404) indicate a permanent client error that will not resolve on retry. Allow operators to configure which status codes trigger a retry.

**Relevant code:** `WebhookEventDispatcher.sendWithRetry()`, webhook configuration model

### 🔍 Resend by delivery ID
A REST endpoint to replay a specific past delivery attempt by ID, without having to trigger a new event. p2-inc exposes this pattern; we have the delivery history data but no dedicated resend-by-ID endpoint.

**Relevant code:** `WebhooksResource`, `JpaWebhookProvider`, delivery history tables

---

## High priority, medium complexity

### Dead letter queue
Events that exhaust all retries are currently dropped silently (logged and counted, but not recoverable). A dead letter queue would persist them to the database, visible in the UI, with support for manual replay.

**Relevant code:** `WebhookEventDispatcher.sendWithRetry()` on `retries_exhausted`, new `DeadLetterEntity` JPA entity, new UI section

### 🔍 Catch-all system webhook
An operator-level webhook configured via environment variables (`WEBHOOK_URI`, `WEBHOOK_SECRET`) that receives all events from all realms, regardless of per-realm subscription configuration. Useful as an auditing escape hatch or for ops monitoring. Inspired by p2-inc's system-owner webhook.

**Relevant code:** `WebhookEventListenerProviderFactory`, `WebhookEventDispatcher`, new env-var based config path

### OpenTelemetry traces
The next logical observability step after Prometheus metrics and structured logging. Keycloak 26 has experimental OTel support; the structured JUL logging in place is forward-compatible with a JUL log bridge when the integration matures.

**Design notes:** `docs/superpowers/specs/2026-04-04-observability-design.md` — "Out of Scope" section documents the recommended path

---

## Medium priority, medium complexity

### 🔍 Custom event publishing API
A REST endpoint (`POST /realms/{realm}/webhooks/events`) that allows external applications to publish arbitrary events, which are then dispatched to all matching webhooks. Turns Keycloak into a general-purpose event bus for the realm. Inspired by p2-inc.

**Relevant code:** new `WebhooksResource` endpoint, `WebhookEventDispatcher.enqueue()`

### 🔍 Per-client webhook configuration
Webhooks scoped to a specific OAuth client rather than the whole realm. Useful in multi-tenant SaaS scenarios where each client application needs its own webhook subscription independently of realm-level config.

**Relevant code:** webhook data model, `WebhookEventListenerProvider`, UI

### Payload batching
Group multiple events destined for the same webhook endpoint into a single HTTP request. Reduces connection overhead for endpoints receiving high event volumes.

**Relevant code:** `WebhookEventDispatcher`, `HttpWebhookSender`, payload format

### Payload transformation
Allow per-webhook JSONPath filters or field mappings applied before dispatch. Useful when the consumer expects a different schema than the raw Keycloak event structure.

**Relevant code:** new `PayloadTransformer` component between `EventEnricher` and `HttpWebhookSender`

### mTLS support
Client certificate authentication for webhook endpoints that require it. Operators provide a certificate+key pair per webhook; `HttpWebhookSender` presents it on the TLS handshake.

**Relevant code:** `HttpWebhookSender`, webhook configuration model and UI

---

## Low priority

### 🔍 Multi-transport delivery (AMQP, Syslog)
Deliver events to RabbitMQ/AMQP queues or Syslog (RFC 3164/5424) in addition to HTTP. Useful in enterprise environments with existing message broker infrastructure. Inspired by vymalo/keycloak-webhook.

### Rate limiting
Cap the number of outgoing events per second per webhook. Protects slow or rate-limited consumer endpoints from being overwhelmed during event bursts.

### Event deduplication
Idempotency keys on outgoing requests to allow consumers to safely deduplicate retried deliveries.

---

## Competitive context

As of April 2026, the main OSS alternatives are:

| Project | Stars | Differentiators |
|---|---|---|
| [p2-inc/keycloak-events](https://github.com/p2-inc/keycloak-events) | 287 | Multi-instance factory, catch-all webhook, custom event publishing, script listeners |
| [vymalo/keycloak-webhook](https://github.com/vymalo/keycloak-webhook) | 101 | Multi-transport: HTTP + AMQP + Syslog |
| [svenstaro/keycloak-http-webhook-provider](https://github.com/svenstaro/keycloak-http-webhook-provider) | 27 | Minimal reference implementation |
| [chintanbuch/keycloak-client-webhook](https://github.com/chintanbuch/keycloak-client-webhook) | 13 | Per-client webhook scoping |

**Our unique advantages:** circuit breaker with auto-recovery, embedded React/PatternFly admin UI, full per-attempt delivery history, Prometheus metrics, structured JSON audit logging.
