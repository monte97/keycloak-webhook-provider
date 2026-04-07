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

test('Webhook defaults card is visible with switch and inputs', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByText('Webhook — valori predefiniti')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel('Enabled by default')).toBeVisible();
  await expect(page.getByLabel('Max retry duration (seconds)')).toBeVisible();
  await expect(page.getByLabel('Max retry interval (seconds)')).toBeVisible();
});

test('Toggling enabled default off pre-populates create modal', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Set enabled default to off
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByLabel('Enabled by default')).toBeVisible({ timeout: 5_000 });
  await page.getByLabel('Enabled by default').click();

  // Open create modal
  await page.getByRole('tab', { name: 'Webhooks' }).click();
  await expect(page.getByRole('button', { name: /create webhook/i })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /create webhook/i }).click();
  await page.waitForSelector('[role="dialog"]');

  // Enabled should be off in the modal
  const enabledSwitch = page.locator('#enabled');
  await expect(enabledSwitch).not.toBeChecked();

  await page.keyboard.press('Escape');

  // Reset setting to avoid leaking state to subsequent tests
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByLabel('Enabled by default')).toBeVisible({ timeout: 5_000 });
  await page.getByLabel('Enabled by default').click();
});

test('Setting retry duration persists and pre-populates create modal', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Set retry duration
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  const retryInput = page.getByLabel('Max retry duration (seconds)');
  await expect(retryInput).toBeVisible({ timeout: 5_000 });
  await retryInput.fill('600');
  await retryInput.blur();

  // Reload and verify persistence
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByLabel('Max retry duration (seconds)')).toHaveValue('600', { timeout: 5_000 });

  // Open create modal and verify pre-population
  await page.getByRole('tab', { name: 'Webhooks' }).click();
  await expect(page.getByRole('button', { name: /create webhook/i })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /create webhook/i }).click();
  await page.waitForSelector('[role="dialog"]');
  await expect(page.locator('#retryMaxElapsed')).toHaveValue('600');

  await page.keyboard.press('Escape');

  // Reset retry duration to avoid leaking state to subsequent test runs
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  const retryInputCleanup = page.getByLabel('Max retry duration (seconds)');
  await expect(retryInputCleanup).toBeVisible({ timeout: 5_000 });
  await retryInputCleanup.fill('');
  await retryInputCleanup.blur();
});

test('Cronologia consegne card shows 4 radio options with 50 checked by default', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();

  await expect(page.getByText('Cronologia consegne')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('radio', { name: '10' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '25' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '50' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '100' })).toBeVisible();

  // Default: 50
  await expect(page.getByRole('radio', { name: '50' })).toBeChecked();
});

test('Delivery history page size persists after reload', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '50' })).toBeChecked({ timeout: 5_000 });

  await page.getByRole('radio', { name: '10' }).click();
  await expect(page.getByRole('radio', { name: '10' })).toBeChecked();

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '10' })).toBeChecked({ timeout: 5_000 });

  // Reset to default
  await page.getByRole('radio', { name: '50' }).click();
});

test('Delivery drawer shows Prev/Next pagination buttons', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  // Set page size to 10 so buttons are always visible
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('radio', { name: '10' })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('radio', { name: '10' }).click();

  // Open the delivery drawer (first webhook row)
  await page.getByRole('tab', { name: 'Webhooks' }).click();
  await page.waitForLoadState('networkidle');
  const firstRow = page.getByRole('row').nth(1); // skip header
  await firstRow.click();

  await expect(page.getByRole('button', { name: /prev/i })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: /next/i })).toBeVisible();

  // Reset page size to default
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await page.getByRole('radio', { name: '50' }).click();
});
