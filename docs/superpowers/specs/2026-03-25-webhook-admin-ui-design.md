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

Before returning, replaces placeholders in the HTML:

```html
<script>
  window.__KC_REALM__ = "{{REALM}}";
  window.__KC_BASE__ = "{{BASE_PATH}}";
</script>
```

- `{{REALM}}` → `realm.getName()`
- `{{BASE_PATH}}` → derived from `session.getContext().getUri().getBaseUri()` (e.g. `/auth` or `/`). This ensures the UI works regardless of whether `KC_HTTP_RELATIVE_PATH` is set.

Content-Type: `text/html`. No authentication required (it's static HTML).

Both endpoints must return `Response` objects with explicit `.type(mediaType)` to override the class-level `@Produces(APPLICATION_JSON)` annotation on `WebhooksResource`.

### `GET /ui/{path: .*}`

Returns any file from classpath `/webhook-ui/{path}`.

**Path traversal protection:** the `path` parameter is sanitized — requests containing `..` are rejected with 400. The resolved path must stay within `/webhook-ui/`.

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

Loaded from Keycloak itself at `${basePath}/js/keycloak.js` — always available, no npm dependency needed.

```typescript
// main.tsx
const basePath = window.__KC_BASE__; // e.g. "/auth" or ""

const keycloak = new Keycloak({
  url: basePath || '/',
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
- The token already carries `view-events` / `manage-events` permissions

### Required permissions

The REST API enforces two permission levels via `AdminPermissionEvaluator`:
- **`view-events`** — list webhooks, get circuit state (read operations)
- **`manage-events`** — create, update, delete, test, reset circuit (write operations)

These are **not** the same as `view-realm` / `manage-realm`. The UI must handle 403 errors for users who have view but not manage permissions.

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
  getSecretStatus(id: string): Promise<SecretStatus>;
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
  retryMaxElapsedSeconds?: number;   // excluded from v1 UI form — advanced config
  retryMaxIntervalSeconds?: number;  // excluded from v1 UI form — advanced config
}
```

```typescript
interface SecretStatus {
  type: 'secret';
  configured: boolean;
}

interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureAt: string | null;
  failureThreshold: number;
  openSeconds: number;
}

interface TestResult {
  httpStatus: number;
  success: boolean;
  durationMs: number;
}
```

Base URL: `${window.__KC_BASE__}/realms/${realm}/webhooks`

Note: `eventTypes` is a `Set<String>` on the server — duplicates are silently deduplicated and ordering is not guaranteed.

All methods set `Authorization: Bearer ${token}` and `Content-Type: application/json`. Each method calls `keycloak.updateToken(30)` before the request.

Error handling: non-2xx responses throw a typed error with status code and body. 403 errors indicate insufficient permissions. Components display errors via PatternFly `Alert`.

---

## 6. UI components

### `WebhookTable.tsx` — main page

- **Toolbar:** page title "Webhooks", realm name, "Create webhook" button (right-aligned)
- **Table columns:**
  - URL (truncated with tooltip if long)
  - Enabled (PatternFly `Switch`, toggles inline via `PUT /{id}`. Rendered as read-only/disabled when the user lacks `manage-events` permission — detected by attempting the first write and caching the 403 result)
  - Circuit (`CircuitBadge` component)
  - Events (count, e.g. "5 events" — full list in tooltip)
  - Actions (PatternFly kebab dropdown: Edit, Test ping, Delete)
- **Empty state:** PatternFly `EmptyState` with "No webhooks configured" and a "Create webhook" CTA
- **Polling:** `setInterval` every 30s calls `list()` to refresh table data. Clears on unmount. Pauses when `document.hidden` is true (visibility API) to avoid unnecessary requests from inactive tabs.
- **Delete:** PatternFly `Modal` confirmation: "Delete webhook to {url}? This cannot be undone."
- **Test ping:** calls `POST /{id}/test`, shows success/failure as a transient PatternFly `Alert`

### `WebhookModal.tsx` — create/edit

Single component, two modes controlled by props:
- `mode: 'create' | 'edit'`
- `webhook?: Webhook` (pre-fill in edit mode)

**Fields:**
- URL — `TextInput`, required, validated as valid URL on blur
- Enabled — `Switch`, default `true` for create
- Secret — `TextInput` type=password, optional. In edit mode shows a status indicator ("Secret configured" or "No secret") based on `GET /{id}/secret` → `{configured: true/false}`. The API does not expose the raw secret value (write-only by design). Typing a new value replaces the existing secret; leaving the field blank preserves the current value. Note: `GET /{id}/secret` requires `manage-events` — if the call returns 403, the field simply shows "Secret status unknown" (graceful degradation).
- `retryMaxElapsedSeconds` / `retryMaxIntervalSeconds` — excluded from v1 form. These are advanced retry tuning fields supported by the API but not exposed in the UI. Default server values apply. Backlog for a future "Advanced settings" accordion.
- Algorithm — `FormSelect` with options: HmacSHA256 (default), HmacSHA1
- Event types — `DualListSelector` or chip/tag input. Available types listed as constants (the common access.* and admin.* types). User can also type custom event types. The server accepts arbitrary strings without validation — client-side validation is not required.

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
https://<keycloak>[/auth]/realms/<realm>/webhooks/ui
```

The `/auth` prefix depends on whether `KC_HTTP_RELATIVE_PATH` is set. The UI adapts automatically via `window.__KC_BASE__`.

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
    '/auth': 'http://localhost:8080',   // if KC uses /auth prefix
    '/realms': 'http://localhost:8080', // if KC uses default (no prefix)
    '/js': 'http://localhost:8080',     // KC JS adapter
  },
},
```

This proxies API calls and the KC JS adapter to a running Keycloak instance. Adjust proxy targets based on `KC_HTTP_RELATIVE_PATH` setting.

### PatternFly version

Pin `@patternfly/react-core` and `@patternfly/react-table` to `^5.4` in `package.json`. PatternFly 5 has had breaking changes between minor versions.

### Error boundary

A top-level React `ErrorBoundary` component wraps the app. If a component throws during rendering, it shows a PatternFly `EmptyState` with the error message and a "Reload" button instead of a white screen.
