import { test, expect } from '../fixtures/ports';
import { createWebhookViaUI } from '../fixtures/webhook-helpers';

const WEBHOOK_URL_BASE = 'https://e2e.example.com/hook';

test('Create webhook', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-create-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await createWebhookViaUI(page, url);
});

test('Edit webhook URL', async ({ page, keycloakUrl }) => {
  const originalUrl = `${WEBHOOK_URL_BASE}-edit-orig-${Date.now()}`;
  const updatedUrl = `${WEBHOOK_URL_BASE}-edit-updated-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await createWebhookViaUI(page, originalUrl);

  // Open kebab menu for this row and click Edit
  const row = page.getByRole('row').filter({ hasText: originalUrl });
  await row.getByLabel('Actions').click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();

  await expect(page.getByRole('dialog', { name: 'Edit webhook' })).toBeVisible();

  // Update URL
  await page.getByLabel('URL').fill(updatedUrl);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Webhook updated')).toBeVisible();
  await expect(page.getByRole('gridcell', { name: updatedUrl, exact: true })).toBeVisible({ timeout: 5_000 });
});

test('Toggle webhook enabled/disabled', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-toggle-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await createWebhookViaUI(page, url);

  // Find the toggle in the row
  const row = page.getByRole('row').filter({ hasText: url });
  const toggle = row.getByLabel(`Toggle ${url}`);

  await expect(toggle).toBeChecked(); // enabled by default

  // PatternFly Switch renders an SVG track that intercepts pointer events;
  // force the click to reach the underlying checkbox input.
  await toggle.click({ force: true });
  await expect(toggle).not.toBeChecked(); // now disabled

  await toggle.click({ force: true });
  await expect(toggle).toBeChecked(); // re-enabled
});

test('Delete webhook', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-delete-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await createWebhookViaUI(page, url);

  // Delete via kebab menu
  const row = page.getByRole('row').filter({ hasText: url });
  await row.getByLabel('Actions').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  // Confirm in modal
  await expect(page.getByRole('dialog', { name: 'Delete webhook' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  // Don't assert on the 'Webhook deleted' toast — it auto-dismisses after 5s,
  // which races Playwright's default 5s assertion timeout. The row disappearing
  // is the behavior we actually care about.
  await expect(page.getByRole('gridcell', { name: url, exact: true })).not.toBeVisible({ timeout: 5_000 });
});
