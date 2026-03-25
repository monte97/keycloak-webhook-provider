# Webhook Admin UI — Design Spec

## Goal

Add a single-page admin UI to the keycloak-webhook-provider JAR that allows realm administrators to manage webhooks visually — create, edit, delete, toggle, test ping, and monitor circuit breaker state — without leaving the Keycloak deployment.

## Architecture

React + PatternFly app built with Vite, compiled into the JAR via `frontend-maven-plugin`. Served by the existing `WebhooksResource` JAX-RS class at `/realms/{realm}/webhooks/ui`. Authentication via Keycloak's built-in JS adapter using the `security-admin-console` client. No external dependencies at runtime — everything is in one JAR.

## Scope — v1

**In scope:**
- Webhook list (table with URL, enabled status, circuit breaker badge, event count, actions)
- Create webhook (modal)
- Edit webhook (modal, same component as create)
- Delete webhook (confirmation dialog)
- Toggle enabled/disabled (inline switch)
- Test ping (inline action)
- Circuit breaker badge (CLOSED/OPEN/HALF_OPEN) with reset action on OPEN
- Polling every 30s to refresh state

**Backlog (not in v1):**
- Send history per webhook
- Resend single failed delivery
- Bulk resend-failed
- Lookup event by Keycloak event ID

---

## 1. Repository structure

```
keycloak-webhook-provider/
├── webhook-ui/                     ← React project (new)
│   ├── src/
│   │   ├── main.tsx                ← Keycloak JS adapter init, renders App
│   │   ├── App.tsx                 ← Routes (just one: the table page)
│   │   ├── api/
│   │   │   └── webhookApi.ts       ← Typed REST client over fetch()
│   │   └── components/
│   │       ├── WebhookTable.tsx    ← Main page: table + toolbar
│   │       ├── WebhookModal.tsx    ← Create/edit modal
│   │       └── CircuitBadge.tsx    ← Colored badge + reset popover
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── src/main/
│   ├── java/...                    ← Existing Java code
│   └── resources/
│       └── webhook-ui/             ← Vite build output (not committed, generated)
└── pom.xml                         ← Updated: adds frontend-maven-plugin
```

`webhook-ui/node_modules/` and `src/main/resources/webhook-ui/` are gitignored.

---

## 2. Build integration

### frontend-maven-plugin

Added to `pom.xml` with two executions:

1. **install-node-and-npm** — downloads Node 20 LTS into `webhook-ui/node/` (auto, no local Node required)
2. **npm-ci** — runs `npm ci` in `webhook-ui/`
3. **npm-test** — runs `npm test` in `webhook-ui/` — if tests fail, Maven build fails
4. **npm-build** — runs `npm run build` in `webhook-ui/`

The Vite build output directory is configured to `../src/main/resources/webhook-ui/` so the assets end up in the JAR classpath automatically.

### Vite config

```typescript
// webhook-ui/vite.config.ts
export default defineConfig({
  base: './',   // relative paths — realm injected at runtime
  build: {
    outDir: '../src/main/resources/webhook-ui',
    emptyOutDir: true,
  },
  plugins: [react()],
});
```

Using `base: './'` (relative paths) means the built assets reference each other with relative URLs. This avoids hardcoding the realm path in the bundle.

### Build command

```bash
mvn package -Dmaven.failsafe.skip=true
# Builds Java + UI, runs both test suites, produces single JAR
```

---

## 3. Serving static files via JAX-RS

Two new endpoints in `WebhooksResource`:

### `GET /ui`

Returns `index.html` from classpath `/webhook-ui/index.html`.

Before returning, replaces `{{REALM}}` placeholder in the HTML with `realm.getName()`:

```html
<script>window.__KC_REALM__ = "{{REALM}}";</script>
```

Content-Type: `text/html`. No authentication required (it's static HTML).

### `GET /ui/{path: .*}`

Returns any file from classpath `/webhook-ui/{path}`.

Content-Type derived from file extension:
- `.js` → `application/javascript`
- `.css` → `text/css`
- `.svg` → `image/svg+xml`
- everything else → `application/octet-stream`

No authentication required. Cache headers: `Cache-Control: public, max-age=31536000, immutable` for files in `assets/` (Vite adds content hashes to filenames); `no-cache` for `index.html`.

### No new JAX-RS class

These endpoints are added directly to `WebhooksResource`. This keeps the provider registration unchanged — no new SPI, no new factory.

---

## 4. Authentication

### Keycloak JS adapter

Loaded from Keycloak itself at `/auth/js/keycloak.js` — always available, no npm dependency needed.

```typescript
// main.tsx
import Keycloak from '/auth/js/keycloak.js';

const keycloak = new Keycloak({
  url: '/auth',
  realm: window.__KC_REALM__,
  clientId: 'security-admin-console',
});

keycloak.init({ onLoad: 'login-required' }).then((authenticated) => {
  if (authenticated) {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <App keycloak={keycloak} />
    );
  }
});
```

### Why `security-admin-console`?

This is the built-in client Keycloak uses for its own admin console. Admins already have an active session for this client when they're working in the admin console. Using it means:
- No new client to register
- No additional login prompt if the admin has an active session
- The token already carries `manage-realm` / `view-realm` roles

### Token refresh

The KC JS adapter handles token refresh automatically. `webhookApi.ts` calls `keycloak.updateToken(30)` before each request to ensure the token has at least 30s of validity remaining.

---

## 5. API client — `webhookApi.ts`

Typed wrapper over `fetch()`. No external HTTP library.

```typescript
interface WebhookApi {
  list(first?: number, max?: number): Promise<Webhook[]>;
  count(): Promise<number>;
  get(id: string): Promise<Webhook>;
  create(data: WebhookInput): Promise<Webhook>;
  update(id: string, data: WebhookInput): Promise<Webhook>;
  delete(id: string): Promise<void>;
  getSecret(id: string): Promise<string>;
  test(id: string): Promise<TestResult>;
  getCircuit(id: string): Promise<CircuitState>;
  resetCircuit(id: string): Promise<void>;
}

interface Webhook {
  id: string;
  url: string;
  algorithm: string;
  enabled: boolean;
  eventTypes: string[];
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  createdAt: string;
  retryMaxElapsedSeconds?: number;
  retryMaxIntervalSeconds?: number;
}

interface WebhookInput {
  url: string;
  secret?: string;
  algorithm?: string;
  enabled: boolean;
  eventTypes: string[];
}
```

Base URL: `/auth/realms/${realm}/webhooks`

All methods set `Authorization: Bearer ${token}` and `Content-Type: application/json`.

Error handling: non-2xx responses throw a typed error with status code and body. Components display errors via PatternFly `Alert`.

---

## 6. UI components

### `WebhookTable.tsx` — main page

- **Toolbar:** page title "Webhooks", realm name, "Create webhook" button (right-aligned)
- **Table columns:**
  - URL (truncated with tooltip if long)
  - Enabled (PatternFly `Switch`, toggles inline via `PUT /{id}`)
  - Circuit (`CircuitBadge` component)
  - Events (count, e.g. "5 events" — full list in tooltip)
  - Actions (PatternFly kebab dropdown: Edit, Test ping, Delete)
- **Empty state:** PatternFly `EmptyState` with "No webhooks configured" and a "Create webhook" CTA
- **Polling:** `setInterval` every 30s calls `list()` to refresh table data. Clears on unmount.
- **Delete:** PatternFly `Modal` confirmation: "Delete webhook to {url}? This cannot be undone."
- **Test ping:** calls `POST /{id}/test`, shows success/failure as a transient PatternFly `Alert`

### `WebhookModal.tsx` — create/edit

Single component, two modes controlled by props:
- `mode: 'create' | 'edit'`
- `webhook?: Webhook` (pre-fill in edit mode)

**Fields:**
- URL — `TextInput`, required, validated as valid URL on blur
- Enabled — `Switch`, default `true` for create
- Secret — `TextInput` type=password, optional. In edit mode shows "••••••••" placeholder; fetches real value from `GET /{id}/secret` only when the field is focused (lazy load)
- Algorithm — `FormSelect` with options: HmacSHA256 (default), HmacSHA1
- Event types — `DualListSelector` or chip/tag input. Available types listed as constants (the common access.* and admin.* types). User can also type custom event types.

**Validation:**
- URL must be a valid HTTP/HTTPS URL
- At least one event type selected
- Validation errors shown inline under each field (PatternFly `FormGroup` validated state)

**Submit:**
- Create: `POST /` → on success close modal, refresh table
- Edit: `PUT /{id}` → on success close modal, refresh table
- On error: show PatternFly `Alert` inside the modal

### `CircuitBadge.tsx`

- **CLOSED** → green `Label` badge
- **OPEN** → red `Label` badge, clickable
- **HALF_OPEN** → yellow `Label` badge

When circuit is OPEN, clicking the badge opens a PatternFly `Popover` showing:
- `failureCount` failures
- "Reset to CLOSED" button → calls `POST /{id}/circuit/reset`
- On success: refresh the row

---

## 7. Testing

### Framework

Vitest + React Testing Library. Runs via `npm test` which is called by `frontend-maven-plugin` during `mvn package`.

### Test coverage

**`WebhookTable.test.tsx`:**
- Renders table with webhook data
- Shows empty state when no webhooks
- Kebab menu opens with correct actions
- Delete confirmation dialog works
- Test ping shows success/error alert
- Enabled switch calls update API

**`WebhookModal.test.tsx`:**
- Create mode: empty fields, submit calls create API
- Edit mode: pre-fills from webhook data
- URL validation rejects invalid URLs
- Requires at least one event type
- Displays API errors in modal

**`CircuitBadge.test.tsx`:**
- Renders correct color for each state
- OPEN badge is clickable, shows popover
- Reset button calls reset API
- CLOSED/HALF_OPEN badges are not clickable

**`webhookApi.test.ts`:**
- Correct URL construction
- Authorization header set
- Error responses throw typed errors
- Token refresh called before requests

### Mocking

`webhookApi.ts` is mocked in component tests via `vi.mock()`. API tests mock `fetch` directly. No Keycloak instance needed.

---

## 8. Operational notes

### Installation

No change for operators. The UI is in the JAR — same `providers/` + `kc.sh build` workflow. The UI is accessible at:

```
https://<keycloak>/auth/realms/<realm>/webhooks/ui
```

### Browser support

Modern browsers only (ES2020+). PatternFly 5 requires Chrome 90+, Firefox 90+, Safari 15+, Edge 90+.

### Bundle size

Estimated: ~400-500KB gzipped (React ~45KB, PatternFly components ~300KB, app code ~20KB). Loaded once, cached via immutable content-hashed URLs.

### Development workflow

For local development with hot reload:

```bash
cd webhook-ui
npm install
npm run dev   # Vite dev server on port 5173, proxy /auth → localhost:8080
```

`vite.config.ts` includes a dev proxy:

```typescript
server: {
  proxy: {
    '/auth': 'http://localhost:8080',
  },
},
```

This proxies API calls and the KC JS adapter to a running Keycloak instance.
