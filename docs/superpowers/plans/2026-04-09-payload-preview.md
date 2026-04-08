# Payload Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "View payload" button to each send row in the delivery drawer that opens a modal with the pretty-printed JSON payload that was dispatched.

**Architecture:** New `GET /{id}/sends/{sendId}/payload` endpoint loads send → event → returns `{ eventObject }`. Frontend fetches on-demand when user clicks; modal renders pretty-printed JSON with a copy button.

**Tech Stack:** Java JAX-RS, React + PatternFly v5, Vitest, Playwright.

---

## File map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/main/java/dev/montell/keycloak/resources/WebhooksResource.java` | Modify | New `getSendPayload` endpoint |
| `src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java` | Modify | Unit tests for the new endpoint |
| `docs/openapi.yaml` | Modify | Document new path + `SendPayload` schema |
| `webhook-ui/src/api/types.ts` | Modify | Add `SendPayload` interface |
| `webhook-ui/src/api/webhookApi.ts` | Modify | Add `getSendPayload` method |
| `webhook-ui/src/components/PayloadPreviewModal.tsx` | Create | Modal: pretty JSON + copy button |
| `webhook-ui/src/__tests__/PayloadPreviewModal.test.tsx` | Create | Unit tests for the modal |
| `webhook-ui/src/components/DeliveryDrawer.tsx` | Modify | Wire "View payload" button + modal |
| `e2e/tests/08-payload-preview.spec.ts` | Create | E2E: open modal, verify content |

---

### Task 1: Backend endpoint `GET /{id}/sends/{sendId}/payload`

**Files:**
- Modify: `src/main/java/dev/montell/keycloak/resources/WebhooksResource.java`
- Test: `src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java`

**Context:** `WebhookProvider` already has `getSendById(RealmModel, String)` and `getEventById(RealmModel, String)`. `mockWebhook`, `mockEvent`, `mockSend` helpers are already in the test class. `mockEvent` sets `getEventObject()` → `"{\"type\":\"access.LOGIN\"}"`.

- [ ] **Step 1: Write the failing tests**

Add a new nested class `// --- GET /{id}/sends/{sendId}/payload ---` at the end of `WebhooksResourceTest.java`, before the closing `}` of the outer class:

```java
// -----------------------------------------------------------------------
// GET /{id}/sends/{sendId}/payload
// -----------------------------------------------------------------------
@Nested
class GetSendPayload {

    @Test
    void returns_eventObject_for_known_send() {
        WebhookModel w = mockWebhook("wh-1");
        WebhookSendModel s = mockSend("send-1", "wh-1", "ev-1");
        WebhookEventModel e = mockEvent("ev-1", "wh-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
        when(provider.getSendById(realm, "send-1")).thenReturn(s);
        when(provider.getEventById(realm, "ev-1")).thenReturn(e);

        Response resp = resource.getSendPayload("wh-1", "send-1");

        assertEquals(200, resp.getStatus());
        @SuppressWarnings("unchecked")
        java.util.Map<String, Object> body = (java.util.Map<String, Object>) resp.getEntity();
        assertEquals("{\"type\":\"access.LOGIN\"}", body.get("eventObject"));
    }

    @Test
    void returns_404_when_webhook_not_found() {
        when(provider.getWebhookById(realm, "missing")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.getSendPayload("missing", "send-1"));
    }

    @Test
    void returns_404_when_send_not_found() {
        WebhookModel w = mockWebhook("wh-1");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
        when(provider.getSendById(realm, "missing-send")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.getSendPayload("wh-1", "missing-send"));
    }

    @Test
    void returns_404_when_event_not_found() {
        WebhookModel w = mockWebhook("wh-1");
        WebhookSendModel s = mockSend("send-1", "wh-1", "ev-deleted");
        when(provider.getWebhookById(realm, "wh-1")).thenReturn(w);
        when(provider.getSendById(realm, "send-1")).thenReturn(s);
        when(provider.getEventById(realm, "ev-deleted")).thenReturn(null);
        assertThrows(NotFoundException.class, () -> resource.getSendPayload("wh-1", "send-1"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/project
mvn test -pl . -Dtest=WebhooksResourceTest#GetSendPayload* -q 2>&1 | tail -10
```

Expected: `FAILED` — `getSendPayload` does not exist yet.

- [ ] **Step 3: Implement the endpoint**

In `WebhooksResource.java`, add this method after the `resendSingle` method (search for `@Path("{id}/sends/{sid}/resend")`):

```java
// --- GET /{id}/sends/{sendId}/payload ---
@GET
@Path("{id}/sends/{sendId}/payload")
public Response getSendPayload(
        @PathParam("id") String id,
        @PathParam("sendId") String sendId) {
    requireManageEvents();
    if (provider().getWebhookById(realm, id) == null) throw new NotFoundException();
    WebhookSendModel send = provider().getSendById(realm, sendId);
    if (send == null) throw new NotFoundException();
    WebhookEventModel event = provider().getEventById(realm, send.getWebhookEventId());
    if (event == null) throw new NotFoundException();
    return Response.ok(java.util.Map.of("eventObject", event.getEventObject())).build();
}
```

`WebhookSendModel` and `WebhookEventModel` are already imported. `NotFoundException` is in `jakarta.ws.rs.*` which is already wildcard-imported.

- [ ] **Step 4: Run tests to verify they pass**

```bash
mvn test -pl . -Dtest=WebhooksResourceTest#GetSendPayload* -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS`, 4 tests passing.

- [ ] **Step 5: Run full unit test suite**

```bash
mvn test -q 2>&1 | tail -5
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/dev/montell/keycloak/resources/WebhooksResource.java \
        src/test/java/dev/montell/keycloak/unit/WebhooksResourceTest.java
git commit -m "feat(api): add GET /{id}/sends/{sendId}/payload endpoint"
```

---

### Task 2: OpenAPI spec

**Files:**
- Modify: `docs/openapi.yaml`

**Context:** The CI drift check counts JAX-RS `@(GET|POST|PUT|DELETE|PATCH)` annotations vs OpenAPI operations. Adding `getSendPayload` (GET) raises the JAX-RS count by 1 — add exactly 1 operation to the spec.

- [ ] **Step 1: Add the new path**

In `docs/openapi.yaml`, add the following block after the `/{id}/sends/{sendId}/resend:` path block (search for `operationId: resendSingle`):

```yaml
  /{id}/sends/{sendId}/payload:
    get:
      operationId: getSendPayload
      summary: Get the event payload for a send attempt
      description: |
        Returns the original Keycloak event JSON that was dispatched for this
        send attempt. Returns 404 if the send does not exist or if the event
        has been removed by the retention policy.
      tags: [Sends]
      parameters:
        - $ref: "#/components/parameters/webhookId"
        - name: sendId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: Event payload
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SendPayload"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"
```

- [ ] **Step 2: Add the `SendPayload` schema**

In the `components.schemas` section at the bottom of `docs/openapi.yaml`, add after `BulkResendResult`:

```yaml
    SendPayload:
      type: object
      properties:
        eventObject:
          type: string
          description: Full JSON payload of the original Keycloak event
```

- [ ] **Step 3: Commit**

```bash
git add docs/openapi.yaml
git commit -m "docs(openapi): add getSendPayload endpoint"
```

---

### Task 3: TypeScript type + API client method

**Files:**
- Modify: `webhook-ui/src/api/types.ts`
- Modify: `webhook-ui/src/api/webhookApi.ts`

- [ ] **Step 1: Add `SendPayload` interface to `types.ts`**

In `webhook-ui/src/api/types.ts`, add after the `RotateSecretResponse` interface:

```typescript
export interface SendPayload {
  eventObject: string;
}
```

- [ ] **Step 2: Add `getSendPayload` to `webhookApi.ts`**

In `webhook-ui/src/api/webhookApi.ts`, add the import at the top (in the existing import block):

```typescript
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
} from './types';
```

Then in the returned object, add after `resendSingle`:

```typescript
    getSendPayload(webhookId: string, sendId: string): Promise<SendPayload> {
      return request(`/${webhookId}/sends/${sendId}/payload`);
    },
```

- [ ] **Step 3: Type-check**

```bash
cd webhook-ui && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add webhook-ui/src/api/types.ts webhook-ui/src/api/webhookApi.ts
git commit -m "feat(ui): add SendPayload type and getSendPayload API method"
```

---

### Task 4: `PayloadPreviewModal` component

**Files:**
- Create: `webhook-ui/src/components/PayloadPreviewModal.tsx`
- Create: `webhook-ui/src/__tests__/PayloadPreviewModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `webhook-ui/src/__tests__/PayloadPreviewModal.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PayloadPreviewModal } from '../components/PayloadPreviewModal';

describe('PayloadPreviewModal', () => {
  it('renders pretty-printed JSON when eventObject is provided', () => {
    render(
      <PayloadPreviewModal
        isOpen
        eventObject='{"type":"access.LOGIN","realmId":"demo"}'
        errorMessage={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Event payload')).toBeInTheDocument();
    expect(screen.getByText(/"type": "access\.LOGIN"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeInTheDocument();
  });

  it('renders error message when errorMessage is provided', () => {
    render(
      <PayloadPreviewModal
        isOpen
        eventObject={null}
        errorMessage="Event not found (may have been removed by retention)"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Event payload')).toBeInTheDocument();
    expect(
      screen.getByText('Event not found (may have been removed by retention)'),
    ).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <PayloadPreviewModal
        isOpen={false}
        eventObject='{"x":1}'
        errorMessage={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('Event payload')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd webhook-ui && npx vitest run src/__tests__/PayloadPreviewModal.test.tsx 2>&1 | tail -15
```

Expected: `FAIL` — `PayloadPreviewModal` does not exist.

- [ ] **Step 3: Implement the component**

Create `webhook-ui/src/components/PayloadPreviewModal.tsx`:

```typescript
import { Modal, ModalVariant, Button, Alert } from '@patternfly/react-core';

interface PayloadPreviewModalProps {
  isOpen: boolean;
  eventObject: string | null;
  errorMessage: string | null;
  onClose: () => void;
}

export function PayloadPreviewModal({
  isOpen,
  eventObject,
  errorMessage,
  onClose,
}: PayloadPreviewModalProps) {
  const prettyJson = eventObject
    ? (() => {
        try {
          return JSON.stringify(JSON.parse(eventObject), null, 2);
        } catch {
          return eventObject;
        }
      })()
    : null;

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Event payload"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="close" variant="primary" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      {errorMessage && (
        <Alert variant="warning" isInline title={errorMessage} style={{ marginBottom: 12 }} />
      )}
      {prettyJson && (
        <>
          <pre
            style={{
              overflow: 'auto',
              maxHeight: 400,
              padding: 12,
              background: 'var(--pf-v5-global--BackgroundColor--200, #f4f4f4)',
              borderRadius: 4,
              fontSize: '0.85em',
              marginBottom: 8,
            }}
          >
            {prettyJson}
          </pre>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigator.clipboard.writeText(prettyJson)}
          >
            Copy to clipboard
          </Button>
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd webhook-ui && npx vitest run src/__tests__/PayloadPreviewModal.test.tsx 2>&1 | tail -10
```

Expected: 3 tests passing.

- [ ] **Step 5: Run full frontend test suite**

```bash
cd webhook-ui && npx vitest run 2>&1 | tail -5
```

Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add webhook-ui/src/components/PayloadPreviewModal.tsx \
        webhook-ui/src/__tests__/PayloadPreviewModal.test.tsx
git commit -m "feat(ui): add PayloadPreviewModal component"
```

---

### Task 5: Wire `PayloadPreviewModal` into `DeliveryDrawer`

**Files:**
- Modify: `webhook-ui/src/components/DeliveryDrawer.tsx`

**Context:** The sends table is at lines ~367-413. The "Actions" `<Td>` already contains the "Resend" `<Button>`. Add a "Payload" button alongside it. Add state for loading and modal display.

- [ ] **Step 1: Add import**

At the top of `DeliveryDrawer.tsx`, add the import:

```typescript
import { PayloadPreviewModal } from './PayloadPreviewModal';
```

- [ ] **Step 2: Add state**

Inside `DeliveryDrawer` function, after the existing `const [rotationError, setRotationError] = useState<string | null>(null);` line, add:

```typescript
const [loadingPayloadId, setLoadingPayloadId] = useState<string | null>(null);
const [payloadEventObject, setPayloadEventObject] = useState<string | null>(null);
const [payloadError, setPayloadError] = useState<string | null>(null);
```

- [ ] **Step 3: Add handler**

After the `handleCompleteRotation` function, add:

```typescript
const handleViewPayload = async (sendId: string) => {
  setLoadingPayloadId(sendId);
  setPayloadEventObject(null);
  setPayloadError(null);
  try {
    const result = await api.getSendPayload(webhook!.id, sendId);
    setPayloadEventObject(result.eventObject);
  } catch (e) {
    setPayloadError(e instanceof Error ? e.message : 'Failed to load payload');
  } finally {
    setLoadingPayloadId(null);
  }
};
```

- [ ] **Step 4: Add "Payload" button to each send row**

In the sends table, find the `<Td dataLabel="Actions">` cell. Replace it with:

```typescript
<Td dataLabel="Actions">
  <Button
    variant="link"
    size="sm"
    isLoading={resendingSendId === s.id}
    isDisabled={resendingSendId !== null || confirmResendId !== null}
    onClick={() => handleResendSingle(s.id)}
  >
    Resend
  </Button>
  <Button
    variant="link"
    size="sm"
    isLoading={loadingPayloadId === s.id}
    isDisabled={loadingPayloadId !== null}
    onClick={() => handleViewPayload(s.id)}
  >
    Payload
  </Button>
</Td>
```

- [ ] **Step 5: Render the modal**

Just before the closing `</DrawerPanelContent>` tag (after the `{disclosedSecret && ...}` block), add:

```typescript
{(payloadEventObject !== null || payloadError !== null) && (
  <PayloadPreviewModal
    isOpen
    eventObject={payloadEventObject}
    errorMessage={payloadError}
    onClose={() => {
      setPayloadEventObject(null);
      setPayloadError(null);
    }}
  />
)}
```

- [ ] **Step 6: Type-check**

```bash
cd webhook-ui && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 7: Run full frontend test suite**

```bash
cd webhook-ui && npx vitest run 2>&1 | tail -5
```

Expected: all tests passing.

- [ ] **Step 8: Commit**

```bash
git add webhook-ui/src/components/DeliveryDrawer.tsx
git commit -m "feat(ui): wire payload preview button and modal into DeliveryDrawer"
```

---

### Task 6: E2E test

**Files:**
- Create: `e2e/tests/08-payload-preview.spec.ts`

**Context:** Uses the consumer webhook-tester (same pattern as `03-delivery.spec.ts`). Creates a session, registers a webhook, triggers a user create+delete cycle, waits for delivery, opens the drawer, clicks "Payload", verifies the modal title and JSON content.

- [ ] **Step 1: Write the test**

Create `e2e/tests/08-payload-preview.spec.ts`:

```typescript
import { test, expect } from '../fixtures/ports';
import { triggerUserCycle } from '../fixtures/admin-events';
import { createWebhookViaUI } from '../fixtures/webhook-helpers';
import { waitForDelivery } from '../fixtures/consumer';

test('Payload preview modal shows event JSON', async ({
  page,
  keycloakUrl,
  consumerPublicUrl,
  adminToken,
}) => {
  // 1. Create a consumer session so Keycloak can deliver to it
  const sessionRes = await fetch(`${consumerPublicUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_code: 200 }),
  });
  const { uuid } = (await sessionRes.json()) as { uuid: string };
  const webhookUrl = `http://consumer:8080/${uuid}`;

  // 2. Register webhook via UI
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await createWebhookViaUI(page, webhookUrl);

  // 3. Trigger events and wait for at least one delivery
  await triggerUserCycle(keycloakUrl, adminToken);
  await waitForDelivery(consumerPublicUrl, uuid);

  // 4. Open the delivery drawer
  // Avoid row.click() — may land on Enabled cell (stopPropagation)
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.getByRole('gridcell').first().click();
  await expect(page.getByText('Delivery history')).toBeVisible({ timeout: 5_000 });

  // 5. Click "Payload" on the first send row
  await page.getByRole('button', { name: 'Payload' }).first().click();

  // 6. Modal opens with the event JSON
  await expect(page.getByRole('dialog', { name: 'Event payload' })).toBeVisible({
    timeout: 10_000,
  });

  // 7. JSON content is present (Keycloak events always contain "realmId")
  await expect(page.getByRole('dialog', { name: 'Event payload' }).getByText(/realmId/)).toBeVisible();

  // 8. Copy button is present
  await expect(
    page.getByRole('dialog', { name: 'Event payload' }).getByRole('button', { name: /copy to clipboard/i }),
  ).toBeVisible();

  // 9. Close the modal
  await page.getByRole('dialog', { name: 'Event payload' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Event payload' })).not.toBeVisible();
});
```

- [ ] **Step 2: Commit**

```bash
git add e2e/tests/08-payload-preview.spec.ts
git commit -m "test(e2e): payload preview modal opens with event JSON"
```

---

### Task 7: Run local pipeline + push

- [ ] **Step 1: Run Spotless**

```bash
mvn spotless:apply -q
```

- [ ] **Step 2: Run full backend test suite**

```bash
mvn verify -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 3: Run frontend tests**

```bash
cd webhook-ui && npx vitest run 2>&1 | tail -5
```

Expected: all passing.

- [ ] **Step 4: Stage any spotless fixes and push**

```bash
git add -A && git diff --cached --name-only
# commit only if spotless changed files:
git commit -m "chore: spotless formatting" 2>/dev/null || true
git push origin master
```
