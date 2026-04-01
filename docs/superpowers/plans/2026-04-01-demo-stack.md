# Demo Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shareable `demo/` Docker Compose stack that boots a full Keycloak + webhook-provider environment with automated event generation and a web UI for inspecting received webhooks.

**Architecture:** Six containers — `postgres`, `keycloak` (with JAR auto-downloaded from GitHub Releases), `consumer` (webhook-tester web UI), `generator` (curl loop producing Keycloak events), `setup` (one-shot init that registers the webhook), and `jar-downloader` (init container that fetches the JAR). No custom Docker images; all logic lives in shell scripts mounted as volumes.

**Tech Stack:** Docker Compose, Bash/sh, `curlimages/curl`, `tarampampam/webhook-tester`, Keycloak 26, PostgreSQL 18.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `demo/.env` | Create | Default configuration values |
| `demo/.env.example` | Create | Same as `.env`, with inline comments |
| `demo/docker-compose.yml` | Create | All services, volumes, healthchecks, dependencies |
| `demo/keycloak/realm-demo.json` | Create | Realm import: listener enabled, client with direct grants |
| `demo/setup/run.sh` | Create | Create webhook-tester session, register webhook in Keycloak, print URLs |
| `demo/generator/run.sh` | Create | Loop: create user → login → update → logout → delete |

---

## Task 1: `.env` and `.env.example`

**Files:**
- Create: `demo/.env`
- Create: `demo/.env.example`

- [ ] **Step 1: Create `demo/.env`**

```bash
# demo/.env
KC_ADMIN_PASSWORD=admin
KC_REALM=demo
KEYCLOAK_PORT=8080

GENERATOR_INTERVAL_SECONDS=15
GENERATOR_USERS_PER_CYCLE=1
GENERATOR_USER_PREFIX=demo-user

CONSUMER_PORT=3000
```

- [ ] **Step 2: Create `demo/.env.example`**

```bash
# demo/.env.example

# Keycloak admin password (also used by setup script to register the webhook)
KC_ADMIN_PASSWORD=admin

# Realm name — must match realm-demo.json "realm" field
KC_REALM=demo

# Host port for Keycloak Admin UI
KEYCLOAK_PORT=8080

# Seconds between generator cycles
# Lower = more events. Minimum recommended: 5
GENERATOR_INTERVAL_SECONDS=15

# Users created (and deleted) per cycle — each user produces ~6 webhook events
GENERATOR_USERS_PER_CYCLE=1

# Prefix for generated usernames (e.g. demo-user-a3f2)
GENERATOR_USER_PREFIX=demo-user

# Host port for the webhook-tester web UI
CONSUMER_PORT=3000
```

- [ ] **Step 3: Commit**

```bash
git add demo/.env demo/.env.example
git commit -m "chore(demo): add .env and .env.example"
```

---

## Task 2: Keycloak realm import

**Files:**
- Create: `demo/keycloak/realm-demo.json`

- [ ] **Step 1: Create `demo/keycloak/realm-demo.json`**

```json
{
  "realm": "demo",
  "enabled": true,
  "eventsEnabled": true,
  "eventsListeners": ["jboss-logging", "webhook-provider"],
  "adminEventsEnabled": true,
  "adminEventsDetailsEnabled": true,
  "clients": [
    {
      "clientId": "demo-client",
      "enabled": true,
      "publicClient": true,
      "directAccessGrantsEnabled": true,
      "standardFlowEnabled": false
    }
  ]
}
```

The `demo-client` client is required by the generator for ROPC login (`grant_type=password`). It is public (no secret needed) and has standard flow disabled — login only via direct grant.

- [ ] **Step 2: Commit**

```bash
git add demo/keycloak/realm-demo.json
git commit -m "chore(demo): add Keycloak realm import"
```

---

## Task 3: `docker-compose.yml`

**Files:**
- Create: `demo/docker-compose.yml`

- [ ] **Step 1: Create `demo/docker-compose.yml`**

```yaml
services:

  jar-downloader:
    image: curlimages/curl:8.9.1
    volumes:
      - providers:/providers
    command: >
      sh -c "
        echo 'Downloading latest keycloak-webhook-provider JAR...' &&
        URL=$(curl -sf https://api.github.com/repos/monte97/keycloak-webhook-provider/releases/latest \
          | grep browser_download_url | grep '\\.jar' | cut -d'\"' -f4) &&
        curl -L -o /providers/keycloak-webhook-provider.jar \"$$URL\" &&
        echo 'JAR downloaded successfully.'
      "

  postgres:
    image: postgres:18
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 5s
      timeout: 5s
      retries: 10

  keycloak:
    image: quay.io/keycloak/keycloak:26.0.0
    command: start-dev --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
    volumes:
      - providers:/opt/keycloak/providers
      - ./keycloak/realm-demo.json:/opt/keycloak/data/import/realm-demo.json
    ports:
      - "${KEYCLOAK_PORT}:8080"
    depends_on:
      postgres:
        condition: service_healthy
      jar-downloader:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/realms/master || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 20
      start_period: 60s

  consumer:
    image: tarampampam/webhook-tester:latest
    ports:
      - "${CONSUMER_PORT}:8080"

  setup:
    image: curlimages/curl:8.9.1
    depends_on:
      keycloak:
        condition: service_healthy
      consumer:
        condition: service_started
    restart: "no"
    environment:
      KC_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
      KC_REALM: ${KC_REALM}
      KEYCLOAK_PORT: ${KEYCLOAK_PORT}
      CONSUMER_PORT: ${CONSUMER_PORT}
    volumes:
      - ./setup/run.sh:/run.sh
    entrypoint: ["/bin/sh", "/run.sh"]

  generator:
    image: curlimages/curl:8.9.1
    depends_on:
      keycloak:
        condition: service_healthy
    restart: unless-stopped
    environment:
      KC_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
      KC_REALM: ${KC_REALM}
      GENERATOR_INTERVAL_SECONDS: ${GENERATOR_INTERVAL_SECONDS}
      GENERATOR_USERS_PER_CYCLE: ${GENERATOR_USERS_PER_CYCLE}
      GENERATOR_USER_PREFIX: ${GENERATOR_USER_PREFIX}
    volumes:
      - ./generator/run.sh:/run.sh
    entrypoint: ["/bin/sh", "/run.sh"]

volumes:
  providers:
  postgres_data:
```

- [ ] **Step 2: Validate compose syntax**

```bash
cd demo && docker compose config --quiet
```

Expected: no output (exits 0).

- [ ] **Step 3: Commit**

```bash
git add demo/docker-compose.yml
git commit -m "chore(demo): add docker-compose.yml"
```

---

## Task 4: Setup script

**Files:**
- Create: `demo/setup/run.sh`

- [ ] **Step 1: Create `demo/setup/run.sh`**

```sh
#!/bin/sh
set -e

KC_URL="http://keycloak:8080"
CONSUMER_URL="http://consumer:8080"

echo "==> Creating webhook-tester session..."
SESSION=$(curl -sf -X POST "${CONSUMER_URL}/api/session" \
  -H "Content-Type: application/json" \
  -d '{}')
UUID=$(echo "$SESSION" | grep -o '"uuid":"[^"]*"' | cut -d'"' -f4)

if [ -z "$UUID" ]; then
  echo "ERROR: failed to create webhook-tester session"
  exit 1
fi
echo "    Session UUID: $UUID"

echo "==> Getting Keycloak admin token..."
TOKEN=$(curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli&username=admin&password=${KC_ADMIN_PASSWORD}&grant_type=password" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: failed to get Keycloak admin token"
  exit 1
fi

echo "==> Registering webhook in Keycloak (realm: ${KC_REALM})..."
curl -sf -X POST "${KC_URL}/realms/${KC_REALM}/webhooks/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${CONSUMER_URL}/${UUID}\",
    \"secret\": \"demo-secret\",
    \"enabled\": true,
    \"eventTypes\": [\"*\"]
  }" > /dev/null

echo ""
echo "============================================"
echo " Demo stack is ready!"
echo "============================================"
echo " Keycloak Admin:    http://localhost:${KEYCLOAK_PORT}  (admin / ${KC_ADMIN_PASSWORD})"
echo " Webhook Admin UI:  http://localhost:${KEYCLOAK_PORT}/realms/${KC_REALM}/webhooks/ui"
echo " Webhook Inspector: http://localhost:${CONSUMER_PORT}/${UUID}"
echo "============================================"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x demo/setup/run.sh
```

- [ ] **Step 3: Commit**

```bash
git add demo/setup/run.sh
git commit -m "chore(demo): add setup script"
```

---

## Task 5: Generator script

**Files:**
- Create: `demo/generator/run.sh`

- [ ] **Step 1: Create `demo/generator/run.sh`**

```sh
#!/bin/sh

KC_URL="http://keycloak:8080"

get_admin_token() {
  curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli&username=admin&password=${KC_ADMIN_PASSWORD}&grant_type=password" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4
}

random_suffix() {
  # generate a short random hex string
  head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

run_cycle() {
  TOKEN=$(get_admin_token)
  if [ -z "$TOKEN" ]; then
    echo "[generator] WARN: could not get admin token, skipping cycle"
    return
  fi

  i=0
  while [ "$i" -lt "$GENERATOR_USERS_PER_CYCLE" ]; do
    SUFFIX=$(random_suffix)
    USERNAME="${GENERATOR_USER_PREFIX}-${SUFFIX}"
    EMAIL="${USERNAME}@demo.local"

    # 1. Create user  →  admin.USER-CREATE
    USER_ID=$(curl -sf -X POST \
      "${KC_URL}/admin/realms/${KC_REALM}/users" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"${USERNAME}\",\"email\":\"${EMAIL}\",\"enabled\":true}" \
      -D - | grep -i '^location:' | sed 's|.*/||' | tr -d '\r')

    if [ -z "$USER_ID" ]; then
      echo "[generator] WARN: could not create user ${USERNAME}"
      i=$((i + 1))
      continue
    fi
    echo "[generator] created user ${USERNAME} (${USER_ID})"

    # 2. Set password  →  admin.USER-UPDATE
    curl -sf -X PUT \
      "${KC_URL}/admin/realms/${KC_REALM}/users/${USER_ID}/reset-password" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"type":"password","value":"demo-pass","temporary":false}' > /dev/null

    # 3. Login via ROPC  →  access.LOGIN
    TOKENS=$(curl -sf -X POST \
      "${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token" \
      -d "client_id=demo-client&username=${USERNAME}&password=demo-pass&grant_type=password")
    REFRESH=$(echo "$TOKENS" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4)
    echo "[generator] login: ${USERNAME}"

    # 4. Update email  →  admin.USER-UPDATE
    curl -sf -X PUT \
      "${KC_URL}/admin/realms/${KC_REALM}/users/${USER_ID}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"updated-${EMAIL}\"}" > /dev/null

    # 5. Logout via token revocation  →  access.LOGOUT
    if [ -n "$REFRESH" ]; then
      curl -sf -X POST \
        "${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/revoke" \
        -d "client_id=demo-client&token=${REFRESH}&token_type_hint=refresh_token" > /dev/null
      echo "[generator] logout: ${USERNAME}"
    fi

    # 6. Delete user  →  admin.USER-DELETE
    curl -sf -X DELETE \
      "${KC_URL}/admin/realms/${KC_REALM}/users/${USER_ID}" \
      -H "Authorization: Bearer $TOKEN" > /dev/null
    echo "[generator] deleted user ${USERNAME}"

    i=$((i + 1))
  done
}

echo "[generator] starting — interval=${GENERATOR_INTERVAL_SECONDS}s, users_per_cycle=${GENERATOR_USERS_PER_CYCLE}"

while true; do
  run_cycle
  echo "[generator] sleeping ${GENERATOR_INTERVAL_SECONDS}s..."
  sleep "$GENERATOR_INTERVAL_SECONDS"
done
```

- [ ] **Step 2: Make executable**

```bash
chmod +x demo/generator/run.sh
```

- [ ] **Step 3: Commit**

```bash
git add demo/generator/run.sh
git commit -m "chore(demo): add generator script"
```

---

## Task 6: Smoke test

- [ ] **Step 1: Start the stack**

```bash
cd demo
docker compose up
```

Wait ~90 seconds for Keycloak to fully boot. Expected from `setup` container:

```
============================================
 Demo stack is ready!
============================================
 Keycloak Admin:    http://localhost:8080  (admin / admin)
 Webhook Admin UI:  http://localhost:8080/realms/demo/webhooks/ui
 Webhook Inspector: http://localhost:3000/<uuid>
============================================
```

- [ ] **Step 2: Verify webhook-tester receives events**

Open `http://localhost:3000/<uuid>` in the browser. Within 15 seconds (first generator cycle) you should see incoming webhook payloads appearing in the UI.

- [ ] **Step 3: Verify generator logs**

```bash
docker compose logs generator
```

Expected output pattern:
```
[generator] created user demo-user-a3f2 (some-uuid)
[generator] login: demo-user-a3f2
[generator] logout: demo-user-a3f2
[generator] deleted user demo-user-a3f2
[generator] sleeping 15s...
```

- [ ] **Step 4: Tear down**

```bash
docker compose down -v
```

The `-v` flag removes named volumes (`providers`, `postgres_data`). Omit it on subsequent runs to skip JAR re-download.

- [ ] **Step 5: Final commit**

```bash
git add demo/
git commit -m "chore(demo): complete demo stack"
git push origin master
```
