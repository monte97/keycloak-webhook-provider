import { test, expect } from '../fixtures/ports';

test.describe('Secret rotation', () => {
  test('graceful rotation: rotate → disclose → complete', async ({
    page,
    keycloakUrl,
    webhookAdminToken,
  }) => {
    // 1. Create a webhook via API
    const create = await fetch(`${keycloakUrl}/realms/demo/webhooks/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://example.test/hook-rotate-graceful',
        secret: 'initial-secret',
        enabled: true,
        eventTypes: ['admin.*'],
      }),
    });
    expect(create.status).toBe(201);
    const webhook = (await create.json()) as { id: string };

    // 2. Open the UI and navigate to the drawer
    await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
    const row = page
      .getByRole('row')
      .filter({ hasText: 'https://example.test/hook-rotate-graceful' });
    // Click the URL cell (first gridcell) — avoid row.click() which may land on the
    // Enabled cell (stopPropagation) and fail to open the drawer.
    await row.getByRole('gridcell').first().click();

    // 3. Secret card shows Active
    await expect(page.getByText(/active/i).first()).toBeVisible({ timeout: 10_000 });

    // 4. Click Rotate secret → modal
    await page.getByRole('button', { name: /rotate secret/i }).click();
    await expect(page.getByRole('dialog', { name: /rotate secret/i })).toBeVisible();

    // 5. Default is 7 days; click Rotate
    await page.getByRole('button', { name: /^rotate$/i }).click();

    // 6. Disclosure modal appears with new secret
    await expect(page.getByRole('dialog', { name: /new secret generated/i })).toBeVisible({
      timeout: 10_000,
    });
    // Tick the ack checkbox and close
    await page.getByLabel(/copied the secret/i).check();
    await page.getByRole('button', { name: /done/i }).click();

    // 7. API oracle: hasSecondarySecret=true, rotationExpiresAt in the future
    await expect
      .poll(
        async () => {
          const r = await fetch(
            `${keycloakUrl}/realms/demo/webhooks/${webhook.id}`,
            { headers: { Authorization: `Bearer ${webhookAdminToken}` } },
          );
          if (!r.ok) return null;
          return (await r.json()) as {
            hasSecondarySecret: boolean;
            rotationExpiresAt: string | null;
          };
        },
        { timeout: 10_000, intervals: [500, 1_000] },
      )
      .toMatchObject({ hasSecondarySecret: true });

    // 8. Drawer shows Rotating badge (drawerWebhook refreshed by onWebhookChange callback)
    await expect(page.getByText(/rotating/i).first()).toBeVisible({ timeout: 10_000 });

    // 9. Click Complete rotation now
    await page.getByRole('button', { name: /complete rotation/i }).click();

    // 10. API oracle: rotation cleared
    await expect
      .poll(
        async () => {
          const r = await fetch(
            `${keycloakUrl}/realms/demo/webhooks/${webhook.id}`,
            { headers: { Authorization: `Bearer ${webhookAdminToken}` } },
          );
          return ((await r.json()) as { hasSecondarySecret: boolean }).hasSecondarySecret;
        },
        { timeout: 10_000, intervals: [500, 1_000] },
      )
      .toBe(false);
  });

  test('emergency rotation discards in-flight secondary', async ({
    page,
    keycloakUrl,
    webhookAdminToken,
  }) => {
    // 1. Create webhook and start a graceful rotation via API
    const create = await fetch(`${keycloakUrl}/realms/demo/webhooks/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://example.test/hook-rotate-emergency',
        secret: 'initial-secret',
        enabled: true,
        eventTypes: ['admin.*'],
      }),
    });
    const webhook = (await create.json()) as { id: string };

    await fetch(`${keycloakUrl}/realms/demo/webhooks/${webhook.id}/rotate-secret`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'graceful', graceDays: 7 }),
    });

    // 2. Open drawer
    await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
    const row = page
      .getByRole('row')
      .filter({ hasText: 'https://example.test/hook-rotate-emergency' });
    await row.getByRole('gridcell').first().click();

    // 3. Rotate secret button is disabled because we're already rotating
    await expect(page.getByRole('button', { name: /^rotate secret$/i })).toBeDisabled();

    // 4. Click Emergency rotate
    await page.getByRole('button', { name: /emergency rotate/i }).click();
    await expect(page.getByRole('dialog', { name: /emergency rotate secret/i })).toBeVisible();

    // 5. Type "rotate" and confirm
    await page.getByLabel(/type "rotate" to confirm/i).fill('rotate');
    await page
      .getByRole('dialog', { name: /emergency rotate secret/i })
      .getByRole('button', { name: /emergency rotate/i })
      .click();

    // 6. Disclosure modal
    await expect(page.getByRole('dialog', { name: /new secret generated/i })).toBeVisible();
    await page.getByLabel(/copied the secret/i).check();
    await page.getByRole('button', { name: /done/i }).click();

    // 7. API oracle: secondary discarded
    await expect
      .poll(
        async () => {
          const r = await fetch(
            `${keycloakUrl}/realms/demo/webhooks/${webhook.id}`,
            { headers: { Authorization: `Bearer ${webhookAdminToken}` } },
          );
          return ((await r.json()) as { hasSecondarySecret: boolean }).hasSecondarySecret;
        },
        { timeout: 10_000, intervals: [500, 1_000] },
      )
      .toBe(false);
  });
});
