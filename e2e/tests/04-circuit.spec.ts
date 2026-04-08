import { test, expect } from '../fixtures/ports';
import { createUser, deleteUser } from '../fixtures/admin-events';
import { openCreateModal, fillWebhookForm } from '../fixtures/webhook-helpers';

const UNREACHABLE_URL = 'http://127.0.0.1:19999/webhook';

async function getCircuitState(
  keycloakUrl: string,
  token: string,
  webhookId: string,
): Promise<{ state: string; failureCount: number }> {
  const r = await fetch(`${keycloakUrl}/realms/demo/webhooks/${webhookId}/circuit`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET /circuit failed: HTTP ${r.status}`);
  return r.json() as Promise<{ state: string; failureCount: number }>;
}

async function findWebhookIdByUrl(
  keycloakUrl: string,
  token: string,
  url: string,
): Promise<string> {
  const r = await fetch(`${keycloakUrl}/realms/demo/webhooks/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`GET /webhooks failed: HTTP ${r.status}`);
  const list = (await r.json()) as Array<{ id: string; url: string }>;
  const found = list.find((w) => w.url === url);
  if (!found) throw new Error(`webhook not found for url ${url}`);
  return found.id;
}

test('Circuit opens after repeated failures and resets to CLOSED', async ({
  page,
  keycloakUrl,
  adminToken,
  webhookAdminToken,
}) => {
  // 1. Create webhook pointing to unreachable URL with short retry window
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await openCreateModal(page);
  // Use admin.* (not *) so that only admin events (user create/delete) trigger dispatches.
  // Using * would also catch access events (CODE_TO_TOKEN, TOKEN_REFRESH) from keycloak-js
  // silent auth on each page reload, which would re-open the circuit after the reset.
  await fillWebhookForm(page, UNREACHABLE_URL, 'admin.*');

  // Short retry window so failures accumulate fast: 1s total
  await page.getByLabel('Max retry duration (seconds)').fill('1');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  // 2. Trigger 2 events (create + delete user, twice)
  //    Each event → ~3 send attempts (initial + retries within 1s) → total ~6 failures > threshold 5
  const id1 = await createUser(keycloakUrl, adminToken, 'e2e-circuit');
  await deleteUser(keycloakUrl, adminToken, id1);
  const id2 = await createUser(keycloakUrl, adminToken, 'e2e-circuit');
  await deleteUser(keycloakUrl, adminToken, id2);

  // 3. Poll the circuit API until state flips to OPEN (max 20s).
  //    Using the backend as oracle — deterministic, no UI coupling, no reloads.
  const webhookId = await findWebhookIdByUrl(keycloakUrl, webhookAdminToken, UNREACHABLE_URL);
  await expect
    .poll(async () => (await getCircuitState(keycloakUrl, webhookAdminToken, webhookId)).state, {
      timeout: 20_000,
      intervals: [500, 1_000, 2_000],
    })
    .toBe('OPEN');

  // 4. Reload once so the UI reflects the fresh state, then open the popover.
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: UNREACHABLE_URL });
  await expect(row.getByText('OPEN')).toBeVisible({ timeout: 10_000 });
  await row.getByText('OPEN').click();

  // Popover with failure count and reset button
  await expect(page.getByText(/\d+ failures/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset to CLOSED' })).toBeVisible();

  // 5. Reset the circuit
  // Clicking the OPEN badge also bubbles to the row's onClick → delivery drawer opens.
  // Close the drawer first so the popover button is not obscured by the drawer panel,
  // allowing a normal (non-forced) click that reliably triggers the React event handler.
  await page.getByRole('button', { name: 'Close drawer panel' }).click();
  await expect(page.getByRole('button', { name: 'Close drawer panel' })).not.toBeVisible({ timeout: 3_000 });

  await page.getByRole('button', { name: 'Reset to CLOSED' }).click();

  // 6. Verify the reset persisted server-side by querying the circuit API directly.
  //    No reload, no UI scraping, no OAuth callback races.
  await expect
    .poll(async () => (await getCircuitState(keycloakUrl, webhookAdminToken, webhookId)).state, {
      timeout: 5_000,
      intervals: [250, 500],
    })
    .toBe('CLOSED');
});
