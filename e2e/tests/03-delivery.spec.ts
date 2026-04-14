import { test, expect } from '../fixtures/ports';
import { triggerUserCycle } from '../fixtures/admin-events';
import { createWebhookViaUI } from '../fixtures/webhook-helpers';
import { waitForDelivery } from '../fixtures/consumer';

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
  await createWebhookViaUI(page, webhookUrl);

  // 3. Trigger 2 events (create + delete user)
  await triggerUserCycle(keycloakUrl, adminToken);

  // 4. Wait until at least one delivery has been recorded by the consumer.
  //    Polling the consumer API is deterministic and ~10x faster than a fixed sleep.
  await waitForDelivery(consumerPublicUrl, uuid);

  // 5. Click the URL cell to open the drawer (filter row by unique uuid substring).
  // Avoid row.click() — it hits the center which may land on the "Enabled" cell
  // (stopPropagation). Clicking the first gridcell (URL) propagates to the row's onClick.
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.getByRole('gridcell').first().click();

  // 6. Verify drawer content
  await expect(page.getByText('Delivery history')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('grid', { name: 'Deliveries table' })).toBeVisible();

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
  await createWebhookViaUI(page, webhookUrl);

  await triggerUserCycle(keycloakUrl, adminToken);
  await waitForDelivery(consumerPublicUrl, uuid);

  // Open drawer — click URL cell (first gridcell) to avoid stopPropagation on Enabled cell
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.getByRole('gridcell').first().click();
  await expect(page.getByText('Delivery history')).toBeVisible();

  // Click "Failed" filter — exact:true to avoid matching "Resend failed (24h)" button
  await page.getByRole('button', { name: 'Failed', exact: true }).click();

  // Wait for the loading spinner to disappear before asserting empty state
  await expect(page.getByLabel('Loading sends')).not.toBeVisible({ timeout: 5_000 });

  // Since all deliveries succeeded, "No deliveries found" should appear
  await expect(page.getByText('No deliveries found')).toBeVisible({ timeout: 5_000 });
});
