import { test, expect } from '../fixtures/ports';
import { triggerUserCycle } from '../fixtures/admin-events';
import { createWebhookViaUI } from '../fixtures/webhook-helpers';
import { waitForDelivery } from '../fixtures/consumer';

test('UI completeness: createdAt visible and events tab shows event rows', async ({
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

  // 4. Open the delivery drawer (click first cell of the webhook row)
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.getByRole('gridcell').first().click();
  await expect(page.getByRole('tab', { name: 'Delivery history' })).toBeVisible({ timeout: 5_000 });

  // 5. Verify createdAt is shown in the drawer header
  // Scope to the drawer head to avoid ambiguity with the "Webhook created" success alert
  await expect(page.locator('.pf-v5-c-drawer__head').getByText(/created/i)).toBeVisible({ timeout: 5_000 });

  // 6. Click the Events tab
  await page.getByRole('tab', { name: /events/i }).click();

  // 7. Verify at least one event row is visible
  await expect(page.getByRole('cell', { name: /USER|ADMIN/ }).first()).toBeVisible({ timeout: 10_000 });

  // 8. Click Payload on the first event row
  await page.getByRole('button', { name: /payload/i }).first().click();

  // 9. Verify PayloadPreviewModal opens with JSON containing "realmId"
  await expect(page.getByRole('dialog', { name: /event payload/i })).toBeVisible({ timeout: 5_000 });
  await expect(
    page.getByRole('dialog', { name: /event payload/i }).getByText(/realmId/),
  ).toBeVisible();

  // 10. Close the modal
  await page.getByRole('dialog', { name: /event payload/i }).getByRole('button', { name: 'Close' }).last().click();
  await expect(page.getByRole('dialog', { name: /event payload/i })).not.toBeVisible();
});
