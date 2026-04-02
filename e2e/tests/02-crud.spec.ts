import { test, expect } from '../fixtures/ports';

const WEBHOOK_URL_BASE = 'https://e2e.example.com/hook';

async function openCreateModal(page: import('@playwright/test').Page) {
  // Either from empty state button or toolbar button
  const btn = page.getByRole('button', { name: 'Create webhook' });
  await btn.first().click();
  await expect(page.getByRole('dialog', { name: 'Create webhook' })).toBeVisible();
}

async function fillWebhookForm(
  page: import('@playwright/test').Page,
  url: string,
) {
  await page.getByLabel('URL').fill(url);
  // Select event type '*' (all events)
  await page.getByPlaceholder('Search event types...').fill('*');
  await page.getByRole('option', { name: '*', exact: true }).click();
}

test('Create webhook', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-create-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  await openCreateModal(page);
  await fillWebhookForm(page, url);
  await page.getByRole('button', { name: 'Save' }).click();

  // Success toast
  await expect(page.getByText('Webhook created')).toBeVisible();

  // Row appears in table
  await expect(page.getByRole('cell', { name: url })).toBeVisible({ timeout: 5_000 });
});

test('Edit webhook URL', async ({ page, keycloakUrl }) => {
  const originalUrl = `${WEBHOOK_URL_BASE}-edit-orig-${Date.now()}`;
  const updatedUrl = `${WEBHOOK_URL_BASE}-edit-updated-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Create webhook first
  await openCreateModal(page);
  await fillWebhookForm(page, originalUrl);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();
  await expect(page.getByRole('cell', { name: originalUrl })).toBeVisible();

  // Open kebab menu for this row and click Edit
  const row = page.getByRole('row').filter({ hasText: originalUrl });
  await row.getByLabel('Actions').click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();

  await expect(page.getByRole('dialog', { name: 'Edit webhook' })).toBeVisible();

  // Update URL
  await page.getByLabel('URL').fill(updatedUrl);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Webhook updated')).toBeVisible();
  await expect(page.getByRole('cell', { name: updatedUrl })).toBeVisible({ timeout: 5_000 });
});

test('Toggle webhook enabled/disabled', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-toggle-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  await openCreateModal(page);
  await fillWebhookForm(page, url);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  // Find the toggle in the row
  const row = page.getByRole('row').filter({ hasText: url });
  const toggle = row.getByLabel(`Toggle ${url}`);

  await expect(toggle).toBeChecked(); // enabled by default

  await toggle.click();
  await expect(toggle).not.toBeChecked(); // now disabled

  await toggle.click();
  await expect(toggle).toBeChecked(); // re-enabled
});

test('Delete webhook', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-delete-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  await openCreateModal(page);
  await fillWebhookForm(page, url);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();
  await expect(page.getByRole('cell', { name: url })).toBeVisible();

  // Delete via kebab menu
  const row = page.getByRole('row').filter({ hasText: url });
  await row.getByLabel('Actions').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  // Confirm in modal
  await expect(page.getByRole('dialog', { name: 'Delete webhook' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Webhook deleted')).toBeVisible();
  await expect(page.getByRole('cell', { name: url })).not.toBeVisible({ timeout: 5_000 });
});
