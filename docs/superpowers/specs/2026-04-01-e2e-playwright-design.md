# Playwright E2E Tests — Design Spec

**Date:** 2026-04-01  
**Scope:** New `e2e/` directory at repo root. Demo stack (`demo/`) is the test fixture (read-only).

---

## Problem

The webhook UI has no E2E coverage. Functional correctness is only verified via unit tests that mock the API. Real stack behaviour (Keycloak auth, webhook delivery, circuit breaker state machine) is untested end-to-end.

---

## Solution

Add a Playwright test suite that boots the demo docker-compose stack automatically, authenticates as `webhook-admin`, and exercises the UI against a real Keycloak instance. Four test files introduced progressively by area.

---

## Architecture

**New files:**

```
e2e/
├── package.json                   # Playwright + TypeScript deps
├── tsconfig.json
├── playwright.config.ts           # global setup/teardown, storageState
├── docker-compose.test.yml        # compose override: random ports, no generator/setup
├── global-setup.ts                # boot stack, poll health, write .ports.json, write .auth.json
├── global-teardown.ts             # docker compose down -v, rm .ports.json, rm .auth.json
├── fixtures/
│   └── ports.ts                   # test fixture: reads .ports.json, exposes keycloakUrl + consumerUrl
└── tests/
    ├── 01-smoke.spec.ts           # UI loads, table visible, auth works
    ├── 02-crud.spec.ts            # create / edit / delete webhook
    ├── 03-delivery.spec.ts        # delivery drawer: sends table, resend-failed
    └── 04-circuit.spec.ts         # circuit breaker: OPEN state, reset
```

**Modified files:**

- `demo/Makefile` — add `test-e2e` target
- `.github/workflows/e2e.yml` — new CI workflow (not modifying existing workflows)
- `.gitignore` (root) — add `e2e/.ports.json`, `e2e/.auth.json`, `e2e/test-results/`, `e2e/playwright-report/`

---

## Docker Compose Override

`e2e/docker-compose.test.yml` extends `demo/docker-compose.yml`:

```yaml
services:
  keycloak:
    ports:
      - "0:8080"   # random host port

  consumer:
    ports:
      - "0:8080"   # random host port

  setup:
    entrypoint: ["true"]   # no-op: tests don't need the demo webhook registered

  generator:
    entrypoint: ["true"]   # no-op: tests trigger events programmatically
```

---

## Global Setup (`global-setup.ts`)

```
1. docker compose -f demo/docker-compose.yml -f e2e/docker-compose.test.yml \
     -p e2e-test up -d --build
2. Poll http://localhost:<keycloak-port>/health/ready  (max 120s, 5s interval)
3. docker compose -p e2e-test port keycloak 8080  → keycloakPort
   docker compose -p e2e-test port consumer 8080  → consumerPort
4. Write e2e/.ports.json: { keycloakPort, consumerPort }
5. OIDC login as webhook-admin / webhook-admin against demo realm
6. Write e2e/.auth.json (Playwright storageState format)
```

Auth endpoint: `POST /realms/demo/protocol/openid-connect/token`  
Client: `admin-cli`, grant: `password`, user: `webhook-admin / webhook-admin`  
Store the resulting cookies/localStorage via `page.context().storageState()`.

---

## Global Teardown (`global-teardown.ts`)

```
docker compose -f demo/docker-compose.yml -f e2e/docker-compose.test.yml \
  -p e2e-test down -v
rm -f e2e/.ports.json e2e/.auth.json
```

---

## Playwright Config

```ts
// playwright.config.ts
export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    storageState: 'e2e/.auth.json',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  workers: 1,  // avoid state conflicts between tests
});
```

`playwright.config.ts` is evaluated **before** `globalSetup` runs, so ports are not available there. Instead, a `fixtures/ports.ts` fixture reads `.ports.json` at test runtime and exposes `keycloakUrl` (UI base) and `consumerUrl` as test-level fixtures. Tests navigate to `keycloakUrl` rather than relying on a config-level `baseURL`.

---

## Test Files

### 01-smoke.spec.ts — Smoke
- UI loads without error (no console errors, no 4xx/5xx)
- Webhook table is visible
- Auth context is correct (no redirect to login page)

### 02-crud.spec.ts — CRUD
- Create a webhook: fill URL, save, row appears in table
- Edit a webhook: change URL, save, updated value visible
- Toggle enabled/disabled: row reflects new state
- Delete a webhook: row disappears with confirmation

### 03-delivery.spec.ts — Delivery History
- Click a webhook row → drawer opens
- Drawer shows "Delivery history" section
- Trigger an event via Keycloak admin API (create + delete a test user), wait for delivery
- Delivery row appears in table (status ✅, http 200)
- Toggle filter to "Failed" → only failed rows shown (or empty if none)
- "Resend failed (24h)" button visible; clicking it shows toast

### 04-circuit.spec.ts — Circuit Breaker
- Register a webhook pointing to an unreachable URL (e.g. `http://127.0.0.1:19999/` — nothing listening there)
- Trigger events via admin API until the circuit opens (default failure threshold from realm config is 5 failures within 60s)
- Open drawer → circuit state badge shows OPEN
- Click "Reset circuit" → circuit state badge returns to CLOSED

---

## Triggering Events Programmatically

Tests that need delivery history or circuit breaker state must generate Keycloak events without the generator service. Use the Keycloak admin REST API:

```
POST /admin/realms/demo/users          # create user → triggers admin event
DELETE /admin/realms/demo/users/{id}   # delete user → triggers admin event
```

Auth: obtain admin token from `admin-cli` with `admin / admin` credentials.

---

## `demo/Makefile` Addition

```makefile
## test-e2e        Run Playwright E2E suite against a fresh demo stack
test-e2e:
	cd .. && npx --prefix e2e playwright test
```

---

## GitHub Actions (`.github/workflows/e2e.yml`)

```yaml
on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
        working-directory: e2e
      - run: npx playwright install chromium --with-deps
        working-directory: e2e
      - run: npx playwright test
        working-directory: e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
```

---

## Error Handling

- `globalSetup` timeout (>120s waiting for Keycloak): throw with clear message, `globalTeardown` still runs (registered as teardown regardless)
- Auth failure: throw immediately — all tests would fail anyway
- Individual test failures: Playwright captures screenshot + trace on failure, uploaded as artifact in CI

---

## Out of Scope

- Firefox / WebKit browser coverage (chromium only in this iteration)
- Per-send resend action tests (not in current UI)
- Load / performance testing
- Visual regression testing
- Parallel test execution across multiple workers (single worker to avoid state conflicts)
