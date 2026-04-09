// e2e/tests/09-realm-settings.spec.ts
import { test, expect } from '../fixtures/ports';

test('Realm settings: default values visible and changes persist after reload', async ({
  page,
  keycloakUrl,
}) => {
  // 1. Navigate to UI → Impostazioni tab
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.getByRole('tab', { name: 'Impostazioni' }).click();

  // 2. Wait for the server settings card to appear
  await expect(page.getByText('Configurazione server')).toBeVisible({ timeout: 10_000 });

  // 3. Verify default values are displayed
  await expect(page.getByLabel('Event retention (days)')).toHaveValue('30');
  await expect(page.getByLabel('Send retention (days)')).toHaveValue('90');
  await expect(page.getByLabel('Circuit failure threshold')).toHaveValue('5');
  await expect(page.getByLabel('Circuit open duration (seconds)')).toHaveValue('60');

  // 4. Change retentionEventDays to 45
  const eventDaysInput = page.getByLabel('Event retention (days)');
  await eventDaysInput.fill('45');
  const putPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/realm-settings') && resp.request().method() === 'PUT',
  );
  await eventDaysInput.blur();
  await putPromise;

  // 5. Reload the page and verify the change persisted
  await page.reload();
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByText('Configurazione server')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('Event retention (days)')).toHaveValue('45');

  // 6. Reset to default (30) to avoid polluting other test runs
  const eventDaysInput2 = page.getByLabel('Event retention (days)');
  await eventDaysInput2.fill('30');
  const resetPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('/realm-settings') && resp.request().method() === 'PUT',
  );
  await eventDaysInput2.blur();
  await resetPromise;
});
