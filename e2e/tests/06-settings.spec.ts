import { test, expect } from '../fixtures/ports';

test('Settings tab shows radio group with default selection', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  const settingsTab = page.getByRole('tab', { name: 'Impostazioni' });
  await expect(settingsTab).toBeVisible({ timeout: 15_000 });
  await settingsTab.click();

  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('radio', { name: '5 secondi' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '10 secondi' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '30 secondi' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '60 secondi' })).toBeVisible();

  // Default: 10 seconds
  await expect(page.getByRole('radio', { name: '10 secondi' })).toBeChecked();
});

test('Changing interval persists after page reload', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '10 secondi' })).toBeChecked({ timeout: 5_000 });

  // Change to 30 seconds
  await page.getByRole('radio', { name: '30 secondi' }).click();
  await expect(page.getByRole('radio', { name: '30 secondi' })).toBeChecked();

  // Reload and verify persistence
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '30 secondi' })).toBeChecked({ timeout: 5_000 });
});

test('Settings tab is accessible from metrics tab and back', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Navigate: Webhooks → Metriche → Impostazioni → Metriche
  await page.getByRole('tab', { name: 'Metriche' }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible({ timeout: 5_000 });

  await page.getByRole('tab', { name: 'Metriche' }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });
});
