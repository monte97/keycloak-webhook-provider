import { test, expect } from '../fixtures/ports';
import { triggerUserCycle } from '../fixtures/admin-events';
import { createWebhookViaUI } from '../fixtures/webhook-helpers';
import { waitForDelivery } from '../fixtures/consumer';

test('Payload preview modal shows event JSON', async ({
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

  // 4. Open the delivery drawer
  // Avoid row.click() — may land on Enabled cell (stopPropagation)
  const row = page.getByRole('row').filter({ hasText: uuid });
  await row.getByRole('gridcell').first().click();
  await expect(page.getByText('Delivery history')).toBeVisible({ timeout: 5_000 });

  // 5. Click "Payload" on the first send row
  await page.getByRole('button', { name: 'Payload' }).first().click();

  // 6. Modal opens with the event JSON
  await expect(page.getByRole('dialog', { name: 'Event payload' })).toBeVisible({
    timeout: 10_000,
  });

  // 7. JSON content is present (Keycloak events always contain "realmId")
  await expect(page.getByRole('dialog', { name: 'Event payload' }).getByText(/realmId/)).toBeVisible();

  // 8. Copy button is present
  await expect(
    page.getByRole('dialog', { name: 'Event payload' }).getByRole('button', { name: /copy to clipboard/i }),
  ).toBeVisible();

  // 9. Close the modal
  // Modal has two "Close" buttons (header X + footer) — click the footer one (last)
  await page.getByRole('dialog', { name: 'Event payload' }).getByRole('button', { name: 'Close' }).last().click();
  await expect(page.getByRole('dialog', { name: 'Event payload' })).not.toBeVisible();
});
