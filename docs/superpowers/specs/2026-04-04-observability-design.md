# Observability Design — Prometheus Metrics + Structured Logging

**Date:** 2026-04-04  
**Status:** Approved, pending implementation plan  
**Scope:** Prometheus metrics endpoint + structured JSON logging via JUL

---

## Context

The provider dispatches webhook events asynchronously with retry, circuit breaker, and delivery history. Currently there is no way to observe dispatch throughput, latency, failure rates, or circuit breaker state from outside the application (i.e., via a monitoring system). Logs are unstructured plaintext via JBoss Logging, making them hard to parse in log aggregation pipelines.

This spec covers two independent but complementary features:
- **A. Prometheus metrics** — scrape endpoint for operational, infrastructure, and business metrics
- **B. Structured logging** — guaranteed JSON log output for key operational events, independent of Keycloak's log formatter configuration

Full OpenTelemetry SDK integration (traces, OTLP push) is explicitly out of scope for this iteration. Keycloak 26 has experimental OTel support but does not expose a documented API for SPI providers to access the initialized OTel instance. The structured logging approach chosen here (JUL with custom formatter) is compatible with a future OTel log bridge when that integration matures.

---

## A. Prometheus Metrics

### Library

`io.prometheus:simpleclient` + `io.prometheus:simpleclient_common` (~200KB total). Chosen over Micrometer for minimal footprint and zero abstraction overhead. Registers collectors in a static `CollectorRegistry`.

### Endpoint

`GET /webhooks/metrics` — global admin endpoint (not per-realm), served by a new JAX-RS resource alongside existing webhook resources. Requires `manage-realm` or `view-realm` permission. Produces `text/plain; version=0.0.4` (Prometheus text format).

Realm is a **label** on each metric, not a path segment. A single Prometheus scrape job covers all realms; filtering is done via `{realm="demo"}` in PromQL.

### Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `webhook_events_received_total` | Counter | `realm`, `event_type` | Keycloak events received and enqueued for dispatch |
| `webhook_dispatches_total` | Counter | `realm`, `success` | HTTP send attempts completed (`success="true"/"false"`) |
| `webhook_dispatch_duration_seconds` | Histogram | `realm` | HTTP send latency (wall clock, connect + read) |
| `webhook_retries_total` | Counter | `realm` | Retries scheduled via exponential backoff |
| `webhook_retries_exhausted_total` | Counter | `realm` | Retry chains terminated without success |
| `webhook_circuit_state` | Gauge | `realm`, `webhook_id` | Circuit breaker state: 0=CLOSED, 1=HALF_OPEN, 2=OPEN |
| `webhook_queue_pending` | Gauge | — | Tasks currently pending in the executor |

**Notes on label cardinality:**
- `webhook_id` is only used on `webhook_circuit_state` (a gauge, one entry per webhook). It must not appear on counters or histograms to avoid cardinality explosion.
- `event_type` on `webhook_events_received_total` is acceptable: the set of event types is bounded (~240 values).

**Histogram buckets** (HTTP latency, seconds):
`.005, .01, .025, .05, .1, .25, .5, .75, 1.0, 2.5, 5.0`

### Integration Points

- `WebhookEventDispatcher.enqueue()` — increment `webhook_events_received_total`
- `WebhookEventDispatcher.sendWithRetry()` — record `webhook_dispatches_total`, `webhook_dispatch_duration_seconds`
- `WebhookEventDispatcher.sendWithRetry()` on retry scheduled — increment `webhook_retries_total`
- `WebhookEventDispatcher.sendWithRetry()` on `ExponentialBackOff.STOP` — increment `webhook_retries_exhausted_total`
- `WebhookEventDispatcher.sendWithRetry()` after circuit state persist — update `webhook_circuit_state`
- `WebhookEventDispatcher` constructor / `pendingTasks` AtomicInteger — expose as `webhook_queue_pending`

### New Classes

- `WebhookMetrics` — singleton, initializes all collectors, exposes named update methods (`recordDispatch(realm, success, durationSeconds)`, `recordCircuitState(realm, webhookId, state)`, etc.)
- `MetricsResource` — JAX-RS resource, `GET /webhooks/metrics`, writes `CollectorRegistry.defaultRegistry` to response

---

## B. Structured Logging

### Approach

`java.util.logging` (JUL) with a custom `JsonFormatter`. A dedicated `Logger` named `dev.montell.keycloak.webhook.audit` writes one JSON object per line to stdout. This approach:
- Has zero external dependencies
- Does not conflict with JBoss Logging (Keycloak's log framework)
- Produces guaranteed JSON regardless of how the operator has configured Keycloak's log output
- Is forward-compatible with an OTel JUL log bridge when full OTel integration is added

The existing JBoss Logging calls (`log.debugf`, `log.errorf`, etc.) are **not replaced** — they remain for operational debugging. The structured logger is additive, covering only key business events.

### Log Format

One JSON object per line (logfmt-compatible with JSON parsers):

```json
{
  "ts": "2026-04-04T17:00:00.123Z",
  "level": "INFO",
  "service": "keycloak-webhook-provider",
  "event": "dispatch.success",
  "message": "Webhook dispatch succeeded",
  "realm": "demo",
  "webhook_id": "abc-123",
  "event_type": "admin.USER-CREATE",
  "attempt": 0,
  "http_status": 200,
  "duration_seconds": 0.045
}
```

**Fixed fields (every record):** `ts` (ISO 8601 UTC), `level`, `service`, `event`, `message`  
**Context fields (where applicable):** `realm`, `webhook_id`, `event_type`  
**Event-specific fields:** see table below

### Log Events

| `event` | `level` | Additional fields |
|---------|---------|-------------------|
| `dispatch.attempt` | INFO | `attempt`, `url` (no query string) |
| `dispatch.success` | INFO | `attempt`, `http_status`, `duration_seconds` |
| `dispatch.failure` | WARN | `attempt`, `http_status` or `error`, `duration_seconds` |
| `retry.scheduled` | INFO | `attempt`, `delay_seconds` |
| `retry.exhausted` | WARN | `total_attempts` |
| `circuit.opened` | WARN | `failure_count` |
| `circuit.half_open` | INFO | — |
| `circuit.reset` | INFO | — |

**Excluded from structured logs:** debug-level events, DB persist details, payload content, secrets, tokens.

### New Classes

- `JsonFormatter` — extends `java.util.logging.Formatter`, serializes `LogRecord` + MDC-equivalent fields to JSON. No external JSON library — hand-rolled for the bounded field set.
- `AuditLogger` — thin wrapper that constructs structured log records and routes them to the dedicated JUL logger. Exposes named methods: `dispatchSuccess(realm, webhookId, eventType, attempt, httpStatus, durationSeconds)`, etc.

---

## Out of Scope

- OTel SDK integration (traces, OTLP push) — documented as a future path in README
- Micrometer integration with Keycloak's `/metrics` endpoint — fragile, depends on Keycloak internals
- Per-webhook metrics breakdown beyond `circuit_state` — high-cardinality risk
- Log sampling or rate limiting

---

## Testing

**Metrics:**
- Unit test `WebhookMetrics`: verify counter increments, gauge values, histogram observations
- Integration test `MetricsResource`: verify endpoint returns 200 with valid Prometheus text format, correct labels

**Structured logging:**
- Unit test `JsonFormatter`: verify output is valid JSON with all required fields
- Unit test `AuditLogger`: verify correct event names and fields for each log method
