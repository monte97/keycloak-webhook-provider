# Playwright E2E Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained Playwright E2E suite (`e2e/`) that boots the demo docker-compose stack, authenticates, and tests smoke, CRUD, delivery history, and circuit breaker flows.

**Architecture:** `e2e/` sits at the repo root as its own npm package. `globalSetup.ts` boots the docker-compose stack (random ports), polls Keycloak health, authenticates as `webhook-admin`, and writes `.ports.json` + `.auth.json`. Tests read `.ports.json` via a Playwright fixture to build URLs at runtime. `globalTeardown.ts` tears the stack down.

**Tech Stack:** Playwright 1.44, TypeScript 5.4, Docker Compose v2, Keycloak 26, PatternFly v5 UI.

---

## File Map

| File | Created / Modified | Purpose |
|------|-------------------|---------|
| `e2e/package.json` | Create | npm package with Playwright dev dep |
| `e2e/tsconfig.json` | Create | TypeScript config for e2e dir |
| `e2e/docker-compose.test.yml` | Create | Compose override: random ports, disable generator+setup |
| `e2e/global-setup.ts` | Create | Boot stack, poll health, write .ports.json, write .auth.json |
| `e2e/global-teardown.ts` | Create | Tear down stack, delete .ports.json + .auth.json |
| `e2e/playwright.config.ts` | Create | Playwright config: globalSetup/Teardown, storageState, workers=1 |
| `e2e/fixtures/ports.ts` | Create | Test fixtures: keycloakUrl, consumerPublicUrl, adminToken, webhookAdminToken |
| `e2e/tests/01-smoke.spec.ts` | Create | UI loads, auth works, no console errors |
| `e2e/tests/02-crud.spec.ts` | Create | Create / edit / delete webhook via UI |
| `e2e/tests/03-delivery.spec.ts` | Create | Delivery drawer: sends table, filter, resend button (**requires delivery-history-drawer merged**) |
| `e2e/tests/04-circuit.spec.ts` | Create | Circuit breaker: OPEN state, reset via popover |
| `.gitignore` | Modify | Add e2e generated files |
| `demo/Makefile` | Modify | Add `test-e2e` target |
| `.github/workflows/e2e.yml` | Create | CI job for E2E tests |

---

## Task 1: Scaffold e2e package

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/tsconfig.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `e2e/package.json`**

```json
{
  "name": "keycloak-webhook-provider-e2e",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `e2e/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "./dist"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist", "test-results", "playwright-report"]
}
```

- [ ] **Step 3: Add generated files to root `.gitignore`**

Append to `/home/…/keycloak-webhook-provider/.gitignore`:

```
e2e/.ports.json
e2e/.auth.json
e2e/test-results/
e2e/playwright-report/
e2e/node_modules/
e2e/dist/
```

- [ ] **Step 4: Install Playwright and browser**

Run from `e2e/` directory:

```bash
npm install
npx playwright install chromium --with-deps
```

Expected: `node_modules/` created, chromium downloaded.

- [ ] **Step 5: Commit**

```bash
git add e2e/package.json e2e/tsconfig.json .gitignore
git commit -m "feat(e2e): scaffold e2e Playwright package"
```

---

## Task 2: Docker compose override

**Files:**
- Create: `e2e/docker-compose.test.yml`

- [ ] **Step 1: Create `e2e/docker-compose.test.yml`**

```yaml
# Overrides demo/docker-compose.yml for E2E tests:
# - Random host ports on keycloak and consumer (avoids conflicts)
# - Disables setup and generator (tests manage their own state)
services:
  keycloak:
    ports:
      - "0:8080"

  consumer:
    ports:
      - "0:8080"

  setup:
    entrypoint: ["true"]

  generator:
    entrypoint: ["true"]
```

- [ ] **Step 2: Validate the override produces a valid compose config**

Run from repo root:

```bash
docker compose \
  -f demo/docker-compose.yml \
  -f e2e/docker-compose.test.yml \
  config --quiet
```

Expected: exits 0 with no errors. Both keycloak and consumer ports should show `0:8080`.

- [ ] **Step 3: Commit**

```bash
git add e2e/docker-compose.test.yml
git commit -m "feat(e2e): add docker compose test override"
```

---

## Task 3: Global setup (boot + auth)

**Files:**
- Create: `e2e/global-setup.ts`

Context: globalSetup runs from the `e2e/` directory (where `package.json` lives). Paths are resolved relative to `__dirname` which is `e2e/`. The repo root is `path.resolve(__dirname, '..')`.

- [ ] **Step 1: Create `e2e/global-setup.ts`**

```typescript
import { execSync } from 'child_process';
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT = 'e2e-test';
const root = path.resolve(__dirname, '..');
const COMPOSE =
  `docker compose -f ${root}/demo/docker-compose.yml` +
  ` -f ${__dirname}/docker-compose.test.yml -p ${PROJECT}`;

async function pollHealth(url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`Keycloak not ready after ${timeoutMs}ms — last error: ${last}`);
}

async function globalSetup(): Promise<void> {
  // 1. Boot the stack
  console.log('[setup] docker compose up...');
  execSync(`${COMPOSE} up -d --build`, { cwd: root, stdio: 'inherit' });

  // 2. Read assigned ports (docker allocates them after up)
  const readPort = (service: string): number => {
    const out = execSync(`${COMPOSE} port ${service} 8080`, { cwd: root })
      .toString()
      .trim();
    // output format: "0.0.0.0:XXXXX" or ":::XXXXX"
    return parseInt(out.split(':').pop()!, 10);
  };

  const keycloakPort = readPort('keycloak');
  const consumerPort = readPort('consumer');
  const ports = { keycloakPort, consumerPort };

  fs.writeFileSync(path.join(__dirname, '.ports.json'), JSON.stringify(ports, null, 2));
  console.log(`[setup] ports: keycloak=${keycloakPort}, consumer=${consumerPort}`);

  // 3. Poll Keycloak health
  const kcBase = `http://localhost:${keycloakPort}`;
  await pollHealth(`${kcBase}/health/ready`);
  console.log('[setup] Keycloak is ready');

  // 4. Authenticate as webhook-admin and save storage state
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const uiUrl = `${kcBase}/realms/demo/webhooks/ui`;
  await page.goto(uiUrl);

  // keycloak-js redirects to Keycloak login page (login-required mode)
  await page.waitForURL(/\/realms\/demo\/protocol\/openid-connect\/auth/);

  await page.fill('#username', 'webhook-admin');
  await page.fill('#password', 'webhook-admin');
  await page.click('[type=submit]');

  // Wait for redirect back to the UI and app to render
  await page.waitForURL((url) => url.href.startsWith(uiUrl));
  await page.waitForLoadState('networkidle');

  await context.storageState({ path: path.join(__dirname, '.auth.json') });
  await browser.close();

  console.log('[setup] auth saved');
}

export default globalSetup;
```

- [ ] **Step 2: Manually verify globalSetup works (optional smoke check)**

Run from `e2e/`:

```bash
node -e "
  const setup = require('./global-setup');
  setup.default().then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Note: TypeScript must be compiled first or use `ts-node`. Skip this step and rely on Task 6 (smoke test) to validate end-to-end.

- [ ] **Step 3: Commit**

```bash
git add e2e/global-setup.ts
git commit -m "feat(e2e): add global setup (boot stack + auth)"
```

---

## Task 4: Global teardown

**Files:**
- Create: `e2e/global-teardown.ts`

- [ ] **Step 1: Create `e2e/global-teardown.ts`**

```typescript
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT = 'e2e-test';
const root = path.resolve(__dirname, '..');
const COMPOSE =
  `docker compose -f ${root}/demo/docker-compose.yml` +
  ` -f ${__dirname}/docker-compose.test.yml -p ${PROJECT}`;

async function globalTeardown(): Promise<void> {
  console.log('[teardown] docker compose down -v...');
  try {
    execSync(`${COMPOSE} down -v`, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    // Don't fail the test run just because teardown errored
    console.error('[teardown] warning:', e);
  }

  // Clean up generated files
  for (const f of ['.ports.json', '.auth.json']) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  console.log('[teardown] done');
}

export default globalTeardown;
```

- [ ] **Step 2: Commit**

```bash
git add e2e/global-teardown.ts
git commit -m "feat(e2e): add global teardown"
```

---

## Task 5: Playwright config + ports fixture

**Files:**
- Create: `e2e/playwright.config.ts`
- Create: `e2e/fixtures/ports.ts`

- [ ] **Step 1: Create `e2e/playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  testDir: './tests',
  use: {
    storageState: '.auth.json',
  },
  workers: 1, // serial execution — avoids shared Keycloak state conflicts
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 2: Create `e2e/fixtures/ports.ts`**

```typescript
import { test as base } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface Ports {
  keycloakPort: number;
  consumerPort: number;
}

function readPorts(): Ports {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '.ports.json'), 'utf-8'),
  ) as Ports;
}

interface E2EFixtures {
  keycloakUrl: string;
  consumerPublicUrl: string;
  adminToken: string;
  webhookAdminToken: string;
}

export const test = base.extend<E2EFixtures>({
  keycloakUrl: async ({}, use) => {
    const { keycloakPort } = readPorts();
    await use(`http://localhost:${keycloakPort}`);
  },

  consumerPublicUrl: async ({}, use) => {
    const { consumerPort } = readPorts();
    await use(`http://localhost:${consumerPort}`);
  },

  // Keycloak master-realm admin (can manage users, trigger events)
  adminToken: async ({ keycloakUrl }, use) => {
    const res = await fetch(
      `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=admin-cli&username=admin&password=admin&grant_type=password',
      },
    );
    const data = (await res.json()) as { access_token: string };
    await use(data.access_token);
  },

  // webhook-admin (manage webhooks in demo realm)
  webhookAdminToken: async ({ keycloakUrl }, use) => {
    const res = await fetch(
      `${keycloakUrl}/realms/demo/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=admin-cli&username=webhook-admin&password=webhook-admin&grant_type=password',
      },
    );
    const data = (await res.json()) as { access_token: string };
    await use(data.access_token);
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from `e2e/`:

```bash
npx tsc --noEmit
```

Expected: exits 0 with no errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/playwright.config.ts e2e/fixtures/ports.ts
git commit -m "feat(e2e): add playwright config and ports fixture"
```

---

## Task 6: Smoke tests

**Files:**
- Create: `e2e/tests/01-smoke.spec.ts`

- [ ] **Step 1: Create `e2e/tests/01-smoke.spec.ts`**

```typescript
import { test, expect } from '../fixtures/ports';

test('UI loads without redirect to login', async ({ page, keycloakUrl }) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Should NOT be on the Keycloak login page
  expect(page.url()).not.toContain('/protocol/openid-connect/auth');
});

test('Webhook list or empty state is visible', async ({ page, keycloakUrl }) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Either the table or the empty-state heading should appear
  const table = page.getByRole('table', { name: 'Webhooks' });
  const empty = page.getByText('No webhooks configured');
  await expect(table.or(empty)).toBeVisible({ timeout: 10_000 });
});

test('Page has no console errors on load', async ({ page, keycloakUrl }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  expect(errors).toHaveLength(0);
});
```

- [ ] **Step 2: Run the smoke tests**

Run from `e2e/` (globalSetup boots the stack automatically):

```bash
npx playwright test tests/01-smoke.spec.ts
```

Expected output:

```
Running 3 tests using 1 worker

  ✓ 01-smoke.spec.ts:3:5 › UI loads without redirect to login
  ✓ 01-smoke.spec.ts:10:5 › Webhook list or empty state is visible
  ✓ 01-smoke.spec.ts:18:5 › Page has no console errors on load

  3 passed (Xs)
```

Note: first run takes 90–120s to boot Keycloak; subsequent test runs reuse the stack.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/01-smoke.spec.ts
git commit -m "test(e2e): add smoke tests"
```

---

## Task 7: CRUD tests

**Files:**
- Create: `e2e/tests/02-crud.spec.ts`

Context from the UI:
- "Create webhook" button: `role=button name="Create webhook"`
- URL input in modal: `label="URL"`
- Event type search: `placeholder="Search event types..."`
- Save button: `role=button name="Save"`
- Row actions kebab: `aria-label="Actions"` (per-row)
- Edit option: text "Edit"
- Delete option: text "Delete"
- Delete confirm button: `role=button name="Delete"` (inside modal)
- Success toasts: text "Webhook created", "Webhook updated", "Webhook deleted"

- [ ] **Step 1: Create `e2e/tests/02-crud.spec.ts`**

```typescript
import { test, expect } from '../fixtures/ports';

const WEBHOOK_URL_BASE = 'https://e2e.example.com/hook';

async function openCreateModal(page: import('@playwright/test').Page) {
  // Either from empty state button or toolbar button
  const btn = page.getByRole('button', { name: 'Create webhook' });
  await btn.first().click();
  await expect(page.getByRole('dialog', { name: 'Create webhook' })).toBeVisible();
}

async function fillWebhookForm(
  page: import('@playwright/test').Page,
  url: string,
) {
  await page.getByLabel('URL').fill(url);
  // Select event type '*' (all events)
  await page.getByPlaceholder('Search event types...').fill('*');
  await page.getByRole('option', { name: '*', exact: true }).click();
}

test('Create webhook', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-create-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  await openCreateModal(page);
  await fillWebhookForm(page, url);
  await page.getByRole('button', { name: 'Save' }).click();

  // Success toast
  await expect(page.getByText('Webhook created')).toBeVisible();

  // Row appears in table
  await expect(page.getByRole('cell', { name: url })).toBeVisible({ timeout: 5_000 });
});

test('Edit webhook URL', async ({ page, keycloakUrl }) => {
  const originalUrl = `${WEBHOOK_URL_BASE}-edit-orig-${Date.now()}`;
  const updatedUrl = `${WEBHOOK_URL_BASE}-edit-updated-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Create webhook first
  await openCreateModal(page);
  await fillWebhookForm(page, originalUrl);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();
  await expect(page.getByRole('cell', { name: originalUrl })).toBeVisible();

  // Open kebab menu for this row and click Edit
  const row = page.getByRole('row').filter({ hasText: originalUrl });
  await row.getByLabel('Actions').click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();

  await expect(page.getByRole('dialog', { name: 'Edit webhook' })).toBeVisible();

  // Update URL
  await page.getByLabel('URL').fill(updatedUrl);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Webhook updated')).toBeVisible();
  await expect(page.getByRole('cell', { name: updatedUrl })).toBeVisible({ timeout: 5_000 });
});

test('Toggle webhook enabled/disabled', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-toggle-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  await openCreateModal(page);
  await fillWebhookForm(page, url);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  // Find the toggle in the row
  const row = page.getByRole('row').filter({ hasText: url });
  const toggle = row.getByLabel(`Toggle ${url}`);

  await expect(toggle).toBeChecked(); // enabled by default

  await toggle.click();
  await expect(toggle).not.toBeChecked(); // now disabled

  await toggle.click();
  await expect(toggle).toBeChecked(); // re-enabled
});

test('Delete webhook', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-delete-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  await openCreateModal(page);
  await fillWebhookForm(page, url);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();
  await expect(page.getByRole('cell', { name: url })).toBeVisible();

  // Delete via kebab menu
  const row = page.getByRole('row').filter({ hasText: url });
  await row.getByLabel('Actions').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  // Confirm in modal
  await expect(page.getByRole('dialog', { name: 'Delete webhook' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Webhook deleted')).toBeVisible();
  await expect(page.getByRole('cell', { name: url })).not.toBeVisible({ timeout: 5_000 });
});
```

- [ ] **Step 2: Run the CRUD tests**

```bash
npx playwright test tests/02-crud.spec.ts
```

Expected:

```
  ✓ 02-crud.spec.ts › Create webhook
  ✓ 02-crud.spec.ts › Edit webhook URL
  ✓ 02-crud.spec.ts › Toggle webhook enabled/disabled
  ✓ 02-crud.spec.ts › Delete webhook

  4 passed
```

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/02-crud.spec.ts
git commit -m "test(e2e): add CRUD tests"
```

---

## Task 8: Delivery history tests

**⚠️ Prerequisite: branch `feature/delivery-history-drawer` must be merged before this task.**

The drawer (row click → `DrawerPanelContent`) only exists after that merge. Selectors used:
- Drawer: `DrawerPanelContent` (contains text "Delivery history")
- "Delivery history" section title: `getByText('Delivery history')`
- Delivery table: `getByRole('table', { name: 'Delivery history' })`
- Filter "All" button: `getByRole('button', { name: 'All' })`
- Filter "Failed" button: `getByRole('button', { name: 'Failed' })`
- "Resend failed (24h)": `getByRole('button', { name: 'Resend failed (24h)' })`

Context on event delivery:
- Webhook URL must use Docker internal address (`http://consumer:8080/{uuid}`) so Keycloak can reach the consumer from inside the compose network.
- Events are triggered via Keycloak Admin REST API (`POST /admin/realms/demo/users` then `DELETE /admin/realms/demo/users/{id}`).
- After triggering, poll until at least one send record appears (delivery is async; typically < 5s).

**Files:**
- Create: `e2e/tests/03-delivery.spec.ts`

- [ ] **Step 1: Create `e2e/tests/03-delivery.spec.ts`**

```typescript
import { test, expect } from '../fixtures/ports';

const WEBHOOK_URL_BASE = 'https://e2e.example.com/hook';

/** Create a user in the demo realm and immediately delete them — triggers 2 admin events. */
async function triggerEvents(
  keycloakUrl: string,
  adminToken: string,
  n = 1,
): Promise<void> {
  for (let i = 0; i < n; i++) {
    const username = `e2e-user-${Date.now()}-${i}`;

    const createRes = await fetch(
      `${keycloakUrl}/admin/realms/demo/users`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          enabled: true,
          credentials: [{ type: 'password', value: 'temp123', temporary: false }],
        }),
      },
    );
    if (!createRes.ok) throw new Error(`Create user failed: ${createRes.status}`);

    const location = createRes.headers.get('location')!;
    const userId = location.split('/').pop()!;

    await fetch(`${keycloakUrl}/admin/realms/demo/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }
}

test('Delivery drawer shows sends table after event delivery', async ({
  page,
  keycloakUrl,
  consumerPublicUrl,
  adminToken,
}) => {
  // 1. Create a webhook-tester session
  const sessionRes = await fetch(`${consumerPublicUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_code: 200 }),
  });
  const session = (await sessionRes.json()) as { uuid: string };
  const uuid = session.uuid;

  // 2. Register webhook via UI — URL uses Docker-internal address so Keycloak can reach it
  const webhookUrl = `http://consumer:8080/${uuid}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  const createBtn = page.getByRole('button', { name: 'Create webhook' });
  await createBtn.first().click();
  await page.getByLabel('URL').fill(webhookUrl);
  await page.getByPlaceholder('Search event types...').fill('*');
  await page.getByRole('option', { name: '*', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  // 3. Trigger 2 events (create + delete user)
  await triggerEvents(keycloakUrl, adminToken, 1);

  // 4. Wait for delivery (async; Keycloak dispatches on executor threads)
  //    10s is generous — typically takes < 2s on connection-refused URLs, < 1s on success.
  await page.waitForTimeout(10_000);

  // 5. Click the webhook row to open the drawer (filter by unique uuid substring)
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.click();

  // 6. Verify drawer content
  await expect(page.getByText('Delivery history')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('table', { name: 'Delivery history' })).toBeVisible();

  // At least one row in the sends table (not "No deliveries found")
  await expect(page.getByText('No deliveries found')).not.toBeVisible();

  // 7. Filter buttons are present
  await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Failed' })).toBeVisible();

  // 8. "Resend failed (24h)" button is present
  await expect(page.getByRole('button', { name: 'Resend failed (24h)' })).toBeVisible();
});

test('Delivery drawer filter toggles to Failed', async ({
  page,
  keycloakUrl,
  consumerPublicUrl,
  adminToken,
}) => {
  // Create a fresh session and webhook
  const sessionRes = await fetch(`${consumerPublicUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_code: 200 }),
  });
  const { uuid } = (await sessionRes.json()) as { uuid: string };
  const webhookUrl = `http://consumer:8080/${uuid}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  const createBtn = page.getByRole('button', { name: 'Create webhook' });
  await createBtn.first().click();
  await page.getByLabel('URL').fill(webhookUrl);
  await page.getByPlaceholder('Search event types...').fill('*');
  await page.getByRole('option', { name: '*', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  await triggerEvents(keycloakUrl, adminToken, 1);
  await page.waitForTimeout(10_000);

  // Open drawer — filter by unique uuid to avoid matching other consumer:8080 rows
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.click();
  await expect(page.getByText('Delivery history')).toBeVisible();

  // Click "Failed" filter
  await page.getByRole('button', { name: 'Failed' }).click();

  // Table reloads — wait for networkidle or just for table to be visible
  await expect(page.getByRole('table', { name: 'Delivery history' })).toBeVisible();

  // Since all deliveries succeeded, "No deliveries found" should appear
  await expect(page.getByText('No deliveries found')).toBeVisible({ timeout: 5_000 });
});
```

- [ ] **Step 2: Run the delivery tests**

```bash
npx playwright test tests/03-delivery.spec.ts
```

Expected: 2 tests pass (allow up to 60s per test due to delivery wait time).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/03-delivery.spec.ts
git commit -m "test(e2e): add delivery history drawer tests"
```

---

## Task 9: Circuit breaker tests

**Files:**
- Create: `e2e/tests/04-circuit.spec.ts`

Context on the circuit breaker (from the backend):
- Default `failureThreshold = 5`, `initialRetryInterval = 500ms`
- Setting `retryMaxElapsedSeconds: 1` on the webhook means each send attempt gives up in ≤1s, producing ~3 failures per event (initial + ~2 retries within the 1s window)
- Triggering 2 events against an unreachable URL → ~6 failures → circuit opens (>= 5 threshold)
- When OPEN, the `CircuitBadge` component renders a `<Label color="red">OPEN</Label>` wrapped in a `<Popover>` with a "Reset to CLOSED" button
- Wait up to 15s for the circuit to open (async delivery processing)

Unreachable URL: `http://127.0.0.1:19999/` — nothing listens on port 19999 inside the Keycloak container, so connection is refused immediately (no long timeout).

Selectors:
- Circuit OPEN badge (clickable): `getByText('OPEN')`
- Popover "Reset to CLOSED" button: `getByRole('button', { name: 'Reset to CLOSED' })`
- Circuit CLOSED badge: `getByText('CLOSED')`

- [ ] **Step 1: Create `e2e/tests/04-circuit.spec.ts`**

```typescript
import { test, expect } from '../fixtures/ports';

const UNREACHABLE_URL = 'http://127.0.0.1:19999/webhook';

async function createUser(keycloakUrl: string, adminToken: string): Promise<string> {
  const res = await fetch(`${keycloakUrl}/admin/realms/demo/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: `e2e-circuit-${Date.now()}`,
      enabled: true,
      credentials: [{ type: 'password', value: 'temp123', temporary: false }],
    }),
  });
  if (!res.ok) throw new Error(`Create user failed: ${res.status}`);
  const location = res.headers.get('location')!;
  return location.split('/').pop()!;
}

async function deleteUser(keycloakUrl: string, adminToken: string, userId: string) {
  await fetch(`${keycloakUrl}/admin/realms/demo/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

test('Circuit opens after repeated failures and resets to CLOSED', async ({
  page,
  keycloakUrl,
  adminToken,
}) => {
  // 1. Create webhook pointing to unreachable URL with short retry window
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  const createBtn = page.getByRole('button', { name: 'Create webhook' });
  await createBtn.first().click();

  await page.getByLabel('URL').fill(UNREACHABLE_URL);
  await page.getByPlaceholder('Search event types...').fill('*');
  await page.getByRole('option', { name: '*', exact: true }).click();

  // Short retry window so failures accumulate fast: 1s total
  await page.getByLabel('Max retry duration (seconds)').fill('1');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  // 2. Trigger 2 events (create + delete user, twice)
  //    Each event → ~3 send attempts (initial + retries within 1s) → total ~6 failures > threshold 5
  const id1 = await createUser(keycloakUrl, adminToken);
  await deleteUser(keycloakUrl, adminToken, id1);
  const id2 = await createUser(keycloakUrl, adminToken);
  await deleteUser(keycloakUrl, adminToken, id2);

  // 3. Poll until the OPEN badge appears in the table (max 20s)
  //    Reload on each poll to bypass the 30s auto-refresh interval.
  //    Re-find the row after each reload — locators are resolved lazily in Playwright.
  await expect(async () => {
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('row').filter({ hasText: UNREACHABLE_URL }).getByText('OPEN'),
    ).toBeVisible();
  }).toPass({ timeout: 20_000, intervals: [3_000] });

  // 4. Click the OPEN badge to open the circuit popover
  //    Re-query the row (page was reloaded inside toPass above)
  const row = page.getByRole('row').filter({ hasText: UNREACHABLE_URL });
  await row.getByText('OPEN').click();

  // Popover with failure count and reset button
  await expect(page.getByText(/\d+ failures/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset to CLOSED' })).toBeVisible();

  // 5. Reset the circuit
  await page.getByRole('button', { name: 'Reset to CLOSED' }).click();

  // 6. Circuit badge returns to CLOSED
  await expect(row.getByText('CLOSED')).toBeVisible({ timeout: 5_000 });
  await expect(row.getByText('OPEN')).not.toBeVisible();
});
```

- [ ] **Step 2: Run the circuit breaker test**

```bash
npx playwright test tests/04-circuit.spec.ts
```

Expected: 1 test passes (allow up to 60s).

If the circuit doesn't open: add more event pairs in step 2. Check `docker compose logs keycloak -p e2e-test` for delivery errors.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/04-circuit.spec.ts
git commit -m "test(e2e): add circuit breaker tests"
```

---

## Task 10: CI workflow + Makefile target

**Files:**
- Create: `.github/workflows/e2e.yml`
- Modify: `demo/Makefile`

- [ ] **Step 1: Create `.github/workflows/e2e.yml`**

```yaml
name: E2E

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: e2e/package-lock.json

      - name: Install Playwright + deps
        working-directory: e2e
        run: |
          npm ci
          npx playwright install chromium --with-deps

      - name: Run E2E tests
        working-directory: e2e
        run: npx playwright test

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v5
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Add `test-e2e` target to `demo/Makefile`**

Append to `demo/Makefile` (after the last target, before the blank trailing line):

```makefile
## test-e2e        Run Playwright E2E suite (boots demo stack automatically)
test-e2e:
	cd .. && npm --prefix e2e test
```

Note: the `Makefile` entry runs from `demo/`, so `cd ..` moves to repo root, then `npm --prefix e2e test` runs `npm test` in the `e2e/` directory.

- [ ] **Step 3: Verify Makefile target syntax is valid**

Run from `demo/`:

```bash
make help
```

Expected: `test-e2e` appears in the help output.

- [ ] **Step 4: Generate package-lock.json for CI caching**

Run from `e2e/`:

```bash
npm install
```

This creates `e2e/package-lock.json`. Commit it so CI's `npm ci` can use it.

- [ ] **Step 5: Add `e2e/package-lock.json` to git (not in .gitignore)**

```bash
git add e2e/package-lock.json
```

Verify it's not accidentally ignored:

```bash
git check-ignore e2e/package-lock.json
```

Expected: no output (not ignored).

- [ ] **Step 6: Commit all**

```bash
git add .github/workflows/e2e.yml demo/Makefile e2e/package-lock.json
git commit -m "feat(e2e): add CI workflow and Makefile target"
```

---

## Running the full suite

After all tasks are complete, run everything from `e2e/`:

```bash
npx playwright test
```

Expected: 10 tests pass (3 smoke + 4 CRUD + 2 delivery + 1 circuit).

Or from `demo/`:

```bash
make test-e2e
```

To run a single file:

```bash
npx playwright test tests/01-smoke.spec.ts
```

To keep the stack running between runs (faster iteration):

```bash
# First run: let globalSetup boot the stack
npx playwright test

# Subsequent runs: skip setup by passing --no-deps (not supported natively)
# Instead: keep the stack running and just run tests
# Note: globalSetup always runs; it will re-use the existing stack if ports are unchanged.
# Teardown via globalTeardown can be skipped by running:
npx playwright test --no-teardown  # not a real flag; instead, just re-run
```

To view the HTML report after a failure:

```bash
npx playwright show-report
```
