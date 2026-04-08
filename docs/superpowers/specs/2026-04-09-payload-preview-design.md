# Payload Preview Design

## Goal

Allow operators to inspect the exact JSON payload sent for any delivery attempt directly from the UI, without leaving the delivery drawer.

## Architecture

On-demand fetch: the payload is loaded only when the user opens the preview modal. No change to the existing sends list endpoint or DB schema.

**Tech Stack:** Java JAX-RS (backend), React + PatternFly v5 (frontend), OpenAPI 3.1 (spec).

---

## Backend

### New endpoint

```
GET /realms/{realm}/webhooks/{id}/sends/{sendId}/payload
```

Authorization: `requireManageEvents()` — same as all other webhook endpoints.

Logic:
1. Load `WebhookSend` by `sendId` scoped to `webhookId`. Return **404** if not found.
2. Load `WebhookEvent` by `send.getWebhookEventId()`. Return **404** with body `"Event not found (may have been removed by retention)"` if not found.
3. Return `200` with body `{ "eventObject": "<json-string>" }`.

No DB schema changes. No changes to existing endpoints.

### Response schema

```json
{ "eventObject": "<full JSON string of the original Keycloak event>" }
```

---

## Frontend

### API client

Add `getPayload(webhookId: string, sendId: string): Promise<{ eventObject: string }>` to `WebhookApiClient` / `webhookApi.ts`.

### DeliveryDrawer changes

- Add a **"Payload"** column to the sends table (icon button or link text).
- Clicking the button sets `previewSendId` state and calls `getPayload()`.
- While loading: spinner inside the button.
- On success: open `PayloadPreviewModal`.
- On 404: open modal with error message "Payload not available (event may have been removed by retention)".

### PayloadPreviewModal (new component)

Props: `isOpen`, `eventObject: string | null`, `errorMessage: string | null`, `onClose`.

Content:
- If `eventObject` present: pretty-printed JSON in a `<pre>` block + PatternFly `ClipboardCopy` button.
- If `errorMessage` present: inline `Alert` with the message.
- Title: "Event payload".
- Single "Close" button in the footer.

`JSON.pretty` formatting applied client-side (`JSON.stringify(JSON.parse(eventObject), null, 2)`).

---

## OpenAPI

Add path `/{id}/sends/{sendId}/payload` to `docs/openapi.yaml`:

```yaml
/{id}/sends/{sendId}/payload:
  get:
    operationId: getSendPayload
    summary: Get the event payload for a send attempt
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

New schema `SendPayload`:
```yaml
SendPayload:
  type: object
  properties:
    eventObject:
      type: string
      description: Full JSON payload of the original Keycloak event
```

---

## Error handling

| Situation | Backend response | Frontend behavior |
|-----------|-----------------|-------------------|
| Send not found | 404 | Modal shows generic "not found" message |
| Event deleted by retention | 404 "Event not found..." | Modal shows retention message |
| Network error | — | Modal shows generic error |

---

## Testing

- **Unit:** `WebhooksResourceTest` — `getSendPayload` returns 200 with eventObject; returns 404 when send missing; returns 404 when event missing.
- **Unit:** `PayloadPreviewModal` renders pretty-printed JSON; renders error message on null eventObject.
- **E2E:** create webhook → trigger event → open drawer → click Payload → modal shows JSON containing expected fields.
