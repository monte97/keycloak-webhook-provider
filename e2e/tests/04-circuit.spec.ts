import { test, expect } from '../fixtures/ports';
import { createUser, deleteUser } from '../fixtures/admin-events';
import { openCreateModal, fillWebhookForm } from '../fixtures/webhook-helpers';

const UNREACHABLE_URL = 'http://127.0.0.1:19999/webhook';

test('Circuit opens after repeated failures and resets to CLOSED', async ({
  page,
  keycloakUrl,
  adminToken,
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

  // 3. Poll until the OPEN badge appears in the table (max 20s)
  //    Reload on each poll to bypass the 30s auto-refresh interval.
  //    Re-find the row after each reload — locators are resolved lazily in Playwright.
  await expect(async () => {
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('row').filter({ hasText: UNREACHABLE_URL }).getByText('OPEN'),
    ).toBeVisible();
  }).toPass({ timeout: 20_000, intervals: [3_000] });

  // 4. Click the OPEN badge to open the circuit popover
  //    Re-query the row (page was reloaded inside toPass above)
  const row = page.getByRole('row').filter({ hasText: UNREACHABLE_URL });
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

  // Wait for the success toast — this confirms the POST /circuit/reset API call completed
  // before we reload. Reloading too early cancels the in-flight request.
  await expect(page.getByText('Circuit breaker reset')).toBeVisible({ timeout: 5_000 });

  // 6. Reload to get fresh server state and verify the circuit persisted as CLOSED.
  //    Use networkidle — keycloak-js does a silent redirect on reload that generates a
  //    second navigation (#state=...&code=... callback), which must settle before the table renders.
  await page.reload();
  await page.waitForLoadState('networkidle');
  const resetRow = page.getByRole('row').filter({ hasText: UNREACHABLE_URL });
  await expect(resetRow.locator('.pf-v5-c-label__text', { hasText: /^CLOSED$/ })).toBeVisible({ timeout: 10_000 });
  await expect(resetRow.locator('.pf-v5-c-label__text', { hasText: /^OPEN$/ })).not.toBeVisible();
});
