import { expect, type Page } from '@playwright/test';

/**
 * Open the "Create webhook" modal. Works from both the empty state and the
 * toolbar — the same button label is used in both contexts.
 */
export async function openCreateModal(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: 'Create webhook' });
  // Wait for the button to appear — stable signal that the app has rendered.
  await expect(btn.first()).toBeVisible({ timeout: 15_000 });
  await btn.first().click();
  await expect(page.getByRole('dialog', { name: 'Create webhook' })).toBeVisible();
}

/**
 * Fill the URL field and pick the first event type matching the given filter.
 *
 * PatternFly Select dropdown rendering: <ul role="listbox"> → <li> → <button role="option">.
 * We use CSS attribute selectors instead of getByRole to avoid matching the
 * hidden native <option> elements from the Algorithm <select>, which also
 * carry ARIA role "option".
 */
export async function fillWebhookForm(
  page: Page,
  url: string,
  eventFilter = '*',
): Promise<void> {
  await page.getByLabel('URL').fill(url);
  const eventSearch = page.getByPlaceholder('Search event types...');
  await eventSearch.click();
  await eventSearch.fill(eventFilter);
  const dropdown = page.locator('[role="listbox"]');
  await expect(dropdown).toBeVisible({ timeout: 5_000 });
  await dropdown.locator('[role="option"]').first().click();
}

/**
 * Full create-webhook flow via the UI: open modal, fill form, save, wait for
 * the success toast and the row to appear in the table. Returns the URL used.
 */
export async function createWebhookViaUI(
  page: Page,
  url: string,
  eventFilter = '*',
): Promise<string> {
  await openCreateModal(page);
  await fillWebhookForm(page, url, eventFilter);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();
  await expect(
    page.getByRole('gridcell', { name: url, exact: true }),
  ).toBeVisible({ timeout: 5_000 });
  return url;
}
