# Realm Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose realm-level webhook configuration (retention days + circuit breaker parameters) via `GET/PUT /realms/{realm}/webhooks/realm-settings` and make all 4 fields editable from the existing Settings page.

**Architecture:** Backend reads/writes 4 Keycloak realm attributes already consumed by `RetentionCleanupTask` and the dispatcher; no DB changes. Frontend fetches settings on mount in `App.tsx`, passes them to `SettingsPage` as props, and fires `PUT` on blur. `SettingsPage` renders a new PatternFly card reusing the existing `RetryInput` component.

**Tech Stack:** Java 17 + JAX-RS (backend), React + PatternFly v5 + TypeScript (frontend), Vitest + Playwright (tests), OpenAPI 3.1 (spec).

---

## File Map

**Modified:**
- `src/main/java/dev/montell/keycloak/resources/WebhooksResource.java` — add `getRealmSettings()` + `updateRealmSettings()` endpoints
- `src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java` — add `GetRealmSettings` + `UpdateRealmSettings` nested test classes
- `webhook-ui/src/api/types.ts` — add `RealmSettings` interface
- `webhook-ui/src/api/webhookApi.ts` — add `getRealmSettings()` + `updateRealmSettings()` methods
- `webhook-ui/src/App.tsx` — add realm settings state, `useEffect`, handler, pass props to `SettingsPage`
- `webhook-ui/src/components/SettingsPage.tsx` — add new props + "Configurazione server" card
- `webhook-ui/src/__tests__/SettingsPage.test.tsx` — add tests for new card
- `docs/openapi.yaml` — add `/realm-settings` paths + `RealmSettings` schema

**Created:**
- `e2e/tests/09-realm-settings.spec.ts`

---

## Task 1: Backend GET + PUT /realm-settings

**Files:**
- Modify: `src/main/java/dev/montell/keycloak/resources/WebhooksResource.java`
- Test: `src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java`

### Context

`WebhooksResource.java` already has `getRealmIntAttribute(key, defaultValue)` at line ~718 and the `requireManageEvents()` guard. The 4 realm attributes used:
- `_webhook.retention.events.days` (default 30) — already read by `RetentionCleanupTask`
- `_webhook.retention.sends.days` (default 90) — already read by `RetentionCleanupTask`
- `_webhook.circuit.failure_threshold` (default 5) — already read by the dispatcher
- `_webhook.circuit.open_seconds` (default 60) — already read by the dispatcher

The test class uses `NoAuthWebhooksResource` (a subclass that bypasses auth) and Mockito's `LENIENT` strictness. `setUp()` already stubs `realm.getAttribute("_webhook.circuit.failure_threshold")` and `realm.getAttribute("_webhook.circuit.open_seconds")` to return `null`.

- [ ] **Step 1: Write failing tests**

Add two `@Nested` classes to `WebhooksResourceTest.java` (after the existing `GetSendPayload` nested class):

```java
// -----------------------------------------------------------------------
// GET /realm-settings
// -----------------------------------------------------------------------

@Nested
class GetRealmSettings {

    @Test
    void returns_defaults_when_no_attributes_set() {
        // retention attrs not stubbed in setUp → Mockito returns null
        when(realm.getAttribute("_webhook.retention.events.days")).thenReturn(null);
        when(realm.getAttribute("_webhook.retention.sends.days")).thenReturn(null);
        // circuit attrs already stubbed to null in setUp

        Response resp = resource.getRealmSettings();

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        var body = (Map<String, Object>) resp.getEntity();
        assertEquals(30, body.get("retentionEventDays"));
        assertEquals(90, body.get("retentionSendDays"));
        assertEquals(5, body.get("circuitFailureThreshold"));
        assertEquals(60, body.get("circuitOpenSeconds"));
    }

    @Test
    void returns_configured_values() {
        when(realm.getAttribute("_webhook.retention.events.days")).thenReturn("45");
        when(realm.getAttribute("_webhook.retention.sends.days")).thenReturn("60");
        when(realm.getAttribute("_webhook.circuit.failure_threshold")).thenReturn("10");
        when(realm.getAttribute("_webhook.circuit.open_seconds")).thenReturn("120");

        Response resp = resource.getRealmSettings();

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        var body = (Map<String, Object>) resp.getEntity();
        assertEquals(45, body.get("retentionEventDays"));
        assertEquals(60, body.get("retentionSendDays"));
        assertEquals(10, body.get("circuitFailureThreshold"));
        assertEquals(120, body.get("circuitOpenSeconds"));
    }
}

// -----------------------------------------------------------------------
// PUT /realm-settings
// -----------------------------------------------------------------------

@Nested
class UpdateRealmSettings {

    @Test
    void saves_all_fields_and_returns_updated() {
        when(realm.getAttribute("_webhook.retention.events.days")).thenReturn("45");
        when(realm.getAttribute("_webhook.retention.sends.days")).thenReturn("60");
        when(realm.getAttribute("_webhook.circuit.failure_threshold")).thenReturn("3");
        when(realm.getAttribute("_webhook.circuit.open_seconds")).thenReturn("30");

        var body = Map.of(
                "retentionEventDays", 45,
                "retentionSendDays", 60,
                "circuitFailureThreshold", 3,
                "circuitOpenSeconds", 30);
        Response resp = resource.updateRealmSettings(body);

        assertEquals(200, resp.getStatus());
        verify(realm).setAttribute("_webhook.retention.events.days", "45");
        verify(realm).setAttribute("_webhook.retention.sends.days", "60");
        verify(realm).setAttribute("_webhook.circuit.failure_threshold", "3");
        verify(realm).setAttribute("_webhook.circuit.open_seconds", "30");
    }

    @Test
    void returns_400_when_field_is_zero() {
        Response resp = resource.updateRealmSettings(Map.of("retentionEventDays", 0));
        assertEquals(400, resp.getStatus());
    }

    @Test
    void returns_400_when_field_is_negative() {
        Response resp = resource.updateRealmSettings(Map.of("circuitOpenSeconds", -5));
        assertEquals(400, resp.getStatus());
    }

    @Test
    void ignores_absent_fields() {
        when(realm.getAttribute("_webhook.retention.events.days")).thenReturn("14");
        when(realm.getAttribute("_webhook.retention.sends.days")).thenReturn("90");
        // circuit attrs mocked to null in setUp → defaults 5, 60

        Response resp = resource.updateRealmSettings(Map.of("retentionEventDays", 14));

        assertEquals(200, resp.getStatus());
        verify(realm).setAttribute("_webhook.retention.events.days", "14");
        verify(realm, never()).setAttribute(eq("_webhook.retention.sends.days"), any());
        verify(realm, never()).setAttribute(eq("_webhook.circuit.failure_threshold"), any());
        verify(realm, never()).setAttribute(eq("_webhook.circuit.open_seconds"), any());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/keycloak-webhook-provider
mvn test -pl . -Dtest="WebhooksResourceTest\$GetRealmSettings+WebhooksResourceTest\$UpdateRealmSettings" -q 2>&1 | tail -20
```

Expected: compilation error or method-not-found since `getRealmSettings()` and `updateRealmSettings()` don't exist yet.

- [ ] **Step 3: Implement the two endpoints in WebhooksResource.java**

Insert just before the `// --- GET /metrics ---` comment (around line 584). Also update the Javadoc at the top of the class from "16 REST endpoints" to "18 REST endpoints" (search for "16 REST endpoints" in the class-level Javadoc).

Actually the current count is 20 endpoints — after adding GET + PUT it becomes 22. Update the Javadoc to "22 REST endpoints".

Add the following two methods:

```java
// --- GET /realm-settings ---
@GET
@Path("realm-settings")
public Response getRealmSettings() {
    requireManageEvents();
    var settings = new java.util.LinkedHashMap<String, Object>();
    settings.put("retentionEventDays",
            getRealmIntAttribute("_webhook.retention.events.days", 30));
    settings.put("retentionSendDays",
            getRealmIntAttribute("_webhook.retention.sends.days", 90));
    settings.put("circuitFailureThreshold",
            getRealmIntAttribute("_webhook.circuit.failure_threshold", 5));
    settings.put("circuitOpenSeconds",
            getRealmIntAttribute("_webhook.circuit.open_seconds", 60));
    return Response.ok(settings).build();
}

// --- PUT /realm-settings ---
@PUT
@Path("realm-settings")
public Response updateRealmSettings(java.util.Map<String, ?> body) {
    requireManageEvents();
    if (body == null) body = java.util.Collections.emptyMap();

    String[] fields = {
        "retentionEventDays", "retentionSendDays",
        "circuitFailureThreshold", "circuitOpenSeconds"
    };
    String[] attrs = {
        "_webhook.retention.events.days", "_webhook.retention.sends.days",
        "_webhook.circuit.failure_threshold", "_webhook.circuit.open_seconds"
    };

    for (int i = 0; i < fields.length; i++) {
        Object val = body.get(fields[i]);
        if (val == null) continue;
        int v;
        try {
            v = ((Number) val).intValue();
        } catch (ClassCastException e) {
            return Response.status(400)
                    .entity(fields[i] + " must be a positive integer")
                    .build();
        }
        if (v <= 0) {
            return Response.status(400)
                    .entity(fields[i] + " must be a positive integer")
                    .build();
        }
        realm.setAttribute(attrs[i], String.valueOf(v));
    }

    var updated = new java.util.LinkedHashMap<String, Object>();
    updated.put("retentionEventDays",
            getRealmIntAttribute("_webhook.retention.events.days", 30));
    updated.put("retentionSendDays",
            getRealmIntAttribute("_webhook.retention.sends.days", 90));
    updated.put("circuitFailureThreshold",
            getRealmIntAttribute("_webhook.circuit.failure_threshold", 5));
    updated.put("circuitOpenSeconds",
            getRealmIntAttribute("_webhook.circuit.open_seconds", 60));
    return Response.ok(updated).build();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
mvn test -pl . -Dtest="WebhooksResourceTest\$GetRealmSettings+WebhooksResourceTest\$UpdateRealmSettings" -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS`, all 6 tests pass.

- [ ] **Step 5: Run full unit test suite**

```bash
mvn test -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS`, no failures.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/dev/montell/keycloak/resources/WebhooksResource.java \
        src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java
git commit -m "feat: add GET/PUT /realm-settings endpoint for retention and circuit config"
```

---

## Task 2: Frontend types + API client

**Files:**
- Modify: `webhook-ui/src/api/types.ts`
- Modify: `webhook-ui/src/api/webhookApi.ts`

### Context

`types.ts` exports plain TypeScript interfaces (no classes, no decorators). `webhookApi.ts` exports `createWebhookApi()` which returns an object literal with all API methods. The internal `request<T>()` helper handles auth and JSON parsing. Both GET and PUT use the same `baseUrl` (`/realms/{realm}/webhooks`).

- [ ] **Step 1: Write failing type test** (TypeScript compiler check)

This task has no runtime test — TypeScript will fail to compile in Step 4 if the types are missing. Proceed to implementation.

- [ ] **Step 2: Add `RealmSettings` to types.ts**

In `webhook-ui/src/api/types.ts`, add after the `SendPayload` interface:

```ts
export interface RealmSettings {
  retentionEventDays: number;
  retentionSendDays: number;
  circuitFailureThreshold: number;
  circuitOpenSeconds: number;
}
```

- [ ] **Step 3: Add methods to webhookApi.ts**

In `webhook-ui/src/api/webhookApi.ts`, add the `RealmSettings` import:

```ts
import type {
  Webhook,
  WebhookInput,
  SecretStatus,
  CircuitState,
  TestResult,
  WebhookSend,
  ResendResult,
  SendResult,
  RotateSecretRequest,
  RotateSecretResponse,
  SendPayload,
  RealmSettings,
} from './types';
```

Then add two methods to the returned object (after `getSendPayload`):

```ts
getRealmSettings(): Promise<RealmSettings> {
  return request('/realm-settings');
},
updateRealmSettings(patch: Partial<RealmSettings>): Promise<RealmSettings> {
  return request('/realm-settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
},
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd webhook-ui
npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/api/types.ts webhook-ui/src/api/webhookApi.ts
git commit -m "feat: add RealmSettings type and API client methods"
```

---

## Task 3: App.tsx + SettingsPage + unit tests

**Files:**
- Modify: `webhook-ui/src/App.tsx`
- Modify: `webhook-ui/src/components/SettingsPage.tsx`
- Modify: `webhook-ui/src/__tests__/SettingsPage.test.tsx`

### Context

`App.tsx` uses `useSettings()` (localStorage) and passes local settings to `SettingsPage`. `SettingsPage` currently has props `settings: AppSettings` and `onUpdate: (patch: AppSettingsPatch) => void`. It uses the `RetryInput` component (defined inside `SettingsPage.tsx`) for numeric inputs.

`RetryInput` props: `label`, `fieldId`, `value: number | null`, `placeholder`, `onChange: (val: number | null) => void`. It calls `onChange(null)` on empty blur. For realm settings, if the user clears a field, we ignore the null (don't send a PUT) — the input will resync to the server value when `realmSettings` prop updates.

The existing unit tests import `SettingsPage` directly and pass `settings` + `onUpdate` props. New tests will also pass `realmSettings`, `realmSettingsLoading`, `realmSettingsError`, and `onUpdateRealmSettings`.

- [ ] **Step 1: Write failing unit tests for the new card**

Add to `webhook-ui/src/__tests__/SettingsPage.test.tsx`:

```tsx
import type { RealmSettings } from '../api/types';

const defaultRealmSettings: RealmSettings = {
  retentionEventDays: 30,
  retentionSendDays: 90,
  circuitFailureThreshold: 5,
  circuitOpenSeconds: 60,
};

describe('SettingsPage — Configurazione server card', () => {
  it('renders the card title', () => {
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={defaultRealmSettings}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    expect(screen.getByText('Configurazione server')).toBeInTheDocument();
  });

  it('shows values from realmSettings', () => {
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={defaultRealmSettings}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Event retention (days)')).toHaveValue(30);
    expect(screen.getByLabelText('Send retention (days)')).toHaveValue(90);
    expect(screen.getByLabelText('Circuit failure threshold')).toHaveValue(5);
    expect(screen.getByLabelText('Circuit open duration (seconds)')).toHaveValue(60);
  });

  it('calls onUpdateRealmSettings with correct field on blur', () => {
    const onUpdateRealmSettings = vi.fn();
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={defaultRealmSettings}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={onUpdateRealmSettings}
      />,
    );
    const input = screen.getByLabelText('Event retention (days)');
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.blur(input);
    expect(onUpdateRealmSettings).toHaveBeenCalledWith({ retentionEventDays: 45 });
  });

  it('does not call onUpdateRealmSettings when input is cleared (null)', () => {
    const onUpdateRealmSettings = vi.fn();
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={defaultRealmSettings}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={onUpdateRealmSettings}
      />,
    );
    const input = screen.getByLabelText('Event retention (days)');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onUpdateRealmSettings).not.toHaveBeenCalled();
  });

  it('shows Spinner when realmSettingsLoading is true', () => {
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={null}
        realmSettingsLoading={true}
        realmSettingsError={null}
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    // PatternFly Spinner has role="progressbar"
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows error Alert when realmSettingsError is set', () => {
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={null}
        realmSettingsLoading={false}
        realmSettingsError="Network error"
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd webhook-ui
npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|PASS|Error" | head -20
```

Expected: TypeScript compilation errors (missing props on `SettingsPage`) or test failures.

- [ ] **Step 3: Update SettingsPage.tsx — add props + new card**

Replace the `SettingsPageProps` interface and component signature:

```tsx
import { Alert, Spinner } from '@patternfly/react-core';
// (add Alert and Spinner to the existing import from '@patternfly/react-core')

import type { RealmSettings } from '../api/types';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (patch: AppSettingsPatch) => void;
  realmSettings: RealmSettings | null;
  realmSettingsLoading: boolean;
  realmSettingsError: string | null;
  onUpdateRealmSettings: (patch: Partial<RealmSettings>) => void;
}
```

Update the component signature:

```tsx
export function SettingsPage({
  settings,
  onUpdate,
  realmSettings,
  realmSettingsLoading,
  realmSettingsError,
  onUpdateRealmSettings,
}: SettingsPageProps) {
```

Add the new card after the existing "Cronologia consegne" card (inside the `<>` fragment):

```tsx
<Card style={{ marginTop: 16 }}>
  <CardTitle>Configurazione server</CardTitle>
  <CardBody>
    {realmSettingsLoading && <Spinner size="sm" aria-label="Loading server settings" />}
    {realmSettingsError && (
      <Alert variant="danger" isInline title={realmSettingsError} style={{ marginBottom: 8 }} />
    )}
    {!realmSettingsLoading && !realmSettingsError && realmSettings && (
      <Form>
        <RetryInput
          label="Event retention (days)"
          fieldId="retention-event-days"
          value={realmSettings.retentionEventDays}
          placeholder="30"
          onChange={(val) => { if (val !== null) onUpdateRealmSettings({ retentionEventDays: val }); }}
        />
        <RetryInput
          label="Send retention (days)"
          fieldId="retention-send-days"
          value={realmSettings.retentionSendDays}
          placeholder="90"
          onChange={(val) => { if (val !== null) onUpdateRealmSettings({ retentionSendDays: val }); }}
        />
        <RetryInput
          label="Circuit failure threshold"
          fieldId="circuit-failure-threshold"
          value={realmSettings.circuitFailureThreshold}
          placeholder="5"
          onChange={(val) => { if (val !== null) onUpdateRealmSettings({ circuitFailureThreshold: val }); }}
        />
        <RetryInput
          label="Circuit open duration (seconds)"
          fieldId="circuit-open-seconds"
          value={realmSettings.circuitOpenSeconds}
          placeholder="60"
          onChange={(val) => { if (val !== null) onUpdateRealmSettings({ circuitOpenSeconds: val }); }}
        />
      </Form>
    )}
  </CardBody>
</Card>
```

- [ ] **Step 4: Update App.tsx — add state + useEffect + handler**

Add `useState` and `useEffect` to the existing React import if not already there. Add `RealmSettings` import from `'./api/types'`.

Replace the `App` component body with:

```tsx
export function App({ api }: AppProps) {
  const [activeTab, setActiveTab] = useState<string | number>('webhooks');
  const { settings, updateSettings } = useSettings();

  const [realmSettings, setRealmSettings] = useState<RealmSettings | null>(null);
  const [realmSettingsLoading, setRealmSettingsLoading] = useState(true);
  const [realmSettingsError, setRealmSettingsError] = useState<string | null>(null);

  useEffect(() => {
    api.getRealmSettings()
      .then(setRealmSettings)
      .catch((e: unknown) =>
        setRealmSettingsError(e instanceof Error ? e.message : 'Failed to load server settings'),
      )
      .finally(() => setRealmSettingsLoading(false));
  }, [api]);

  const handleUpdateRealmSettings = async (patch: Partial<RealmSettings>) => {
    try {
      const updated = await api.updateRealmSettings(patch);
      setRealmSettings(updated);
      setRealmSettingsError(null);
    } catch (e: unknown) {
      setRealmSettingsError(e instanceof Error ? e.message : 'Failed to update server settings');
    }
  };

  return (
    <ErrorBoundary>
      <Page>
        <PageSection variant="light" type="tabs">
          <Tabs
            activeKey={activeTab}
            onSelect={(_event, key) => setActiveTab(key)}
            aria-label="Main navigation"
          >
            <Tab eventKey="webhooks" title={<TabTitleText>Webhooks</TabTitleText>} />
            <Tab eventKey="metrics" title={<TabTitleText>Metriche</TabTitleText>} />
            <Tab eventKey="settings" title={<TabTitleText>Impostazioni</TabTitleText>} />
          </Tabs>
        </PageSection>
        <PageSection>
          {activeTab === 'webhooks' && (
            <WebhookTable api={api} defaults={settings.webhookDefaults} pageSize={settings.deliveryHistoryPageSize} />
          )}
          {activeTab === 'metrics' && (
            <MetricsPage api={api} refreshInterval={settings.metricsRefreshInterval} />
          )}
          {activeTab === 'settings' && (
            <SettingsPage
              settings={settings}
              onUpdate={updateSettings}
              realmSettings={realmSettings}
              realmSettingsLoading={realmSettingsLoading}
              realmSettingsError={realmSettingsError}
              onUpdateRealmSettings={handleUpdateRealmSettings}
            />
          )}
        </PageSection>
      </Page>
    </ErrorBoundary>
  );
}
```

Also add the import for `RealmSettings` at the top:

```ts
import type { RealmSettings } from './api/types';
```

- [ ] **Step 5: Update existing SettingsPage tests that don't pass the new props**

All existing `SettingsPage` test renders must add the new required props. Update every `render(<SettingsPage ...` call in `SettingsPage.test.tsx` to include:

```tsx
realmSettings={null}
realmSettingsLoading={false}
realmSettingsError={null}
onUpdateRealmSettings={vi.fn()}
```

Example — the first test becomes:

```tsx
it('renders 4 radio options', () => {
  render(
    <SettingsPage
      settings={defaultSettings}
      onUpdate={vi.fn()}
      realmSettings={null}
      realmSettingsLoading={false}
      realmSettingsError={null}
      onUpdateRealmSettings={vi.fn()}
    />,
  );
  expect(screen.getByRole('radio', { name: '5 secondi' })).toBeInTheDocument();
  // ...
```

Apply this pattern to ALL existing test cases in the `SettingsPage` describe block.

- [ ] **Step 6: Run unit tests to verify they all pass**

```bash
cd webhook-ui
npm test 2>&1 | tail -20
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add webhook-ui/src/App.tsx \
        webhook-ui/src/components/SettingsPage.tsx \
        webhook-ui/src/__tests__/SettingsPage.test.tsx
git commit -m "feat: add realm settings card to SettingsPage"
```

---

## Task 4: OpenAPI spec

**Files:**
- Modify: `docs/openapi.yaml`

### Context

The drift check (`make openapi-diff`) counts `@(GET|POST|PUT|DELETE|PATCH)` annotations in `WebhooksResource.java` (excluding `@Path("ui"`) annotations) and `get|post|put|delete|patch:` lines in `docs/openapi.yaml`. Currently 20/20. After Task 1 we have 22 JAX-RS endpoints — we need 22 OpenAPI operations. Adding `/realm-settings` with `get` + `put` = +2.

There is no `BadRequest` reusable response component in `openapi.yaml` — the existing 400 responses are inline. Follow the same inline pattern.

- [ ] **Step 1: Add /realm-settings paths**

Insert the following YAML block just before the `  /metrics:` line (around line 618 of `docs/openapi.yaml`):

```yaml
  /realm-settings:
    get:
      operationId: getRealmSettings
      summary: Get realm-level webhook configuration
      tags: [Settings]
      security:
        - bearerAuth: []
      responses:
        "200":
          description: Realm settings
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/RealmSettings"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
    put:
      operationId: updateRealmSettings
      summary: Update realm-level webhook configuration
      tags: [Settings]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/RealmSettings"
      responses:
        "200":
          description: Updated realm settings
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/RealmSettings"
        "400":
          description: One or more fields are not positive integers
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"

```

- [ ] **Step 2: Add RealmSettings schema**

In the `components.schemas` section (after `SendPayload`), add:

```yaml
    RealmSettings:
      type: object
      properties:
        retentionEventDays:
          type: integer
          description: Days to retain webhook events (default 30)
          example: 30
        retentionSendDays:
          type: integer
          description: Days to retain webhook send records (default 90)
          example: 90
        circuitFailureThreshold:
          type: integer
          description: Failures before circuit opens (default 5)
          example: 5
        circuitOpenSeconds:
          type: integer
          description: Seconds the circuit stays open (default 60)
          example: 60

```

- [ ] **Step 3: Run drift check**

```bash
make openapi-diff BUILD=local 2>&1 | tail -10
```

Expected output:
```
  JAX-RS endpoints: 22
  OpenAPI operations: 22
✅ Spec and code are in sync (22 operations each)
```

- [ ] **Step 4: Commit**

```bash
git add -f docs/openapi.yaml
git commit -m "docs(openapi): add /realm-settings GET+PUT paths and RealmSettings schema"
```

---

## Task 5: E2E test

**Files:**
- Create: `e2e/tests/09-realm-settings.spec.ts`

### Context

E2E tests use Playwright with custom fixtures from `../fixtures/ports` (provides `page`, `keycloakUrl`, `adminToken`, `consumerPublicUrl`). The UI is at `${keycloakUrl}/realms/demo/webhooks/ui`. The "Impostazioni" tab is the third tab.

The test verifies that:
1. Default realm settings values appear in the UI inputs.
2. After changing `retentionEventDays` to 45 and saving, the value persists after a page reload (i.e., the PUT was saved server-side and the GET on reload returns the new value).

After the test changes the value to 45, it must reset it back to 30 to avoid test pollution for subsequent runs. Do this via `waitForResponse` + a second change.

- [ ] **Step 1: Create the test file**

```typescript
// e2e/tests/09-realm-settings.spec.ts
import { test, expect } from '../fixtures/ports';

test('Realm settings: default values visible and changes persist after reload', async ({
  page,
  keycloakUrl,
}) => {
  // 1. Navigate to UI → Impostazioni tab
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.getByRole('tab', { name: 'Impostazioni' }).click();

  // 2. Wait for the server settings card to appear
  await expect(page.getByText('Configurazione server')).toBeVisible({ timeout: 10_000 });

  // 3. Verify default values are displayed
  await expect(page.getByLabel('Event retention (days)')).toHaveValue('30');
  await expect(page.getByLabel('Send retention (days)')).toHaveValue('90');
  await expect(page.getByLabel('Circuit failure threshold')).toHaveValue('5');
  await expect(page.getByLabel('Circuit open duration (seconds)')).toHaveValue('60');

  // 4. Change retentionEventDays to 45
  const eventDaysInput = page.getByLabel('Event retention (days)');
  await eventDaysInput.fill('45');
  const putPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/realm-settings') && resp.request().method() === 'PUT',
  );
  await eventDaysInput.blur();
  await putPromise;

  // 5. Reload the page and verify the change persisted
  await page.reload();
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByText('Configurazione server')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('Event retention (days)')).toHaveValue('45');

  // 6. Reset to default (30) to avoid polluting other test runs
  const eventDaysInput2 = page.getByLabel('Event retention (days)');
  await eventDaysInput2.fill('30');
  const resetPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/realm-settings') && resp.request().method() === 'PUT',
  );
  await eventDaysInput2.blur();
  await resetPromise;
});
```

- [ ] **Step 2: Run E2E test locally (requires Docker stack running)**

```bash
cd e2e
npx playwright test 09-realm-settings.spec.ts --reporter=line 2>&1 | tail -20
```

Expected: 1 test passes.

- [ ] **Step 3: Run full E2E suite to check for regressions**

```bash
cd e2e
npx playwright test --reporter=line 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/09-realm-settings.spec.ts
git commit -m "test(e2e): add realm settings visibility and persistence test"
```
