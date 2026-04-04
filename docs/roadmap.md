# Roadmap

Features ordered by impact/complexity. Each item links to the relevant design area in the codebase.

---

## High priority, low complexity

### HALF_OPEN circuit breaker state
The circuit breaker currently transitions directly from OPEN → CLOSED on the next scheduled retry. A proper HALF_OPEN state would allow a single probe request through before fully closing the circuit, reducing the risk of re-opening immediately after recovery.

**Relevant code:** `CircuitBreaker`, `WebhookEventDispatcher.sendWithRetry()`  
**Metric already reserved:** `webhook_circuit_state` gauge value `1 = HALF_OPEN`

### Configurable retry on specific HTTP status codes
Currently the dispatcher retries on any failed response (non-2xx) and network errors. Some status codes (400, 401, 404) indicate a permanent client error that will not resolve on retry. Allow operators to configure which status codes trigger a retry.

**Relevant code:** `WebhookEventDispatcher.sendWithRetry()`, webhook configuration model

---

## High priority, medium complexity

### Dead letter queue
Events that exhaust all retries are currently dropped silently (logged and counted, but not recoverable). A dead letter queue would persist them to the database, visible in the UI, with support for manual replay.

**Relevant code:** `WebhookEventDispatcher.sendWithRetry()` on `retries_exhausted`, new `DeadLetterEntity` JPA entity, new UI section

### OpenTelemetry traces
The next logical observability step after Prometheus metrics and structured logging. Keycloak 26 has experimental OTel support; the structured JUL logging in place is forward-compatible with a JUL log bridge when the integration matures.

**Design notes:** `docs/superpowers/specs/2026-04-04-observability-design.md` — "Out of Scope" section documents the recommended path

---

## Medium priority, medium complexity

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

### Rate limiting
Cap the number of outgoing events per second per webhook. Protects slow or rate-limited consumer endpoints from being overwhelmed during event bursts.

### Event deduplication
Idempotency keys on outgoing requests to allow consumers to safely deduplicate retried deliveries.
