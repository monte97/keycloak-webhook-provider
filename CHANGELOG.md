# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0](https://github.com/monte97/keycloak-webhook-provider/compare/v1.2.2...v1.3.0) (2026-04-01)


### Features

* **demo:** add shareable Docker Compose demo stack ([4e5ccab](https://github.com/monte97/keycloak-webhook-provider/commit/4e5ccab96bc2223820f8a0070bbe14a907250515))


### Bug Fixes

* **demo:** fix stack startup issues found during smoke test ([157f4ab](https://github.com/monte97/keycloak-webhook-provider/commit/157f4ab6cae0979f48a80b37a43356829fc461b6))
* **demo:** move .env files into demo/ directory ([7ba89f1](https://github.com/monte97/keycloak-webhook-provider/commit/7ba89f1fe3205511b4d119df0a18944c807237a3))


### Documentation

* add demo stack design spec ([1e653b1](https://github.com/monte97/keycloak-webhook-provider/commit/1e653b121d3c673fc7d8ea56cd3571ebdcaa91db))
* add demo stack implementation plan ([ee50e3e](https://github.com/monte97/keycloak-webhook-provider/commit/ee50e3e58d08007815f3f34375ca8e3fba1a0602))
* update spec postgres version to 18 ([e14d23e](https://github.com/monte97/keycloak-webhook-provider/commit/e14d23e9d4b86c15fd66cc11eb48a037169424d2))

## [1.2.2](https://github.com/monte97/keycloak-webhook-provider/compare/v1.2.1...v1.2.2) (2026-04-01)


### Bug Fixes

* rename event listener ID from montell-webhook to webhook-provider ([9c7e72f](https://github.com/monte97/keycloak-webhook-provider/commit/9c7e72fd601d7eaaa357a78e9c5cbd34c7e29f93))


### Documentation

* expand README with full deployment guide and personal contacts ([6e3fb40](https://github.com/monte97/keycloak-webhook-provider/commit/6e3fb40c39ab7146aa957c20de73aaa5b602e191))

## [1.2.1](https://github.com/monte97/keycloak-webhook-provider/compare/v1.2.0...v1.2.1) (2026-03-31)


### Documentation

* add SECURITY.md with coordinated vulnerability disclosure policy (CRA compliance) ([e2e32b7](https://github.com/monte97/keycloak-webhook-provider/commit/e2e32b70d7c4622fedc08a1d6f2f6cbda4c1ef01))
* remove keycloak-kickstart references, add LinkedIn and blog contacts ([e2f27e9](https://github.com/monte97/keycloak-webhook-provider/commit/e2f27e932355ace28252caeeab78a058628cc2f8))

## [1.2.0](https://github.com/monte97/keycloak-webhook-provider/compare/v1.1.0...v1.2.0) (2026-03-31)


### Features

* **ui:** add retry configuration fields to webhook modal ([1b92f51](https://github.com/monte97/keycloak-webhook-provider/commit/1b92f5124f255da79b0204c1fa4727c0a4fe0aac))


### Bug Fixes

* **ci:** exclude UI asset endpoints from openapi-diff count ([b4ab090](https://github.com/monte97/keycloak-webhook-provider/commit/b4ab09098b8e227e6d3d7555a8c63224e2056ec5))
* **ci:** use glob for release JAR upload ([3bc613b](https://github.com/monte97/keycloak-webhook-provider/commit/3bc613bc5f539369ca2b2492ca797ec46f253900))
* replace hard-coded test payload with Jackson-serialized AccessEvent ([903a649](https://github.com/monte97/keycloak-webhook-provider/commit/903a649b5fa85eb7659abd89ed1c5a6ce7cc1001))
* resend-failed continues until circuit breaker opens instead of stopping on first failure ([3ec7b82](https://github.com/monte97/keycloak-webhook-provider/commit/3ec7b82196d131861a61b08f1d5327575f7f9f31))
* revert pom.xml to 1.1.0 after stale Release Please PR merge ([3995bb1](https://github.com/monte97/keycloak-webhook-provider/commit/3995bb15858c02639d5bfc93232d62ea4172b1b5))


### Documentation

* add CHANGELOG.md following Keep a Changelog format ([bb2a629](https://github.com/monte97/keycloak-webhook-provider/commit/bb2a6294829ee5e3b7aadb6f0e5454bad1694ff7))
* add SECURITY.md with responsible disclosure policy ([f9d5eb3](https://github.com/monte97/keycloak-webhook-provider/commit/f9d5eb3c319dc7499b08e17b715525a06131a498))
* update Release section with automated versioning workflow ([aa6f517](https://github.com/monte97/keycloak-webhook-provider/commit/aa6f5172ae1dde4d013035b73362ab2a9339921e))

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
