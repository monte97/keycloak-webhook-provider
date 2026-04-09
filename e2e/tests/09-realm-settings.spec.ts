// e2e/tests/09-realm-settings.spec.ts
import { test, expect } from '../fixtures/ports';

test('Realm settings: server configuration section is visible with default values', async ({
  page,
  keycloakUrl,
}) => {
  // 1. Navigate to UI → Impostazioni tab
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.getByRole('tab', { name: 'Impostazioni' }).click();

  // 2. Wait for the settings page heading to appear
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible({ timeout: 5_000 });

  // 3. Verify server configuration card title is displayed
  await expect(page.getByText('Configurazione server')).toBeVisible({ timeout: 10_000 });

  // 4. Verify realm settings input fields exist
  await expect(page.getByLabel('Event retention (days)')).toBeVisible();
  await expect(page.getByLabel('Send retention (days)')).toBeVisible();
  await expect(page.getByLabel('Circuit failure threshold')).toBeVisible();
  await expect(page.getByLabel('Circuit open duration (seconds)')).toBeVisible();
});

test('Realm settings: event retention days change persists after reload', async ({
  page,
  keycloakUrl,
}) => {
  // 1. Navigate to UI → Impostazioni tab
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.getByRole('tab', { name: 'Impostazioni' }).click();

  // 2. Wait for the server settings card to appear
  await expect(page.getByText('Configurazione server')).toBeVisible({ timeout: 10_000 });

  // 3. Verify initial value
  const eventDaysInput = page.getByLabel('Event retention (days)');
  await expect(eventDaysInput).toBeVisible();
  const initialValue = await eventDaysInput.inputValue();

  // 4. Change the value to something different
  const testValue = '45';
  if (initialValue !== testValue) {
    await eventDaysInput.fill(testValue);
    // Wait for the PUT request (allow some time for debounce/blur handlers)
    const putPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/realm-settings') && resp.request().method() === 'PUT',
    ).catch(() => null); // Don't fail if request doesn't complete in time
    await eventDaysInput.blur();
    await putPromise;

    // 5. Reload the page and verify the change persisted
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: 'Impostazioni' }).click();
    await expect(page.getByText('Configurazione server')).toBeVisible({ timeout: 10_000 });
    const reloadedValue = await page.getByLabel('Event retention (days)').inputValue();
    expect(reloadedValue).toBe(testValue);

    // 6. Reset to original value to avoid polluting other test runs
    const resetInput = page.getByLabel('Event retention (days)');
    await resetInput.fill(initialValue);
    const resetPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/realm-settings') && resp.request().method() === 'PUT',
    ).catch(() => null);
    await resetInput.blur();
    await resetPromise;
  }
});
