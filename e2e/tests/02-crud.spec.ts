import { test, expect } from '../fixtures/ports';

const WEBHOOK_URL_BASE = 'https://e2e.example.com/hook';

async function openCreateModal(page: import('@playwright/test').Page) {
  // Either from empty state button or toolbar button
  const btn = page.getByRole('button', { name: 'Create webhook' });
  // Wait for the button to appear — stable signal that the app has rendered
  await expect(btn.first()).toBeVisible({ timeout: 15_000 });
  await btn.first().click();
  await expect(page.getByRole('dialog', { name: 'Create webhook' })).toBeVisible();
}

async function fillWebhookForm(
  page: import('@playwright/test').Page,
  url: string,
) {
  await page.getByLabel('URL').fill(url);
  // Open the PatternFly Select dropdown and pick '*' (first option in the list).
  // fill('*') triggers TextInputGroupMain.onChange → setEventSelectOpen(true).
  // PatternFly renders: <ul role="listbox"> (SelectList) → <li> → <button role="option"> (MenuItem).
  // Use CSS attribute selectors (not getByRole) to avoid matching hidden native <option>
  // elements from the Algorithm <select>, which also have ARIA role "option".
  const eventSearch = page.getByPlaceholder('Search event types...');
  await eventSearch.click();
  await eventSearch.fill('*');
  const dropdown = page.locator('[role="listbox"]');
  await expect(dropdown).toBeVisible({ timeout: 5_000 });
  await dropdown.locator('[role="option"]').first().click();
}

test('Create webhook', async ({ page, keycloakUrl }) => {
  const url = `${WEBHOOK_URL_BASE}-create-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await openCreateModal(page);
  await fillWebhookForm(page, url);
  await page.getByRole('button', { name: 'Save' }).click();

  // Success toast
  await expect(page.getByText('Webhook created')).toBeVisible();

  // Row appears in table
  await expect(page.getByRole('gridcell', { name: url, exact: true })).toBeVisible({ timeout: 5_000 });
});

test('Edit webhook URL', async ({ page, keycloakUrl }) => {
  const originalUrl = `${WEBHOOK_URL_BASE}-edit-orig-${Date.now()}`;
  const updatedUrl = `${WEBHOOK_URL_BASE}-edit-updated-${Date.now()}`;

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);

  // Create webhook first
  await openCreateModal(page);
  await fillWebhookForm(page, originalUrl);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();
  await expect(page.getByRole('gridcell', { name: originalUrl, exact: true })).toBeVisible();

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
  await openCreateModal(page);
  await fillWebhookForm(page, url);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

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
  await openCreateModal(page);
  await fillWebhookForm(page, url);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();
  await expect(page.getByRole('gridcell', { name: url, exact: true })).toBeVisible();

  // Delete via kebab menu
  const row = page.getByRole('row').filter({ hasText: url });
  await row.getByLabel('Actions').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  // Confirm in modal
  await expect(page.getByRole('dialog', { name: 'Delete webhook' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Webhook deleted')).toBeVisible();
  await expect(page.getByRole('gridcell', { name: url, exact: true })).not.toBeVisible({ timeout: 5_000 });
});
