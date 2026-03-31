# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Spotless (google-java-format AOSP) and SpotBugs plugins with CI enforcement
- Pitest mutation testing job in CI pipeline (push to master only)

### Fixed
- Test payload now uses Jackson-serialized `AccessEvent` instead of hand-crafted JSON
- Resend-failed endpoint continues retrying until circuit breaker opens instead of stopping on first failure; response now includes `skipped` count

## [1.1.0] - 2026-03-25

### Added
- Webhook admin UI (React + PatternFly 5) served at `/realms/{realm}/webhooks/ui`
- Auto-created OIDC client (`webhook-ui`) on first UI access
- Retry configuration fields (`retryMaxElapsedSeconds`, `retryMaxIntervalSeconds`) on webhook model and UI
- GitHub Actions CI (unit tests, OpenAPI lint, drift check) and release workflows
- Makefile with Docker-based build (`make test-unit`, `make package`, `make test-mutation`)
- OpenAPI 3.1 spec with lint and spec/code drift check

### Fixed
- Explicit `@Produces` on UI asset endpoint to prevent JSON content type
- XSS guard in UI error handler, null byte guard on static file paths

## [1.0.0] - 2026-03-18

### Added
- Core SPI: `WebhookProvider`, `WebhookSpi`, JPA persistence with Liquibase migrations
- 16 REST endpoints for webhook CRUD, event/send history, circuit breaker control, and delivery
- Event taxonomy with glob-style pattern matching (`access.*`, `admin.USER-*`)
- `EventEnricher` converts Keycloak events to sealed `WebhookPayload` records
- `WebhookEventDispatcher` with bounded async queue, exponential backoff retry, and circuit breaker
- HMAC-SHA256/SHA1 webhook signature (`X-Webhook-Signature` header)
- `RetentionCleanupTask` for automatic purge of old events and sends
- `AdminPermissionEvaluator`-based authorization (manage-realm / view-realm)
- Unit tests (Mockito) and integration tests (Testcontainers + PostgreSQL)
- Pitest mutation testing configuration

[Unreleased]: https://github.com/monte97/keycloak-webhook-provider/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/monte97/keycloak-webhook-provider/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/monte97/keycloak-webhook-provider/releases/tag/v1.0.0
