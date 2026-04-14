// e2e/tests/11-secret-rotation-ui.spec.ts
//
// UI-focused tests for the secret rotation flow in the delivery drawer.
// These complement the API-oracle tests in 07-secret-rotation.spec.ts by
// asserting that the correct UI states and modals are shown at each step.

import { test, expect } from '../fixtures/ports';

test.describe('Secret rotation UI', () => {
  test('Secret card shows Active state before rotation', async ({
    page,
    keycloakUrl,
    webhookAdminToken,
  }) => {
    // Create a webhook without a secret
    const res = await fetch(`${keycloakUrl}/realms/demo/webhooks/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://e2e.example.com/secret-ui-active',
        enabled: true,
        eventTypes: ['admin.*'],
      }),
    });
    expect(res.status).toBe(201);

    await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
    const row = page.getByRole('row').filter({ hasText: 'secret-ui-active' });
    await row.getByRole('gridcell').first().click();

    // Secret section is visible with Active badge
    await expect(page.locator('strong', { hasText: 'Secret' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Active').first()).toBeVisible();

    // Rotate secret button is enabled; Emergency rotate is always enabled
    await expect(page.getByRole('button', { name: /rotate secret/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /emergency rotate/i })).toBeEnabled();

    // Complete rotation button is NOT visible when not rotating
    await expect(page.getByRole('button', { name: /complete rotation/i })).not.toBeVisible();
  });

  test('Graceful rotation: modal → disclosure → Rotating badge → Complete', async ({
    page,
    keycloakUrl,
    webhookAdminToken,
  }) => {
    const res = await fetch(`${keycloakUrl}/realms/demo/webhooks/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://e2e.example.com/secret-ui-graceful',
        secret: 'initial-secret',
        enabled: true,
        eventTypes: ['admin.*'],
      }),
    });
    expect(res.status).toBe(201);

    await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
    const row = page.getByRole('row').filter({ hasText: 'secret-ui-graceful' });
    await row.getByRole('gridcell').first().click();
    await expect(page.getByText('Active')).toBeVisible({ timeout: 5_000 });

    // Open Rotate secret modal
    await page.getByRole('button', { name: /rotate secret/i }).click();
    const rotateModal = page.getByRole('dialog', { name: /rotate secret/i });
    await expect(rotateModal).toBeVisible();
    await expect(rotateModal.getByText(/zero-downtime rotation/i)).toBeVisible();
    await expect(rotateModal.getByRole('combobox', { name: /grace period/i })).toBeVisible();

    // Confirm with default grace period (7 days)
    await rotateModal.getByRole('button', { name: /^rotate$/i }).click();

    // Disclosure modal shows the new secret exactly once
    const disclosureModal = page.getByRole('dialog', { name: /new secret generated/i });
    await expect(disclosureModal).toBeVisible({ timeout: 10_000 });
    await expect(disclosureModal.getByText(/copy this secret now/i)).toBeVisible();
    // Secret value is displayed (non-empty text in the code/pre element)
    const secretValue = disclosureModal.locator('pre, code, [data-testid="secret-value"]');
    const secretText = await secretValue.first().textContent().catch(() => '');
    expect(secretText?.length).toBeGreaterThan(10);

    // Acknowledge and close
    await disclosureModal.getByLabel(/copied the secret/i).check();
    await disclosureModal.getByRole('button', { name: /done/i }).click();
    await expect(disclosureModal).not.toBeVisible();

    // Drawer updates to Rotating badge with expiry
    await expect(page.getByText(/rotating/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/expires/i)).toBeVisible();

    // Rotate secret is now disabled; Complete rotation and Emergency are visible
    await expect(page.getByRole('button', { name: /^rotate secret$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /complete rotation/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /emergency rotate/i })).toBeVisible();

    // Complete the rotation
    await page.getByRole('button', { name: /complete rotation/i }).click();
    await expect(page.getByText('Active')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^rotate secret$/i })).toBeEnabled();
  });

  test('Emergency rotation: confirm dialog → disclosure → Active', async ({
    page,
    keycloakUrl,
    webhookAdminToken,
  }) => {
    const res = await fetch(`${keycloakUrl}/realms/demo/webhooks/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://e2e.example.com/secret-ui-emergency',
        secret: 'initial-secret',
        enabled: true,
        eventTypes: ['admin.*'],
      }),
    });
    expect(res.status).toBe(201);

    await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
    const row = page.getByRole('row').filter({ hasText: 'secret-ui-emergency' });
    await row.getByRole('gridcell').first().click();
    await expect(page.getByText('Active')).toBeVisible({ timeout: 5_000 });

    // Open Emergency rotate modal
    await page.getByRole('button', { name: /emergency rotate/i }).click();
    const emergencyModal = page.getByRole('dialog', { name: /emergency rotate secret/i });
    await expect(emergencyModal).toBeVisible();
    await expect(emergencyModal.getByText(/immediate invalidation/i)).toBeVisible();

    // Confirm button is disabled until "rotate" is typed
    const confirmBtn = emergencyModal.getByRole('button', { name: /emergency rotate/i });
    await expect(confirmBtn).toBeDisabled();
    await emergencyModal.getByLabel(/type "rotate" to confirm/i).fill('rotate');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Disclosure modal
    const disclosureModal = page.getByRole('dialog', { name: /new secret generated/i });
    await expect(disclosureModal).toBeVisible({ timeout: 10_000 });
    await disclosureModal.getByLabel(/copied the secret/i).check();
    await disclosureModal.getByRole('button', { name: /done/i }).click();
    await expect(disclosureModal).not.toBeVisible();

    // Back to Active — no grace period, no "Complete rotation" button
    await expect(page.getByText('Active')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /complete rotation/i })).not.toBeVisible();
  });
});
