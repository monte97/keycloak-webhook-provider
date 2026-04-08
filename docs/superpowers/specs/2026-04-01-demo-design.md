# Demo Stack Design

**Date:** 2026-04-01
**Scope:** `demo/` directory in `keycloak-webhook-provider` repo

## Goal

A shareable Docker Compose stack that acts as both an interactive demo and a manual end-to-end smoke test. Anyone with Docker installed runs `docker compose up` and sees the webhook provider working end-to-end within minutes.

## Architecture

```
┌─────────────┐    admin events     ┌──────────────────┐
│  generator  │───(REST API)───────▶│    keycloak      │
│ (curl loop) │                     │  + webhook-      │
└─────────────┘    access events    │    provider      │
                  (ROPC login/out)  └────────┬─────────┘
                                             │ HTTP POST
                                             ▼
                                    ┌──────────────────┐
                                    │  webhook-tester  │
                                    │  (web UI :3000)  │
                                    └──────────────────┘
```

## Services

| Service | Image | Role |
|---------|-------|------|
| `postgres` | `postgres:18` | Keycloak database |
| `keycloak` | `quay.io/keycloak/keycloak:26.0.0` | Keycloak 26 + webhook-provider JAR |
| `consumer` | `tarampampam/webhook-tester` | Webhook inspector with web UI (MIT) |
| `generator` | `curlimages/curl` | Automated event generator loop |
| `setup` | `curlimages/curl` | One-shot init: creates webhook-tester session + registers webhook in Keycloak |

### JAR provisioning

A named Docker volume (`providers`) is populated by a `jar-downloader` init container that fetches the latest JAR from GitHub Releases via the GitHub API. Keycloak depends on this container completing successfully before starting.

### Setup flow (`setup/run.sh`)

1. Wait for Keycloak health endpoint
2. Call webhook-tester API → create session → obtain UUID
3. Get Keycloak admin token
4. Register webhook in Keycloak: `http://consumer:8080/{uuid}`, secret `demo-secret`, eventTypes `["*"]`
5. Print to log: URLs for Keycloak Admin UI, webhook admin UI, and webhook-tester UI

### Generator behavior (`generator/run.sh`)

Runs in a loop with configurable interval and users-per-cycle. Each cycle per user:

1. Create user via Admin API → `admin.USER-CREATE`
2. Set user password → `admin.USER-UPDATE`
3. Login via ROPC → `access.LOGIN`
4. Update user email → `admin.USER-UPDATE`
5. Logout via token revocation → `access.LOGOUT`
6. Delete user → `admin.USER-DELETE`

Each cycle produces ~6 webhook deliveries per user.

## Configuration (`.env`)

```env
# Keycloak
KC_ADMIN_PASSWORD=admin
KC_REALM=demo
KEYCLOAK_PORT=8080

# Generator
GENERATOR_INTERVAL_SECONDS=15
GENERATOR_USERS_PER_CYCLE=1
GENERATOR_USER_PREFIX=demo-user

# Consumer
CONSUMER_PORT=3000
```

## File Structure

```
demo/
├── docker-compose.yml
├── .env                        # defaults, ready to use
├── .env.example                # same content, with inline comments
├── keycloak/
│   └── realm-demo.json         # realm "demo" with webhook-provider listener enabled
├── generator/
│   └── run.sh                  # event generation loop
└── setup/
    └── run.sh                  # webhook-tester session + Keycloak webhook registration
```

No custom Docker images. All containers use public images; scripts are mounted as volumes.

## Startup

```bash
cd demo
docker compose up
```

Expected output from `setup` container on completion:

```
Keycloak Admin:      http://localhost:8080  (admin / <KC_ADMIN_PASSWORD>)
Webhook Admin UI:    http://localhost:8080/realms/demo/webhooks/ui
Webhook Inspector:   http://localhost:3000/<uuid>
```

## Keycloak Realm (`realm-demo.json`)

Minimal realm import:
- `realm: demo`
- `eventsEnabled: true`
- `eventsListeners: ["jboss-logging", "webhook-provider"]`
- `adminEventsEnabled: true`
- `adminEventsDetailsEnabled: true`
- Direct grant enabled on `account` client (required for ROPC login in generator)

## Out of Scope

- Automated assertions / pass-fail exit codes (this is a demo, not a CI test)
- TLS / production hardening
- Persistent webhook history across restarts

---

## Implementation Status

**Implemented in v1.14.3 — matches spec.**

All 5 services (postgres, keycloak, consumer, setup, generator) present in `demo/docker-compose.yml`. Realm config in `demo/keycloak/realm-demo.json` wires the `webhook-provider` events listener. Setup/generator scripts under `demo/setup/run.sh` and `demo/generator/run.sh`. `Makefile` exposes `test-e2e` and helper targets.
