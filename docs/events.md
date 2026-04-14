# Event Reference

This document is the authoritative reference for all Keycloak event types handled by the webhook provider. It is intended for two audiences:

- **Operators** configuring webhook subscriptions — see [Subscription patterns](#subscription-patterns) and the event tables.
- **Developers** building webhook consumers — see [Payload structure](#payload-structure).

## Event origin

Event types are **defined by Keycloak**, not by this provider. The provider listens via the `EventListenerProvider` SPI and forwards every event that Keycloak emits, adding only the `access.` / `admin.` prefix.

- Access event types come from the [`org.keycloak.events.EventType`](https://www.keycloak.org/docs-api/latest/javadocs/org/keycloak/events/EventType.html) enum.
- Admin event types come from the combination of [`ResourceType`](https://www.keycloak.org/docs-api/latest/javadocs/org/keycloak/events/admin/ResourceType.html) × [`OperationType`](https://www.keycloak.org/docs-api/latest/javadocs/org/keycloak/events/admin/OperationType.html) enums.

The tables in this document list the most common types (those shown in the UI subscription dropdown). The provider will forward **any** event emitted by Keycloak, including types added in future Keycloak releases, as long as the webhook subscription pattern matches. For the complete authoritative list, refer to the [Keycloak Events documentation](https://www.keycloak.org/docs/latest/server_admin/#events) and the Javadoc links above.

---

## Naming convention

All event types follow a prefixed naming scheme:

| Category | Prefix | Format | Example |
|----------|--------|--------|---------|
| Access (user-facing) | `access.` | `access.<KEYCLOAK_EVENT_TYPE>` | `access.LOGIN` |
| Admin | `admin.` | `admin.<RESOURCE_TYPE>-<OPERATION>` | `admin.USER-CREATE` |

The type string is stored in the `type` field of every webhook payload and is used for subscription matching.

---

## Subscription patterns

When creating or editing a webhook, the `eventTypes` field accepts one or more patterns. A delivery is triggered when **any** pattern matches the event type.

Patterns are evaluated in priority order (first match wins):

| Pattern | Matches |
|---------|---------|
| `*` | Every event (access + admin) |
| `access.*` | All access events |
| `admin.*` | All admin events |
| `access.LOGIN` | Exactly this event type |
| `admin.USER-.*` | Java regex — all admin user operations |

Any pattern that does not match a wildcard or an exact type is evaluated as a **Java regex** via `String.matches()`. Note that `.` is a regex wildcard, not a literal dot — use `access\.LOGIN` if you want a literal dot (though exact match is cheaper and preferred).

---

## Access events

Access events are emitted by user-facing authentication flows. The type is `access.<KEYCLOAK_EVENT_TYPE>`.

| Event type | When it fires |
|-----------|---------------|
| `access.LOGIN` | User logs in successfully |
| `access.LOGIN_ERROR` | User login attempt fails |
| `access.LOGOUT` | User logs out |
| `access.LOGOUT_ERROR` | User logout fails |
| `access.REGISTER` | New user self-registers |
| `access.REGISTER_ERROR` | Self-registration fails |
| `access.CODE_TO_TOKEN` | Auth code exchanged for token (OIDC authorization code flow) |
| `access.CODE_TO_TOKEN_ERROR` | Auth code exchange fails |
| `access.CLIENT_LOGIN` | Service account logs in via client credentials grant |
| `access.CLIENT_LOGIN_ERROR` | Service account login fails |
| `access.REFRESH_TOKEN` | Access token refreshed |
| `access.REFRESH_TOKEN_ERROR` | Token refresh fails |
| `access.VALIDATE_ACCESS_TOKEN` | Token validated via the userinfo endpoint |
| `access.INTROSPECT_TOKEN` | Token introspected (active/inactive check) |
| `access.FEDERATED_IDENTITY_LINK` | User links an external identity provider account |
| `access.REMOVE_FEDERATED_IDENTITY` | User unlinks an external identity provider account |
| `access.UPDATE_EMAIL` | User changes their email address |
| `access.UPDATE_PROFILE` | User updates their profile |
| `access.UPDATE_PASSWORD` | User changes their password |
| `access.UPDATE_TOTP` | User configures TOTP (2FA) |
| `access.VERIFY_EMAIL` | User verifies their email address |
| `access.REMOVE_TOTP` | User removes TOTP (2FA) |
| `access.SEND_RESET_PASSWORD` | Password reset email is sent |
| `access.RESET_PASSWORD` | User resets their password via the email link |
| `access.RESET_PASSWORD_ERROR` | Password reset fails |
| `access.RESTART_AUTHENTICATION` | Authentication flow is restarted |
| `access.IDENTITY_PROVIDER_LOGIN` | User logs in via an external identity provider |
| `access.IDENTITY_PROVIDER_FIRST_LOGIN` | User logs in via an external IdP for the first time |
| `access.IDENTITY_PROVIDER_POST_LOGIN` | Post-login processing completes after IdP authentication |
| `access.IMPERSONATE` | An admin impersonates a user |
| `access.CUSTOM_REQUIRED_ACTION` | A custom required action is executed |
| `access.EXECUTE_ACTIONS` | An admin triggers required actions for a user |
| `access.EXECUTE_ACTION_TOKEN` | User completes an action token (e.g. email verification link) |
| `access.CLIENT_REGISTER` | Client registered via dynamic client registration |
| `access.CLIENT_UPDATE` | Client updated via dynamic client registration |
| `access.CLIENT_DELETE` | Client deleted via dynamic client registration |
| `access.CLIENT_INITIATED_ACCOUNT_LINKING` | Client initiates account linking with an identity provider |
| `access.TOKEN_EXCHANGE` | Token exchanged (e.g. external token for an internal one) |
| `access.PERMISSION_TOKEN` | UMA permission ticket issued |

---

## Admin events

Admin events are emitted by administrative operations performed via the Keycloak Admin API or console. The type is `admin.<RESOURCE_TYPE>-<OPERATION>`.

| Event type | When it fires |
|-----------|---------------|
| `admin.USER-CREATE` | Admin creates a user |
| `admin.USER-UPDATE` | Admin updates user attributes |
| `admin.USER-DELETE` | Admin deletes a user |
| `admin.CLIENT-CREATE` | Admin creates a client (application) |
| `admin.CLIENT-UPDATE` | Admin updates a client configuration |
| `admin.CLIENT-DELETE` | Admin deletes a client |
| `admin.REALM-UPDATE` | Admin updates realm settings |
| `admin.ROLE_MAPPING-CREATE` | Admin assigns a realm role to a user |
| `admin.ROLE_MAPPING-DELETE` | Admin removes a realm role from a user |
| `admin.CLIENT_ROLE_MAPPING-CREATE` | Admin assigns a client role to a user |
| `admin.CLIENT_ROLE_MAPPING-DELETE` | Admin removes a client role from a user |
| `admin.GROUP-CREATE` | Admin creates a group |
| `admin.GROUP-UPDATE` | Admin updates a group |
| `admin.GROUP-DELETE` | Admin deletes a group |
| `admin.GROUP_MEMBERSHIP-CREATE` | Admin adds a user to a group |
| `admin.GROUP_MEMBERSHIP-DELETE` | Admin removes a user from a group |
| `admin.IDENTITY_PROVIDER-CREATE` | Admin creates an identity provider |
| `admin.IDENTITY_PROVIDER-UPDATE` | Admin updates an identity provider |
| `admin.IDENTITY_PROVIDER-DELETE` | Admin deletes an identity provider |
| `admin.COMPONENT-CREATE` | Admin creates a component (e.g. LDAP user federation) |
| `admin.COMPONENT-UPDATE` | Admin updates a component |
| `admin.COMPONENT-DELETE` | Admin deletes a component |
| `admin.AUTHORIZATION_RESOURCE-CREATE` | Admin creates an authorization resource |
| `admin.AUTHORIZATION_RESOURCE-UPDATE` | Admin updates an authorization resource |
| `admin.AUTHORIZATION_RESOURCE-DELETE` | Admin deletes an authorization resource |
| `admin.AUTHORIZATION_POLICY-CREATE` | Admin creates an authorization policy |
| `admin.AUTHORIZATION_POLICY-UPDATE` | Admin updates an authorization policy |
| `admin.AUTHORIZATION_POLICY-DELETE` | Admin deletes an authorization policy |
| `admin.AUTHORIZATION_SCOPE-CREATE` | Admin creates an authorization scope |
| `admin.AUTHORIZATION_SCOPE-UPDATE` | Admin updates an authorization scope |
| `admin.AUTHORIZATION_SCOPE-DELETE` | Admin deletes an authorization scope |

> **Note:** The event tables above list the types exposed in the UI subscription dropdown. The provider will forward any `AdminEvent` emitted by Keycloak — including resource/operation combinations not listed here — as long as the webhook subscription pattern matches.

---

## Payload structure

Every HTTP POST to a webhook endpoint carries a JSON body. The shape depends on the event category.

### Access event

```json
{
  "uid": "a3f1c2d4-...",
  "type": "access.LOGIN",
  "realmId": "my-realm",
  "userId": "b7e2a1f3-...",
  "sessionId": "c9d4b2e1-...",
  "occurredAt": "2026-04-14T12:00:00Z",
  "details": {
    "auth_method": "openid-connect",
    "auth_type": "code",
    "redirect_uri": "https://app.example.com/callback"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `uid` | string (UUID) | Unique identifier for this delivery attempt, generated by the provider |
| `type` | string | Event type in `access.<TYPE>` format |
| `realmId` | string | Keycloak realm ID where the event occurred |
| `userId` | string (UUID) | ID of the user who triggered the event; may be `null` for anonymous flows |
| `sessionId` | string (UUID) | Keycloak session ID; may be `null` for sessionless flows |
| `occurredAt` | string (ISO 8601) | Timestamp of the original Keycloak event |
| `details` | object | Key/value map of event-specific context (auth method, redirect URI, error details, etc.); may be empty |

### Admin event

```json
{
  "uid": "d5e6f7a8-...",
  "type": "admin.USER-CREATE",
  "realmId": "my-realm",
  "resourcePath": "users/b7e2a1f3-...",
  "operationType": "CREATE",
  "authDetails": {
    "realmId": "my-realm",
    "clientId": "admin-cli",
    "userId": "e1f2a3b4-...",
    "username": "admin",
    "ipAddress": "192.168.1.10"
  },
  "occurredAt": "2026-04-14T12:01:00Z",
  "representation": {
    "id": "b7e2a1f3-...",
    "username": "alice",
    "email": "alice@example.com",
    "enabled": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `uid` | string (UUID) | Unique identifier for this delivery attempt, generated by the provider |
| `type` | string | Event type in `admin.<RESOURCE_TYPE>-<OPERATION>` format |
| `realmId` | string | Keycloak realm ID where the event occurred |
| `resourcePath` | string | REST path of the affected resource (e.g. `users/<id>`, `clients/<id>/roles`) |
| `operationType` | string | One of `CREATE`, `UPDATE`, `DELETE`, `ACTION` |
| `authDetails` | object | Identity of the admin who triggered the action (see below); may be `null` |
| `authDetails.realmId` | string | Realm ID of the acting admin |
| `authDetails.clientId` | string | Client used by the acting admin |
| `authDetails.userId` | string (UUID) | User ID of the acting admin |
| `authDetails.username` | string | Username of the acting admin (resolved by the provider) |
| `authDetails.ipAddress` | string | IP address of the acting admin |
| `occurredAt` | string (ISO 8601) | Timestamp of the original Keycloak admin event |
| `representation` | object | JSON body of the affected resource as returned by the Admin API; may be `null` for DELETE operations |

### Common headers

Every webhook request carries the following HTTP headers:

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Webhook-Id` | ID of the webhook configuration that triggered this delivery |
| `X-Keycloak-Signature` | HMAC signature (`sha256=<hex>`). Present only when a secret is configured. During secret rotation, contains two comma-separated values: `sha256=<hex_new>, sha256=<hex_old>`. |
