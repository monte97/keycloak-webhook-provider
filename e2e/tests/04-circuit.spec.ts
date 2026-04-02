import { test, expect } from '../fixtures/ports';

const UNREACHABLE_URL = 'http://127.0.0.1:19999/webhook';

async function createUser(keycloakUrl: string, adminToken: string): Promise<string> {
  const res = await fetch(`${keycloakUrl}/admin/realms/demo/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: `e2e-circuit-${Date.now()}`,
      enabled: true,
      credentials: [{ type: 'password', value: 'temp123', temporary: false }],
    }),
  });
  if (!res.ok) throw new Error(`Create user failed: ${res.status}`);
  const location = res.headers.get('location');
  if (!location) throw new Error('Create user: missing Location header');
  const userId = location.split('/').pop();
  if (!userId) throw new Error('Create user: malformed Location header');
  return userId;
}

async function deleteUser(keycloakUrl: string, adminToken: string, userId: string): Promise<void> {
  const res = await fetch(`${keycloakUrl}/admin/realms/demo/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error(`Delete user failed: ${res.status}`);
}

test('Circuit opens after repeated failures and resets to CLOSED', async ({
  page,
  keycloakUrl,
  adminToken,
}) => {
  // 1. Create webhook pointing to unreachable URL with short retry window
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);

  const createBtn = page.getByRole('button', { name: 'Create webhook' });
  await expect(createBtn.first()).toBeVisible({ timeout: 15_000 });
  await createBtn.first().click();

  await page.getByLabel('URL').fill(UNREACHABLE_URL);
  const eventSearch = page.getByPlaceholder('Search event types...');
  await eventSearch.click();
  await eventSearch.fill('*');
  await page.getByRole('option').first().click();

  // Short retry window so failures accumulate fast: 1s total
  await page.getByLabel('Max retry duration (seconds)').fill('1');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  // 2. Trigger 2 events (create + delete user, twice)
  //    Each event → ~3 send attempts (initial + retries within 1s) → total ~6 failures > threshold 5
  const id1 = await createUser(keycloakUrl, adminToken);
  await deleteUser(keycloakUrl, adminToken, id1);
  const id2 = await createUser(keycloakUrl, adminToken);
  await deleteUser(keycloakUrl, adminToken, id2);

  // 3. Poll until the OPEN badge appears in the table (max 20s)
  //    Reload on each poll to bypass the 30s auto-refresh interval.
  //    Re-find the row after each reload — locators are resolved lazily in Playwright.
  await expect(async () => {
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(
      page.getByRole('row').filter({ hasText: UNREACHABLE_URL }).getByText('OPEN'),
    ).toBeVisible();
  }).toPass({ timeout: 20_000, intervals: [3_000] });

  // 4. Click the OPEN badge to open the circuit popover
  //    Re-query the row (page was reloaded inside toPass above)
  const row = page.getByRole('row').filter({ hasText: UNREACHABLE_URL });
  await row.getByText('OPEN').click();

  // Popover with failure count and reset button
  await expect(page.getByText(/\d+ failures/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset to CLOSED' })).toBeVisible();

  // 5. Reset the circuit
  await page.getByRole('button', { name: 'Reset to CLOSED' }).click();

  // 6. Circuit badge returns to CLOSED
  await expect(row.getByText('CLOSED')).toBeVisible({ timeout: 5_000 });
  await expect(row.getByText('OPEN')).not.toBeVisible();
});
