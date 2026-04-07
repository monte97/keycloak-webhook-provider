import { test, expect } from '../fixtures/ports';

/** Create + delete a user in the demo realm to generate admin events. */
async function triggerEvents(keycloakUrl: string, adminToken: string, n = 1): Promise<void> {
  for (let i = 0; i < n; i++) {
    const username = `e2e-metrics-${Date.now()}-${i}`;
    const createRes = await fetch(`${keycloakUrl}/admin/realms/demo/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        enabled: true,
        credentials: [{ type: 'password', value: 'temp123', temporary: false }],
      }),
    });
    if (!createRes.ok) throw new Error(`Create user failed: ${createRes.status}`);
    const location = createRes.headers.get('location')!;
    const userId = location.split('/').pop()!;
    const deleteRes = await fetch(`${keycloakUrl}/admin/realms/demo/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!deleteRes.ok) throw new Error(`Delete user failed: ${deleteRes.status}`);
  }
}

test('Metrics tab is accessible from the main navigation', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');

  const metricsTab = page.getByRole('tab', { name: 'Metriche' });
  await expect(metricsTab).toBeVisible({ timeout: 15_000 });
  await metricsTab.click();

  await expect(page.getByRole('heading', { name: 'Metriche' })).toBeVisible({ timeout: 5_000 });
});

test('Metrics page shows 4 cards on load', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Metriche' }).click();

  // Use exact:true so the locator matches only the card title element,
  // not the <pre> block that contains these words in Prometheus HELP lines.
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Events received', { exact: true })).toBeVisible();
  await expect(page.getByText('Retries', { exact: true })).toBeVisible();
  await expect(page.getByText('Queue pending', { exact: true })).toBeVisible();
});

test('Metrics show non-zero dispatches after events are triggered', async ({
  page,
  keycloakUrl,
  consumerPublicUrl,
  adminToken,
}) => {
  // 1. Create a webhook pointed at a live consumer session
  const sessionRes = await fetch(`${consumerPublicUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_code: 200 }),
  });
  const { uuid } = (await sessionRes.json()) as { uuid: string };

  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  const createBtn = page.getByRole('button', { name: 'Create webhook' });
  await expect(createBtn.first()).toBeVisible({ timeout: 15_000 });
  await createBtn.first().click();
  await page.getByLabel('URL').fill(`http://consumer:8080/${uuid}`);
  const eventSearch = page.getByPlaceholder('Search event types...');
  await eventSearch.click();
  await eventSearch.fill('*');
  const dropdown = page.locator('[role="listbox"]');
  await expect(dropdown).toBeVisible({ timeout: 5_000 });
  await dropdown.locator('[role="option"]').first().click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Webhook created')).toBeVisible();

  // 2. Trigger events and wait for dispatch
  await triggerEvents(keycloakUrl, adminToken, 1);
  await page.waitForTimeout(5_000);

  // 3. Switch to Metriche tab
  await page.getByRole('tab', { name: 'Metriche' }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });

  // 4. Dispatches count should be > 0 — the text is a number inside the card
  //    Use Aggiorna to force a fresh fetch (auto-refresh may not have fired yet)
  await page.getByRole('button', { name: /aggiorna/i }).click();
  await page.waitForTimeout(2_000);

  // The dispatch count should NOT be '—' (dashes)
  const dispatchCard = page.locator('.pf-v5-c-card').filter({ hasText: /^Dispatches/ }).first();
  await expect(dispatchCard).not.toContainText('—');
});

test('Aggiorna button triggers a fresh metrics fetch', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Metriche' }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Intercept requests to the metrics endpoint
  let fetchCount = 0;
  page.on('request', (req) => {
    if (req.url().includes('/webhooks/metrics')) fetchCount++;
  });

  const countBefore = fetchCount;
  await page.getByRole('button', { name: /aggiorna/i }).click();
  await page.waitForTimeout(1_000);

  expect(fetchCount).toBeGreaterThan(countBefore);
});

test('Auto-refresh toggle is present and can be switched off', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Metriche' }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });

  // PF5 Switch renders the <input> as visually hidden; click the visible <label> instead
  const toggleLabel = page.locator('label[for="auto-refresh-toggle"]');
  await expect(toggleLabel).toBeVisible();
  // Toggle is on by default — switch it off
  await toggleLabel.click();
  // No error — page remains stable
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible();
  // Toggle it back on
  await toggleLabel.click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible();
});

test('Raw Prometheus section is expandable and contains metric names', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Metriche' }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Expand the Raw Prometheus section
  const rawToggle = page.getByRole('button', { name: /raw prometheus/i });
  await expect(rawToggle).toBeVisible();
  await rawToggle.click();

  // The expanded section should contain Prometheus metric names
  await expect(page.getByText(/webhook_dispatches_total/)).toBeVisible({ timeout: 5_000 });
});

test('Metrics API endpoint returns Prometheus text format', async ({
  keycloakUrl,
  webhookAdminToken,
}) => {
  const res = await fetch(`${keycloakUrl}/realms/demo/webhooks/metrics`, {
    headers: { Authorization: `Bearer ${webhookAdminToken}` },
  });

  expect(res.status).toBe(200);

  const contentType = res.headers.get('content-type') ?? '';
  expect(contentType).toMatch(/text\/plain/);

  const body = await res.text();
  // Must contain at least the dispatches counter family
  expect(body).toContain('webhook_dispatches_total');
  // Prometheus text format: lines start with # HELP or # TYPE or metric name
  expect(body).toMatch(/^# (HELP|TYPE) /m);
});
