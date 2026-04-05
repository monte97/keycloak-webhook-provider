# Resend by Delivery ID — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `?force=true` query parameter to the existing resend endpoint and a per-row Resend button in the delivery drawer UI.

**Architecture:** The backend change is a single guard condition in `WebhooksResource.resendSingle()`. The frontend adds a per-row action button with a confirmation dialog when the circuit breaker is OPEN. No schema migration, no new endpoints.

**Tech Stack:** Java 17 / JAX-RS (backend), React / PatternFly 5 (frontend), Vitest (frontend tests), JUnit 5 + Mockito (backend tests)

---

### Task 1: Backend — add `force` parameter to `resendSingle()`

**Files:**
- Modify: `src/main/java/dev/montell/keycloak/resources/WebhooksResource.java:272`
- Test: `src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java:286-344`

- [ ] **Step 1: Write the new failing test — force bypasses open circuit**

In `src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java`, add this test after `resend_single_409_circuit_open` (after line 344):

```java
@Test
void resend_single_force_bypasses_open_circuit() {
    // threshold=1 → one onFailure() opens circuit
    CircuitBreakerRegistry realRegistry = new CircuitBreakerRegistry(1, 60);
    WebhookComponentHolder.init(sender, realRegistry);

    WebhookModel w = mockWebhook("wh-1");
    when(w.getCircuitState()).thenReturn(CircuitBreaker.OPEN);
    when(w.getFailureCount()).thenReturn(1);
    when(w.getLastFailureAt()).thenReturn(Instant.now());

    WebhookSendModel s = mockSend("send-1", "wh-1", "ev-1");
    WebhookEventModel e = mockEvent("ev-1", "wh-1");

    when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
    when(provider.getSendById(realm, "send-1")).thenReturn(s);
    when(provider.getEventById(realm, "ev-1")).thenReturn(e);
    when(sender.send(anyString(), anyString(), anyString(), any(), any()))
            .thenReturn(new HttpSendResult(200, true, 10L, null));

    Response resp = resource.resendSingle("wh-1", "send-1", true);

    assertEquals(200, resp.getStatus());
    verify(provider).storeSend(realm, "wh-1", "ev-1", "access.LOGIN", 200, true, 1);
}
```

- [ ] **Step 2: Run tests to verify the new test fails (method signature doesn't exist yet)**

Run: `make test-unit BUILD=local`
Expected: compilation error — `resendSingle(String, String, boolean)` does not exist.

- [ ] **Step 3: Add `force` parameter to `resendSingle()` and update the circuit breaker guard**

In `src/main/java/dev/montell/keycloak/resources/WebhooksResource.java`, change the method signature at line 272 from:

```java
public Response resendSingle(@PathParam("id") String id, @PathParam("sid") String sid) {
```

to:

```java
public Response resendSingle(
        @PathParam("id") String id,
        @PathParam("sid") String sid,
        @QueryParam("force") @DefaultValue("false") boolean force) {
```

Add these imports if not already present:

```java
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.DefaultValue;
```

Then change the circuit breaker guard (lines 289-292) from:

```java
if (!cb.allowRequest())
    return Response.status(409)
            .entity("Circuit breaker is OPEN — reset it first via POST /{id}/circuit/reset")
            .build();
```

to:

```java
if (!force && !cb.allowRequest())
    return Response.status(409)
            .entity("Circuit breaker is OPEN — reset it first via POST /{id}/circuit/reset")
            .build();
```

- [ ] **Step 4: Update all existing test callsites to add the `force` parameter**

In `src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java`, update these 4 lines:

Line 302:
```java
// Before:
Response resp = resource.resendSingle("wh-1", "send-1");
// After:
Response resp = resource.resendSingle("wh-1", "send-1", false);
```

Line 312:
```java
// Before:
assertThrows(NotFoundException.class, () -> resource.resendSingle("missing", "send-1"));
// After:
assertThrows(NotFoundException.class, () -> resource.resendSingle("missing", "send-1", false));
```

Line 321:
```java
// Before:
assertThrows(NotFoundException.class, () -> resource.resendSingle("wh-1", "missing-send"));
// After:
assertThrows(NotFoundException.class, () -> resource.resendSingle("wh-1", "missing-send", false));
```

Line 341:
```java
// Before:
Response resp = resource.resendSingle("wh-1", "send-1");
// After:
Response resp = resource.resendSingle("wh-1", "send-1", false);
```

- [ ] **Step 5: Run tests to verify everything passes**

Run: `make test-unit BUILD=local`
Expected: all tests pass, including the new `resend_single_force_bypasses_open_circuit`.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/dev/montell/keycloak/resources/WebhooksResource.java \
       src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java
git commit -m "feat: add force flag to resendSingle to bypass circuit breaker"
```

---

### Task 2: OpenAPI — add `force` query parameter

**Files:**
- Modify: `docs/openapi.yaml:417-458`

- [ ] **Step 1: Add the `force` query parameter to the resend operation**

In `docs/openapi.yaml`, in the `/{id}/sends/{sendId}/resend` operation, add the `force` query parameter to the `parameters` list (after the `sendId` parameter, around line 431):

```yaml
      - name: force
        in: query
        required: false
        description: If true, bypass the circuit breaker OPEN check and dispatch unconditionally
        schema:
          type: boolean
          default: false
```

Also update the `description` field of the operation (line 422) to mention the force flag:

```yaml
      description: |
        Retries a specific failed send. Respects circuit breaker state —
        returns 409 if the circuit is OPEN (unless force=true).
```

- [ ] **Step 2: Run OpenAPI lint and diff check**

Run: `make openapi-lint BUILD=local && make openapi-diff BUILD=local`
Expected: lint passes. The diff check may fail because the code now has `force` but the diff check compares spec vs code — since we updated both, it should pass. If `openapi-diff` fails, check the error and adjust.

- [ ] **Step 3: Commit**

```bash
git add docs/openapi.yaml
git commit -m "docs: add force query param to resendSingle in OpenAPI spec"
```

---

### Task 3: Frontend API — add `resendSingle()` method

**Files:**
- Modify: `webhook-ui/src/api/types.ts`
- Modify: `webhook-ui/src/api/webhookApi.ts`

- [ ] **Step 1: Add `SendResult` type to `types.ts`**

In `webhook-ui/src/api/types.ts`, add this interface after `ResendResult` (after line 59):

```ts
export interface SendResult {
  httpStatus: number;
  success: boolean;
  durationMs: number;
}
```

- [ ] **Step 2: Add `resendSingle()` to `webhookApi.ts`**

In `webhook-ui/src/api/webhookApi.ts`, add the import for `SendResult` in the type import block (line 1):

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
} from './types';
```

Then add the `resendSingle` method to the returned object, after `resendFailed` (after line 82):

```ts
    resendSingle(webhookId: string, sendId: string, force = false): Promise<SendResult> {
      return request(`/${webhookId}/sends/${sendId}/resend?force=${force}`, { method: 'POST' });
    },
```

- [ ] **Step 3: Run frontend unit tests**

Run: `cd webhook-ui && npx vitest run`
Expected: all existing tests pass (the new method is just an addition, nothing calls it yet).

- [ ] **Step 4: Commit**

```bash
git add webhook-ui/src/api/types.ts webhook-ui/src/api/webhookApi.ts
git commit -m "feat(ui): add resendSingle API method with force flag"
```

---

### Task 4: Frontend UI — per-row Resend button and confirmation dialog

**Files:**
- Modify: `webhook-ui/src/components/DeliveryDrawer.tsx`
- Modify: `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx`

- [ ] **Step 1: Write the failing test — Resend button calls `resendSingle`**

In `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx`, add `resendSingle` to the `makeApi` mock (add after the `resendFailed` line, around line 72):

```ts
    resendSingle: vi.fn().mockResolvedValue({ httpStatus: 200, success: true, durationMs: 10 }),
```

Then add this test at the end of the `describe` block (before the closing `});`):

```ts
  it('per-row Resend button calls resendSingle and reloads sends', async () => {
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    const resendButtons = screen.getAllByRole('button', { name: /^resend$/i });
    expect(resendButtons).toHaveLength(2); // one per row

    fireEvent.click(resendButtons[0]);

    await waitFor(() => {
      expect(api.resendSingle).toHaveBeenCalledWith('w1', 's1', false);
    });
    // Reloads sends after resend
    expect(api.getSends).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run`
Expected: FAIL — no Resend button exists yet.

- [ ] **Step 3: Add Resend button to each delivery row in `DeliveryDrawer.tsx`**

In `webhook-ui/src/components/DeliveryDrawer.tsx`:

First, add `resendingSendId` state after `resettingCircuit` state (after line 49):

```ts
const [resendingSendId, setResendingSendId] = useState<string | null>(null);
```

Add the per-row resend handler after `handleResetCircuit` (after line 124):

```ts
  const handleResendSingle = async (sendId: string) => {
    if (!webhook) return;
    const isOpen = circuit?.state === 'OPEN';
    setResendingSendId(sendId);
    try {
      await api.resendSingle(webhook.id, sendId, false);
      await loadSends(webhook.id, filter);
    } catch (e) {
      setSendsError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResendingSendId(null);
    }
  };
```

Add a 5th column header `Actions` in the `<Thead>` (after the "Sent at" `<Th>`, line 249):

```tsx
<Th>Actions</Th>
```

Update the "No deliveries found" row to span 5 columns instead of 4 (line 255):

```tsx
<Td colSpan={5} style={{ textAlign: 'center', color: '#6a6e73' }}>
```

Add the Resend button cell in the row rendering, after the "Sent at" `<Td>` (after line 271):

```tsx
<Td dataLabel="Actions">
  <Button
    variant="link"
    size="sm"
    isLoading={resendingSendId === s.id}
    isDisabled={resendingSendId !== null}
    onClick={() => handleResendSingle(s.id)}
  >
    Resend
  </Button>
</Td>
```

- [ ] **Step 4: Run tests to verify the basic Resend button test passes**

Run: `cd webhook-ui && npx vitest run`
Expected: the new test passes.

- [ ] **Step 5: Write the failing test — circuit OPEN shows confirmation dialog**

Add this test in `webhook-ui/src/__tests__/DeliveryDrawer.test.tsx`:

```ts
  it('shows confirmation dialog when circuit is OPEN and Resend clicked', async () => {
    api = makeApi({ getCircuit: vi.fn().mockResolvedValue(openCircuit) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    const resendButtons = screen.getAllByRole('button', { name: /^resend$/i });
    fireEvent.click(resendButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/circuit breaker is currently OPEN/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('checkbox', { name: /force send/i })).toBeInTheDocument();
  });

  it('confirmation dialog with force checkbox calls resendSingle with force=true', async () => {
    api = makeApi({ getCircuit: vi.fn().mockResolvedValue(openCircuit) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    const resendButtons = screen.getAllByRole('button', { name: /^resend$/i });
    fireEvent.click(resendButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/circuit breaker is currently OPEN/i)).toBeInTheDocument();
    });

    // Check the force checkbox
    fireEvent.click(screen.getByRole('checkbox', { name: /force send/i }));
    // Click the confirm Resend button in the dialog
    fireEvent.click(screen.getByRole('button', { name: /^confirm resend$/i }));

    await waitFor(() => {
      expect(api.resendSingle).toHaveBeenCalledWith('w1', 's1', true);
    });
  });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd webhook-ui && npx vitest run`
Expected: FAIL — no confirmation dialog exists yet.

- [ ] **Step 7: Add confirmation dialog to `DeliveryDrawer.tsx`**

Add `Modal`, `ModalBody`, `ModalFooter`, `ModalHeader`, `Checkbox` to the PatternFly imports (line 2):

```ts
import {
  DrawerPanelContent,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
  Button,
  Spinner,
  Alert,
  Label,
  Title,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Checkbox,
} from '@patternfly/react-core';
```

Add state for the confirmation dialog, after `resendingSendId` state:

```ts
const [confirmResendId, setConfirmResendId] = useState<string | null>(null);
const [forceResend, setForceResend] = useState(false);
```

Replace `handleResendSingle` with a version that checks circuit state:

```ts
  const handleResendSingle = async (sendId: string) => {
    if (!webhook) return;
    if (circuit?.state === 'OPEN') {
      setConfirmResendId(sendId);
      setForceResend(false);
      return;
    }
    setResendingSendId(sendId);
    try {
      await api.resendSingle(webhook.id, sendId, false);
      await loadSends(webhook.id, filter);
    } catch (e) {
      setSendsError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResendingSendId(null);
    }
  };

  const handleConfirmResend = async () => {
    if (!webhook || !confirmResendId) return;
    setConfirmResendId(null);
    setResendingSendId(confirmResendId);
    try {
      await api.resendSingle(webhook.id, confirmResendId, forceResend);
      await loadSends(webhook.id, filter);
    } catch (e) {
      setSendsError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResendingSendId(null);
    }
  };
```

Add the Modal JSX at the end of the component, right before the closing `</DrawerPanelContent>` (before line 279):

```tsx
        {confirmResendId !== null && (
          <Modal
            variant="small"
            isOpen
            onClose={() => setConfirmResendId(null)}
            aria-label="Confirm resend"
          >
            <ModalHeader title="Confirm resend" />
            <ModalBody>
              <Alert
                variant="warning"
                isInline
                title="The circuit breaker is currently OPEN. The endpoint may still be unreachable."
                style={{ marginBottom: 16 }}
              />
              <Checkbox
                id="force-resend"
                label="Force send anyway"
                isChecked={forceResend}
                onChange={(_event, checked) => setForceResend(checked)}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="primary" onClick={handleConfirmResend}>
                Confirm resend
              </Button>
              <Button variant="link" onClick={() => setConfirmResendId(null)}>
                Cancel
              </Button>
            </ModalFooter>
          </Modal>
        )}
```

- [ ] **Step 8: Run all tests**

Run: `cd webhook-ui && npx vitest run`
Expected: all tests pass, including the two new confirmation dialog tests.

- [ ] **Step 9: Run Spotless formatting check and fix if needed**

Run: `make fmt-check BUILD=local`
If it fails: `make fmt BUILD=local` then re-verify.

- [ ] **Step 10: Commit**

```bash
git add webhook-ui/src/components/DeliveryDrawer.tsx \
       webhook-ui/src/__tests__/DeliveryDrawer.test.tsx
git commit -m "feat(ui): add per-row Resend button with circuit breaker force dialog"
```
