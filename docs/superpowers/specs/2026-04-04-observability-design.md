# Observability Design — Prometheus Metrics + Structured Logging

**Date:** 2026-04-04  
**Status:** Implemented  
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

`GET /realms/{realm}/webhooks/metrics` — served by the existing `WebhooksResource` class. Requires `view-realm` permission (checked via `requireViewEvents()`). Prometheus scrapes a single realm (e.g., `/realms/master/webhooks/metrics`) to get metrics from all realms — the realm in the path is for auth routing only, not for filtering; all metrics are stored globally in `CollectorRegistry.defaultRegistry`.

**Content type:** `text/plain; version=0.0.4; charset=utf-8` (the Prometheus client library adds `;charset=utf-8` to the standard format).

### Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `webhook_events_received_total` | Counter | `realm`, `event_type` | Keycloak events received and enqueued for dispatch |
| `webhook_dispatches_total` | Counter | `realm`, `success` | HTTP send attempts completed (`success="true"/"false"`) |
| `webhook_dispatch_duration_seconds` | Histogram | `realm` | HTTP send latency (wall clock, connect + read) |
| `webhook_retries_total` | Counter | `realm` | Retries scheduled via exponential backoff |
| `webhook_retries_exhausted_total` | Counter | `realm` | Retry chains terminated without success |
| `webhook_events_dropped_total` | Counter | `realm` | Events dropped due to full dispatch queue (MAX_PENDING exceeded) |
| `webhook_circuit_state` | Gauge | `realm`, `webhook_id` | Circuit breaker state: 0=CLOSED, 1=HALF_OPEN, 2=OPEN |
| `webhook_queue_pending` | Gauge (callback) | — | Tasks currently pending in the executor (reads from `pendingTasks` AtomicInteger) |

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
- `WebhookEventDispatcher.enqueue()` on drop (MAX_PENDING exceeded) — increment `webhook_events_dropped_total`
- `WebhookEventDispatcher` constructor / `pendingTasks` AtomicInteger — expose as `webhook_queue_pending` via callback gauge

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
| `dispatch.success` | INFO | `attempt`, `url` (no query string), `http_status`, `duration_seconds` |
| `dispatch.failure` | WARN | `attempt`, `url` (no query string), `http_status` or `error`, `duration_seconds` |
| `retry.scheduled` | INFO | `attempt`, `delay_seconds` |
| `retry.exhausted` | WARN | `total_attempts` |
| `circuit.opened` | WARN | `failure_count` |
| `circuit.reset` | INFO | — |
| `event.dropped` | WARN | `queue_size` |

**Excluded from structured logs:** debug-level events, DB persist details, payload content, secrets, tokens.

### New Classes

- `JsonFormatter` — extends `java.util.logging.Formatter`, serializes `LogRecord` + structured fields to JSON via Jackson (already a project dependency). Produces one JSON line per record.
- `AuditLogger` — thin wrapper that constructs structured log records and routes them to the dedicated JUL logger. Exposes named methods: `dispatchSuccess(realm, webhookId, eventType, attempt, httpStatus, durationSeconds)`, etc.

### Initialization

The JUL logger is configured programmatically in `WebhookEventListenerProviderFactory.init()` (SPI factory startup): creates a `ConsoleHandler` with the custom `JsonFormatter`, attaches it to the `dev.montell.keycloak.webhook.audit` logger, and disables parent handlers to avoid duplicate output through JBoss Logging's root handler.

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

---

## Implementation Status

**Implemented in v1.14.3 — matches spec.**

All 8 metrics in `WebhookMetrics.java`, Prometheus text-format endpoint `GET /realms/{realm}/webhooks/metrics` guarded by `requireViewEvents()` in `WebhooksResource.java:432-447`. Structured logging via `AuditLogger.java` + custom `JsonFormatter.java`.

Nit: the HELP text for `webhook_circuit_state` in `WebhookMetrics.java:77` still reads "1=HALF_OPEN reserved for future use" — stale since half-open was implemented (see `2026-04-05-half-open-circuit-breaker-design.md`). Non-functional, but worth cleaning up on the next touch.
