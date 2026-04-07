# Webhook Defaults in Settings Page — Design Spec

## Goal

Extend the "Impostazioni" tab so users can configure default values for new webhooks. When creating a webhook, the modal pre-populates fields from these settings instead of hardcoded defaults.

## Scope

Settings added in this iteration:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | boolean | `true` | Whether new webhooks start active |
| `retryMaxElapsedSeconds` | number \| null | `null` | Default max retry duration (null = server default, placeholder 900) |
| `retryMaxIntervalSeconds` | number \| null | `null` | Default max retry interval (null = server default, placeholder 180) |

Out of scope:
- Algorithm default (stays hardcoded `HmacSHA256`)
- Any setting that requires server-side changes

## Architecture

### `useSettings` hook — `src/lib/useSettings.ts`

Extend `AppSettings` with a nested `webhookDefaults` object:

```ts
interface WebhookDefaults {
  enabled: boolean;
  retryMaxElapsedSeconds: number | null;
  retryMaxIntervalSeconds: number | null;
}

interface AppSettings {
  metricsRefreshInterval: number;
  webhookDefaults: WebhookDefaults;
}

const DEFAULTS: AppSettings = {
  metricsRefreshInterval: 10_000,
  webhookDefaults: {
    enabled: true,
    retryMaxElapsedSeconds: null,
    retryMaxIntervalSeconds: null,
  },
};
```

**Deep merge (one level):** `updateSettings` merges nested objects instead of replacing them. Calling `updateSettings({ webhookDefaults: { enabled: false } })` preserves existing retry values.

```ts
const updateSettings = useCallback((patch: Partial<AppSettings>) => {
  setSettings((prev) => {
    const next = { ...prev };
    for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
      const val = patch[key];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        next[key] = { ...(prev[key] as object), ...val } as AppSettings[typeof key];
      } else if (val !== undefined) {
        (next as Record<string, unknown>)[key] = val;
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
}, []);
```

**Validation in `readSettings`:** validate `webhookDefaults` structure. If absent, malformed, or individual fields have wrong types, fall back to `DEFAULTS.webhookDefaults` (per-field, not all-or-nothing).

### `SettingsPage` component — `src/components/SettingsPage.tsx`

Add a second `Card` titled "Webhook — valori predefiniti" below the existing "Metriche" card.

Contents:
- **Switch** "Enabled by default" — toggles `webhookDefaults.enabled`
- **Number input** "Max retry duration (seconds)" — placeholder "900 (default server)"
  - Empty → saves `null` (use server default)
  - Positive integer → saves the number
  - Invalid input → field shows error state, `onUpdate` not called
- **Number input** "Max retry interval (seconds)" — placeholder "180 (default server)"
  - Same validation as above

Changes take effect immediately — no Save button (consistent with existing pattern).

### `WebhookModal` changes — `src/components/WebhookModal.tsx`

New optional prop:

```ts
interface WebhookModalProps {
  // ...existing props
  defaults?: WebhookDefaults;
}
```

In create mode, use `defaults` for initial state:

```ts
setEnabled(defaults?.enabled ?? true);
setRetryMaxElapsed(defaults?.retryMaxElapsedSeconds != null ? String(defaults.retryMaxElapsedSeconds) : '');
setRetryMaxInterval(defaults?.retryMaxIntervalSeconds != null ? String(defaults.retryMaxIntervalSeconds) : '');
```

In edit mode, behavior is unchanged — fields populate from the existing webhook object. The `defaults` prop is ignored.

### `App.tsx` changes

Pass `defaults` to `WebhookModal` when in create mode:

```tsx
<WebhookModal
  mode={modalMode}
  defaults={modalMode === 'create' ? settings.webhookDefaults : undefined}
  ...
/>
```

## Data flow

```
localStorage
    ↓  (on mount)
useSettings  →  settings.webhookDefaults  →  WebhookModal (create mode initial state)
    ↑                                     →  SettingsPage (switch + number inputs)
updateSettings (on settings change, deep merge)
    ↓
localStorage (written immediately)
```

## Error handling

- Malformed or missing `webhookDefaults` in localStorage: fall back to `DEFAULTS.webhookDefaults` per-field.
- Invalid number input in SettingsPage: field shows error state, setting not updated.
- No network calls — no error states needed.

## Testing

### Unit — `useSettings.test.ts` (update)

- DEFAULTS include `webhookDefaults` with correct values.
- `updateSettings` with partial `webhookDefaults` does deep merge (preserves sibling fields).
- `updateSettings` for `metricsRefreshInterval` (non-nested) still works with shallow merge.
- Malformed `webhookDefaults` in localStorage falls back per-field.
- Missing `webhookDefaults` key in localStorage falls back to full defaults.

### Unit — `SettingsPage.test.tsx` (update)

- Renders new card with switch and 2 number inputs.
- Toggle `enabled` calls `onUpdate({ webhookDefaults: { enabled: false } })`.
- Valid number input calls `onUpdate` with the number.
- Empty number input calls `onUpdate` with `null`.
- Invalid number input shows error, does not call `onUpdate`.

### Unit — `WebhookModal.test.tsx` (update)

- Create mode with `defaults` prop: fields start with default values.
- Create mode without `defaults`: fields start with hardcoded defaults (backward compat).
- Edit mode: `defaults` prop ignored, fields populated from webhook object.

### E2E — `06-settings.spec.ts` (update)

- New card visible with switch and number inputs.
- Toggle enabled default to off → open create modal → toggle is off.
- Set retry duration to 600 → reload → value persisted → create modal shows "600".
- Clear retry duration → create modal shows empty field with placeholder.

### Guide updates

Update §7 "Impostazioni" in `docs/user-guide/guide-en.md` and `guide-it.md`:
- Document the new "Webhook — valori predefiniti" card.
- Describe each setting and its effect on new webhook creation.
- Update screenshot `07-settings-page.png`.
