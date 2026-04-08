# Settings Page — Design Spec

## Goal

Add a dedicated "Impostazioni" tab to the webhook admin UI that lets users configure UI behaviour. The first setting is the metrics auto-refresh interval. The page uses `localStorage` for persistence across sessions.

## Scope

In scope for this iteration:
- Metrics auto-refresh interval (5 s / 10 s / 30 s / 60 s)

Out of scope (noted as future evolutions):
- Webhook table auto-refresh interval
- Delivery history rows per page

## Architecture

### `useSettings` hook — `src/lib/useSettings.ts`

Single source of truth for all UI settings. Responsibilities:
- Read from `localStorage` on mount (key: `webhook-admin-ui-settings`)
- Provide typed `settings` object and `updateSettings` function
- Write to `localStorage` on every update
- Return defaults if key is absent or JSON is malformed

```ts
interface AppSettings {
  metricsRefreshInterval: number; // milliseconds
}

const DEFAULTS: AppSettings = { metricsRefreshInterval: 10_000 };

function useSettings(): { settings: AppSettings; updateSettings: (patch: Partial<AppSettings>) => void }
```

Components never read or write `localStorage` directly.

### `SettingsPage` component — `src/components/SettingsPage.tsx`

Props:
```ts
interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
}
```

Renders a PatternFly `Card` with a `Form`. Contains one `FormGroup`:

- **Label:** "Intervallo auto-refresh metriche"
- **Control:** `Radio` group with 4 options: 5 s (5 000 ms), 10 s (10 000 ms), 30 s (30 000 ms), 60 s (60 000 ms)
- Selection is applied immediately via `onUpdate` — no Save button

### `App.tsx` changes

1. Call `useSettings()` at the top level.
2. Add a third `Tab` with `eventKey="settings"` and title "Impostazioni".
3. Render `<SettingsPage settings={settings} onUpdate={updateSettings} />` when the tab is active.
4. Pass `refreshInterval={settings.metricsRefreshInterval}` to `<MetricsPage>`.

### `MetricsPage` changes

Remove the `REFRESH_INTERVAL = 10_000` constant. Accept a new prop:

```ts
interface MetricsPageProps {
  api: WebhookApiClient;
  refreshInterval: number; // milliseconds
}
```

The `useEffect` that sets up the interval uses `refreshInterval` instead of the constant. When `refreshInterval` changes (user updated the setting), the interval is torn down and recreated via the effect's dependency array.

## Data flow

```
localStorage
    ↓  (on mount)
useSettings  →  settings.metricsRefreshInterval  →  MetricsPage (interval)
    ↑                                             →  SettingsPage (selected radio)
updateSettings (on radio change)
    ↓
localStorage (written immediately)
```

## Error handling

- Malformed or missing `localStorage` value: fall back to `DEFAULTS` silently.
- No network calls involved — no error states needed.

## Testing

### Unit — `useSettings.test.ts`

- Returns defaults when `localStorage` is empty.
- Reads persisted value correctly.
- `updateSettings` merges patch and writes to `localStorage`.
- Malformed JSON in `localStorage` falls back to defaults without throwing.

### Unit — `SettingsPage.test.tsx`

- Renders 4 radio options.
- The option matching `settings.metricsRefreshInterval` is checked.
- Clicking a different option calls `onUpdate` with the correct value.

### Unit — `MetricsPage.test.tsx` (update)

- All existing tests updated to pass `refreshInterval={10_000}` as prop.
- Add one test: changing `refreshInterval` prop tears down old interval and sets up a new one.

### E2E — `06-settings.spec.ts`

- Navigating to "Impostazioni" tab shows the radio group.
- Changing the interval radio updates the selection.
- Reloading the page preserves the selected interval (localStorage persistence).
- After changing the interval and reloading, the Metriche tab uses the persisted value (interval behaviour verified by unit tests; E2E covers persistence only).

---

## Implementation Status

**Implemented in v1.14.3 — matches spec, scope expanded.**

`SettingsPage.tsx` hosts three cards in a single tab: Metriche (auto-refresh interval), Webhook — valori predefiniti (enabled default + retry defaults), Cronologia consegne (page size). `useSettings.ts` is the single source of truth with localStorage persistence + deep-merge updates + validation on read. Unit tests cover defaults, persistence, and malformed-JSON fallback. Of the two "out of scope" items in the original spec, the delivery-history page size was pulled into the same feature wave (see `2026-04-07-delivery-history-pagination-design.md` and `2026-04-07-webhook-defaults-settings-design.md`).
