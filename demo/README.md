# keycloak-webhook-provider — demo stack

A self-contained Docker Compose environment that boots Keycloak with the webhook provider pre-installed and continuously generates events so you can see webhooks being delivered in real time.

## Prerequisites

- Docker with Compose v2 (`docker compose version`)
- Ports `8080` and `3000` free by default — change them in `.env` if already in use:

```env
KEYCLOAK_PORT=8080   # change if 8080 is taken
CONSUMER_PORT=3000   # change if 3000 is taken
```

## Quick start

```bash
cd demo
make up
```

Wait ~90 seconds for Keycloak to boot. Then:

```bash
make urls
```

Output (ports reflect your `.env`):

```
 Keycloak Admin:    http://localhost:<KEYCLOAK_PORT>  (admin / admin)
 Webhook Admin UI:  http://localhost:<KEYCLOAK_PORT>/realms/demo/webhooks/ui  (webhook-admin / webhook-admin)
 Webhook Inspector: http://localhost:<CONSUMER_PORT>/s/<uuid>
```

Open the **Webhook Inspector** URL in the browser. Within 15 seconds you'll see incoming webhook payloads from the event generator.

## Verify it's working

**1. Get the URLs** (run after `make up`):

```bash
make urls
```

Copy the **Webhook Inspector** URL (`http://localhost:<CONSUMER_PORT>/s/<uuid>`) and open it in the browser.

**2. Watch the generator**:

```bash
make logs-generator
```

Every `GENERATOR_INTERVAL_SECONDS` seconds you should see:

```
[generator] created user demo-user-xxxx (some-uuid)
[generator] login: demo-user-xxxx
[generator] logout: demo-user-xxxx
[generator] deleted user demo-user-xxxx
[generator] sleeping 15s...
```

**3. Check the browser** — webhook payloads should appear in the Webhook Inspector UI within one cycle. Each cycle produces ~6 deliveries per user.

If the generator is logging but the browser shows nothing, check the setup logs:

```bash
make logs-setup
```

The last lines should show the three URLs. If it errored, run `make restart`.

## Architecture

```
┌─────────────┐    admin events     ┌──────────────────┐
│  generator  │───(REST API)───────▶│    keycloak      │
│ (curl loop) │                     │  + webhook-      │
└─────────────┘    access events    │    provider      │
              (ROPC login/logout)   └────────┬─────────┘
                                             │ HTTP POST
                                             ▼
                                    ┌──────────────────┐
                                    │  webhook-tester  │
                                    │  (web UI :3000)  │
                                    └──────────────────┘
```

| Container | Image | Role |
|-----------|-------|------|
| `jar-downloader` | `curlimages/curl` | Downloads latest provider JAR from GitHub Releases |
| `postgres` | `postgres:18` | Keycloak database |
| `keycloak` | `quay.io/keycloak/keycloak:26.0.0` | Keycloak + webhook provider |
| `consumer` | `tarampampam/webhook-tester` | Webhook inspector UI |
| `setup` | `curlimages/curl` | One-shot: creates session, registers webhook, prints URLs |
| `generator` | `curlimages/curl` | Loop: create user → login → update → logout → delete |

Each generator cycle produces ~6 webhook events per user.

## Configuration

Edit `.env` before starting:

| Variable | Default | Description |
|----------|---------|-------------|
| `KC_ADMIN_PASSWORD` | `admin` | Keycloak admin password |
| `KC_REALM` | `demo` | Realm name |
| `KEYCLOAK_PORT` | `8080` | Host port for Keycloak |
| `CONSUMER_PORT` | `3000` | Host port for webhook inspector |
| `GENERATOR_INTERVAL_SECONDS` | `15` | Seconds between generator cycles |
| `GENERATOR_USERS_PER_CYCLE` | `1` | Users created (and deleted) per cycle |
| `GENERATOR_USER_PREFIX` | `demo-user` | Username prefix |

## Common commands

```bash
make up              # start detached
make down            # stop (keep volumes — skips JAR re-download on next up)
make restart         # full reset (removes volumes)
make logs            # follow all logs
make logs-setup      # show URLs and UUID
make logs-generator  # follow event generator
make status          # show container states
make urls            # re-print URLs
make clean           # teardown + remove all volumes
```

## Teardown

```bash
make clean           # removes containers and volumes
```

Use `make down` instead if you want to restart quickly — it preserves the `providers` volume so the JAR isn't re-downloaded.
