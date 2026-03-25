# Developer Guide

Practical guide for maintaining, extending, and debugging the webhook provider. For architectural design see [architecture.md](architecture.md), for usage see the [README](../README.md).

---

## Development environment setup

### Prerequisites

- Java 17 (JDK, not JRE)
- Maven 3.8+
- Node.js 20+ and npm (for the admin UI frontend)
- Docker (for integration tests with Testcontainers)
- An IDE with Lombok support (IntelliJ, VS Code + Extension Pack for Java)

### Build

```bash
# Build the frontend (one-time, or after UI changes)
cd webhook-ui && npm ci && npm run build && cd ..

# Build + Java unit tests (includes UI assets in JAR)
mvn package -Dmaven.failsafe.skip=true

# Java unit tests only (87 tests, ~5s, no Docker)
mvn test

# Frontend tests (24 tests, uses Vitest + jsdom)
cd webhook-ui && npm test

# Unit + integration tests (requires Docker)
mvn verify

# Mutation testing (Pitest)
mvn org.pitest:pitest-maven:mutationCoverage
```

The final artifact is a fat JAR (Maven Shade) that bundles all non-provided dependencies, including the compiled UI assets.

### Local deployment

```bash
# Copy the JAR to Keycloak's providers directory
cp target/keycloak-webhook-provider-*.jar /opt/keycloak/providers/

# Rebuild Keycloak
/opt/keycloak/bin/kc.sh build

# Restart
/opt/keycloak/bin/kc.sh start-dev
```

If you use [keycloak-kickstart](https://github.com/monte97/keycloak-kickstart), the JAR is mounted automatically via Docker Compose.

---

## Project structure

```
src/main/java/dev/montell/keycloak/
├── listener/       # SPI entry point — intercepts KC events
├── dispatch/       # Orchestration: queue, circuit breaker, backoff
├── event/          # Enrichment and pattern matching
├── sender/         # HTTP POST + HMAC signing
├── spi/            # Custom SPI interfaces
├── jpa/            # Data access layer
│   ├── entity/     # JPA entities + entity provider
│   └── adapter/    # Entity → Model adapters
├── model/          # Domain model interfaces
├── resources/      # REST API (JAX-RS) + UI serving
└── retention/      # Periodic cleanup

src/test/java/dev/montell/keycloak/
├── unit/           # Unit tests (Mockito, no DB)
└── it/             # Integration tests (Testcontainers + PostgreSQL)

webhook-ui/                      # Admin UI (React SPA)
├── src/
│   ├── main.tsx                 # Entry point — Keycloak JS init, realm/base path detection
│   ├── App.tsx                  # Main layout — webhook list, modals, toast notifications
│   ├── api/webhookApi.ts        # REST client — typed fetch wrapper with KC token auth
│   ├── components/
│   │   ├── WebhookModal.tsx     # Create/edit form — URL, secret, algorithm, event types
│   │   ├── WebhookTable.tsx     # Sortable table with circuit breaker badges
│   │   ├── CircuitBadge.tsx     # CLOSED/OPEN/HALF_OPEN status badge
│   │   └── eventTypes.ts        # Event type catalog with descriptions
│   └── __tests__/               # Vitest + React Testing Library tests
├── vite.config.ts               # Build config — outputs to dist/
├── tsconfig.json
└── package.json
```

### Test naming convention

- `*Test.java` — unit tests, executed by Surefire
- `*IT.java` — integration tests, executed by Failsafe

---

## Request flow

To understand the code, follow the path of an event from capture to delivery:

```
1. Keycloak generates an event (e.g. login)
2. WebhookEventListenerProvider.onEvent()
   └── EventEnricher creates a WebhookPayload (sealed interface)
   └── enlistAfterCommit() — waits for the KC transaction to commit
3. WebhookEventDispatcher.enqueue()
   └── Checks pendingTasks < 10,000 (backpressure)
   └── Submits processAndSend() to the executor
4. processAndSend() [thread pool]
   └── TX1: persist event, load matching webhooks
   └── For each webhook:
       ├── CircuitBreaker.allowRequest()
       ├── HttpWebhookSender.send() → POST + HMAC
       ├── CircuitBreaker.onSuccess() / onFailure()
       ├── TX2: persist send record
       └── If failed: ExponentialBackOff → executor.schedule(retry)
```

---

## How to add a feature

### New field on Webhook

1. **Entity** — add the column in `WebhookEntity.java`
2. **Migration** — create a new changeset in `jpa-changelog-webhook-1.0.0.xml` (or a new changelog file)
3. **Model** — add the getter in `WebhookModel.java`
4. **Adapter** — implement the getter in `WebhookAdapter.java`
5. **DTO** — add the field in `WebhookRepresentation.java`
6. **REST** — map the field in `WebhooksResource.java` (create/update)
7. **Test** — update `WebhooksResourceTest.java`

### New event type

The system is already generic: `EventPatternMatcher` matches strings, not enums. To add a new type:

1. Define the pattern (e.g. `custom.MY_EVENT`)
2. Create the payload in `EventEnricher` or in a new enricher
3. The pattern matcher, dispatcher, and sender work without changes

### New REST endpoint

1. Add the method in `WebhooksResource.java`
2. Apply the correct authorization (`requireManage()` or `requireView()`)
3. Add a test in `WebhooksResourceTest.java`

### Database schema changes

Migrations live in `src/main/resources/META-INF/`:

- `jpa-changelog-webhook.xml` — changelog index (includes versioned files)
- `jpa-changelog-webhook-1.0.0.xml` — v1.0.0 changesets

To add a new migration:

1. Create `jpa-changelog-webhook-1.1.0.xml` with the new changesets
2. Add the include in `jpa-changelog-webhook.xml`
3. Liquibase applies missing changesets automatically on Keycloak boot

**Rule:** never modify changesets already applied in production. Always add new changesets.

---

## Frontend development (webhook-ui)

### Dev workflow

```bash
cd webhook-ui

# Install dependencies
npm ci

# Run tests (Vitest, watch mode)
npm test

# Run tests once (CI)
npx vitest run

# Dev server (standalone, without Keycloak)
npm run dev
```

The Vite dev server is useful for rapid UI iteration but requires a running Keycloak instance for authentication. For full integration testing, build the JAR and deploy to Keycloak.

### Build and embed

The frontend build output (`webhook-ui/dist/`) is copied into the JAR's classpath at `webhook-ui/`. The Maven build handles this automatically via the `maven-resources-plugin` — just run `npm run build` before `mvn package`.

### Key design decisions

- **`keycloak-js` is bundled** — Keycloak 26.1 no longer serves the JS adapter at `/js/keycloak.js`. The adapter is imported from npm (`keycloak-js@26.1.0`).
- **`<base href>` injection** — the server injects a `<base>` tag in `index.html` at serve time so that relative asset paths resolve correctly under any Keycloak base path (e.g. `/auth/realms/test/webhooks/ui/`).
- **Auto-created OIDC client** — `WebhooksResource.ensureUiClient()` creates the `webhook-ui` public client on first UI access. No seed or admin console setup needed.
- **PatternFly 5** — the UI uses PF5 components for consistency with the Keycloak admin console aesthetic.

---

## Critical areas to know

### Transaction savepoint (JpaWebhookProvider)

`storeEvent()` uses a savepoint to handle unique constraint violations on `KC_EVENT_ID`. PostgreSQL invalidates the entire transaction after a constraint error; the savepoint allows a partial rollback and lets the transaction continue.

If you touch persistence logic, make sure you don't remove the savepoint or the transaction will fail on duplicate events.

### enlistAfterCommit (WebhookEventListenerProvider)

Dispatch is enlisted after the Keycloak transaction commits. This ensures events are processed only if the KC request succeeds. Do not move the `enqueue()` call outside this callback.

### CircuitBreakerRegistry TTL

In-memory `CircuitBreaker` instances have a 5-second TTL in the registry. After TTL expiry, state is reloaded from the database. This is necessary for:

- Cluster consistency (multiple KC nodes)
- REST API reset (`POST /{id}/circuit/reset`)

If you increase the TTL, API-triggered resets become less responsive.

### Thread pool and backpressure

The executor has `nCPUs` threads and a cap of 10,000 pending tasks. When the cap is reached, new events are **dropped** (not buffered). This is intentional: it's better to lose an event than to exhaust memory.

### Fat JAR and dependencies

The Maven Shade plugin creates an uberjar. Dependencies with `provided` scope (Keycloak, Jakarta, Jackson) are **not** included — Keycloak supplies them at runtime. If you add a new dependency that is not on Keycloak's classpath, it must have `compile` scope (not `provided`).

---

## Testing

### Unit tests

Unit tests use Mockito to isolate each component. Typical pattern:

```java
@ExtendWith(MockitoExtension.class)
class MyTest {
    @Mock KeycloakSession session;
    @Mock WebhookProvider provider;

    @Test
    void shouldDoSomething() {
        when(provider.getWebhookById("id")).thenReturn(webhook);
        // ... test logic
        verify(provider).storeSend(any());
    }
}
```

Key mocks:
- `KeycloakSession`, `KeycloakSessionFactory` — the Keycloak context
- `EntityManager` — for JPA tests
- `HttpClient` / `HttpResponse` — for sender tests
- `WebhookProvider` — for dispatcher and REST resource tests

### Integration tests

`JpaWebhookProviderIT` uses Testcontainers with a real PostgreSQL instance. Tests the full cycle: entity manager, Liquibase migrations, CRUD operations.

```bash
# Requires Docker
mvn verify
```

### Frontend tests

The admin UI uses Vitest + React Testing Library + jsdom. Tests cover modal behavior, form validation, event type dropdown, and API interactions.

```bash
cd webhook-ui
npm test              # watch mode
npx vitest run        # CI mode (24 tests)
```

### Mutation testing

Pitest verifies that tests actually catch bugs. Configured in `pom.xml` targeting 9 core classes.

```bash
mvn org.pitest:pitest-maven:mutationCoverage
# Report in target/pit-reports/
```

---

## Code conventions

### Style

- **Lombok** — `@JBossLog` for logging, `@Getter`/`@Setter` on entities. Do not use `@Data` on JPA entities (causes equals/hashCode issues).
- **Records** — preferred for immutable value objects (`WebhookPayload`, `HttpSendResult`, `AuthDetails`)
- **Sealed interfaces** — `WebhookPayload` is sealed with two variants (`AccessEvent`, `AdminEvent`)
- **@AutoService** — automatically registers SPI factories via annotation processing

### Naming

- Package: `dev.montell.keycloak.<module>`
- SPI factory: `<Name>ProviderFactory`
- SPI provider: `<Name>Provider`
- JPA entity: `<Name>Entity`
- Adapter: `<Name>Adapter`
- Unit test: `<Name>Test`
- Integration test: `<Name>IT`

### Logging

The project uses JBoss Logging (via Lombok `@JBossLog`). Levels:

- `log.infof()` — lifecycle events (init, shutdown)
- `log.warnf()` — recoverable errors (failed send, full queue)
- `log.errorf()` — critical errors (unexpected exceptions)
- `log.debugf()` — operational details (pattern match, CB state)

### Error handling

- **Never throw exceptions from the dispatcher** — catch everything and log. An unhandled exception would kill the executor thread.
- **REST API** — use `Response.status(XXX).build()` for HTTP errors. Uncaught exceptions become 500s.
- **Sender** — catches `IOException` and timeouts, returns `HttpSendResult` with `httpStatus = -1`.

---

## Troubleshooting

### Webhook is not being sent

1. Verify the listener is active: Keycloak Admin → Realm Settings → Events → Event Listeners must include `montell-webhook`
2. Check that the webhook is `enabled: true`
3. Verify the event type matches: `GET /webhooks/{id}` shows `eventTypes`
4. Check the circuit breaker: `GET /webhooks/{id}/circuit` — if OPEN, reset with `POST /webhooks/{id}/circuit/reset`
5. Check Keycloak logs for `WARN: Webhook dispatch queue full`

### Provider does not register

1. The JAR must be in `providers/`
2. `kc.sh build` must have been run after copying the JAR
3. Check boot logs for ServiceLoader errors
4. Verify that `META-INF/services/` in the JAR contains the correct factories:
   ```bash
   jar tf target/keycloak-webhook-provider-*.jar | grep META-INF/services
   ```

### Liquibase migration errors

If Keycloak fails to start due to schema errors:

1. Check the `DATABASECHANGELOG` and `DATABASECHANGELOGLOCK` tables in the database
2. If a changeset was partially applied, remove its row from `DATABASECHANGELOG` and retry
3. **Never** modify an already-applied changeset — create a new changeset instead

### Failing tests

- **Unit tests:** require no external services. If they fail, the code is broken.
- **Integration tests:** require Docker. Verify the Docker daemon is running.
- **Slow Pitest:** mutation testing is CPU-intensive. On CI, consider running it only on pushes to main.

---

## Release

1. Update the version in `pom.xml` (`<version>X.Y.Z</version>`)
2. Run the full suite: `mvn verify`
3. Build the JAR: `mvn package -Dmaven.failsafe.skip=true`
4. The release JAR is: `target/keycloak-webhook-provider-X.Y.Z.jar`
5. Copy it to `providers/` and rebuild Keycloak: `kc.sh build`
