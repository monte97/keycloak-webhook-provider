import { test, expect } from '../fixtures/ports';

/** Create a user in the demo realm and immediately delete them — triggers 2 admin events. */
async function triggerEvents(
  keycloakUrl: string,
  adminToken: string,
  n = 1,
): Promise<void> {
  for (let i = 0; i < n; i++) {
    const username = `e2e-user-${Date.now()}-${i}`;

    const createRes = await fetch(
      `${keycloakUrl}/admin/realms/demo/users`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          enabled: true,
          credentials: [{ type: 'password', value: 'temp123', temporary: false }],
        }),
      },
    );
    if (!createRes.ok) throw new Error(`Create user failed: ${createRes.status}`);

    const location = createRes.headers.get('location')!;
    const userId = location.split('/').pop()!;

    const deleteRes = await fetch(`${keycloakUrl}/admin/realms/demo/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!deleteRes.ok) throw new Error(`Delete user failed: ${deleteRes.status}`);
  }
}

test('Delivery drawer shows sends table after event delivery', async ({
  page,
  keycloakUrl,
  consumerPublicUrl,
  adminToken,
}) => {
  // 1. Create a webhook-tester session
  const sessionRes = await fetch(`${consumerPublicUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_code: 200 }),
  });
  const session = (await sessionRes.json()) as { uuid: string };
  const uuid = session.uuid;

  // 2. Register webhook via UI — URL uses Docker-internal address so Keycloak can reach it
  const webhookUrl = `http://consumer:8080/${uuid}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);

  const createBtn = page.getByRole('button', { name: 'Create webhook' });
  await expect(createBtn.first()).toBeVisible({ timeout: 15_000 });
  await createBtn.first().click();
  await page.getByLabel('URL').fill(webhookUrl);
  const eventSearch = page.getByPlaceholder('Search event types...');
  await eventSearch.click();
  await eventSearch.fill('*');
  const dropdown = page.locator('[role="listbox"]');
  await expect(dropdown).toBeVisible({ timeout: 5_000 });
  await dropdown.locator('[role="option"]').first().click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  // 3. Trigger 2 events (create + delete user)
  await triggerEvents(keycloakUrl, adminToken, 1);

  // 4. Wait for delivery (async; Keycloak dispatches on executor threads)
  //    10s is generous — typically takes < 2s on connection-refused URLs, < 1s on success.
  await page.waitForTimeout(10_000);

  // 5. Click the URL cell to open the drawer (filter row by unique uuid substring).
  // Avoid row.click() — it hits the center which may land on the "Enabled" cell
  // (stopPropagation). Clicking the first gridcell (URL) propagates to the row's onClick.
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.getByRole('gridcell').first().click();

  // 6. Verify drawer content
  await expect(page.getByText('Delivery history')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('grid', { name: 'Delivery history' })).toBeVisible();

  // At least one row in the sends table (not "No deliveries found")
  await expect(page.getByText('No deliveries found')).not.toBeVisible();

  // 7. Filter buttons are present
  await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Failed', exact: true })).toBeVisible();

  // 8. "Resend failed (24h)" button is present
  await expect(page.getByRole('button', { name: 'Resend failed (24h)' })).toBeVisible();
});

test('Delivery drawer filter toggles to Failed', async ({
  page,
  keycloakUrl,
  consumerPublicUrl,
  adminToken,
}) => {
  // Create a fresh session and webhook
  const sessionRes = await fetch(`${consumerPublicUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_code: 200 }),
  });
  const { uuid } = (await sessionRes.json()) as { uuid: string };
  const webhookUrl = `http://consumer:8080/${uuid}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);

  const createBtn = page.getByRole('button', { name: 'Create webhook' });
  await expect(createBtn.first()).toBeVisible({ timeout: 15_000 });
  await createBtn.first().click();
  await page.getByLabel('URL').fill(webhookUrl);
  const eventSearch2 = page.getByPlaceholder('Search event types...');
  await eventSearch2.click();
  await eventSearch2.fill('*');
  const dropdown2 = page.locator('[role="listbox"]');
  await expect(dropdown2).toBeVisible({ timeout: 5_000 });
  await dropdown2.locator('[role="option"]').first().click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  await triggerEvents(keycloakUrl, adminToken, 1);
  await page.waitForTimeout(10_000);

  // Open drawer — click URL cell (first gridcell) to avoid stopPropagation on Enabled cell
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.getByRole('gridcell').first().click();
  await expect(page.getByText('Delivery history')).toBeVisible();

  // Click "Failed" filter — exact:true to avoid matching "Resend failed (24h)" button
  await page.getByRole('button', { name: 'Failed', exact: true }).click();

  // Table reloads — wait for table to be visible
  await expect(page.getByRole('grid', { name: 'Delivery history' })).toBeVisible();

  // Since all deliveries succeeded, "No deliveries found" should appear
  await expect(page.getByText('No deliveries found')).toBeVisible({ timeout: 5_000 });
});
