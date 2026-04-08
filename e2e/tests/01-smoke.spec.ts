import { test, expect } from '../fixtures/ports';

test('UI loads without redirect to login', async ({ page, keycloakUrl }) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);

  // Should NOT be on the Keycloak login page (toHaveURL auto-retries)
  await expect(page).not.toHaveURL(/\/protocol\/openid-connect\/auth/);
});

test('Webhook list or empty state is visible', async ({ page, keycloakUrl }) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);

  // Either the table or the empty-state heading should appear
  const table = page.getByRole('table', { name: 'Webhooks' });
  const empty = page.getByText('No webhooks configured');
  await expect(table.or(empty)).toBeVisible({ timeout: 10_000 });
});

test('Page has no console errors on load', async ({ page, keycloakUrl }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    // Ignore network-level 403/4xx (e.g. Keycloak theme assets) — only catch JS runtime errors
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
      errors.push(msg.text());
    }
  });

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  // Wait for the app shell to render — by then any JS runtime errors thrown
  // during initial mount have already been captured by the console listener.
  const table = page.getByRole('table', { name: 'Webhooks' });
  const empty = page.getByText('No webhooks configured');
  await expect(table.or(empty)).toBeVisible({ timeout: 10_000 });

  expect(errors).toHaveLength(0);
});
