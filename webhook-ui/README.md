# Webhook Admin UI

Embedded single-page application for managing Keycloak webhooks from the browser. Built with React 18, PatternFly 5, and TypeScript.

## Access

Each realm has its own UI instance:

```
http://localhost:8080/auth/realms/{realm}/webhooks/ui
```

For example, `/auth/realms/test/webhooks/ui` manages webhooks for the `test` realm. Each UI authenticates against its own realm and only shows webhooks belonging to that realm.

No manual configuration is required — on first access, the provider auto-creates a public OIDC client (`webhook-ui`) in the realm.

## Features

- Create, edit, and delete webhooks
- Searchable event type dropdown with human-readable descriptions
- Circuit breaker status monitoring (CLOSED/OPEN/HALF_OPEN badges) with manual reset
- Send test pings
- View delivery history with Prev/Next pagination and per-send payload preview
- View captured events (USER/ADMIN) in the Events tab with per-event payload preview
- Webhook list pagination (20 per page)
- Webhook creation date and secret rotation expiry shown in the delivery drawer

## Architecture

```
webhook-ui/
├── src/
│   ├── main.tsx                       # Entry point — keycloak-js init, realm/base path detection
│   ├── App.tsx                        # Main layout — webhook list, settings page
│   ├── ErrorBoundary.tsx              # React error boundary
│   ├── api/
│   │   ├── types.ts                   # Shared TypeScript interfaces (Webhook, WebhookSend, WebhookEvent, …)
│   │   └── webhookApi.ts              # REST client — typed fetch wrapper with KC token auth
│   ├── components/
│   │   ├── WebhookTable.tsx           # Paginated webhook list with circuit breaker badges
│   │   ├── DeliveryDrawer.tsx         # Slide-out drawer — delivery history + events tabs, secret rotation
│   │   ├── WebhookModal.tsx           # Create/edit form — URL, secret, algorithm, event types
│   │   ├── CircuitBadge.tsx           # CLOSED/OPEN/HALF_OPEN status badge
│   │   ├── PayloadPreviewModal.tsx    # JSON payload viewer with copy-to-clipboard
│   │   ├── SecretRotationModal.tsx    # Graceful/emergency rotation form
│   │   ├── SecretDisclosureModal.tsx  # One-time new-secret display after rotation
│   │   └── eventTypes.ts             # Event type catalog with descriptions
│   └── __tests__/                    # Vitest + React Testing Library tests
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Key design decisions

- **`keycloak-js` is bundled from npm** — Keycloak 26.1 no longer serves the JS adapter at `/js/keycloak.js`.
- **`<base href>` injection** — the server injects a `<base>` tag at serve time so relative asset paths resolve correctly under any Keycloak base path.
- **Auto-created OIDC client** — `WebhooksResource.ensureUiClient()` creates a `webhook-ui` public client on first UI access. No seed or admin console setup needed.
- **PatternFly 5** — consistent with the Keycloak admin console aesthetic.

## Development

```bash
cd webhook-ui

npm ci                # install dependencies
npm run dev           # Vite dev server (needs running Keycloak for auth)
npm test              # run tests once (Vitest + jsdom)
npm run test:watch    # watch mode
```

### Build and embed

The build output (`dist/`) is copied into the JAR classpath at `webhook-ui/` during `mvn package`. The `frontend-maven-plugin` handles `npm ci` + `npm run build` automatically — just run `make package` from the repo root.

### Tech stack

| Dependency | Version | Purpose |
|---|---|---|
| React | 18.3 | UI framework |
| PatternFly | 5.4 | Component library (Keycloak-consistent) |
| keycloak-js | 26.1 | OIDC authentication adapter |
| TypeScript | 5.6 | Type safety |
| Vite | 5.4 | Build tool |
| Vitest | 2.1 | Test runner |
| React Testing Library | 16.1 | Component testing |
