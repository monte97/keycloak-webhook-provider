import { test, expect } from '../fixtures/ports';
import { triggerUserCycle } from '../fixtures/admin-events';
import { createWebhookViaUI } from '../fixtures/webhook-helpers';
import { waitForDelivery } from '../fixtures/consumer';
import { TAB_METRICHE, HEADING_METRICHE, BTN_AGGIORNA } from '../fixtures/labels.it';

test('Metrics tab is accessible from the main navigation', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);

  const metricsTab = page.getByRole('tab', { name: TAB_METRICHE });
  await expect(metricsTab).toBeVisible({ timeout: 15_000 });
  await metricsTab.click();

  await expect(page.getByRole('heading', { name: HEADING_METRICHE })).toBeVisible({ timeout: 5_000 });
});

test('Metrics page shows 4 cards on load', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.getByRole('tab', { name: TAB_METRICHE }).click();

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
  await createWebhookViaUI(page, `http://consumer:8080/${uuid}`);

  // 2. Trigger events and wait for the consumer to record the delivery
  await triggerUserCycle(keycloakUrl, adminToken);
  await waitForDelivery(consumerPublicUrl, uuid);

  // 3. Switch to Metriche tab
  await page.getByRole('tab', { name: TAB_METRICHE }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });

  // 4. Force a fresh metrics fetch and assert the dispatches count is no longer '—'.
  //    The web-first assertion auto-retries until the card updates.
  await page.getByRole('button', { name: BTN_AGGIORNA }).click();
  const dispatchCard = page.locator('.pf-v5-c-card').filter({ hasText: /^Dispatches/ }).first();
  await expect(dispatchCard).not.toContainText('—', { timeout: 10_000 });
});

test('Aggiorna button triggers a fresh metrics fetch', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.getByRole('tab', { name: TAB_METRICHE }).click();
  await expect(page.getByText('Dispatches', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Intercept requests to the metrics endpoint
  let fetchCount = 0;
  page.on('request', (req) => {
    if (req.url().includes('/webhooks/metrics')) fetchCount++;
  });

  const countBefore = fetchCount;
  await page.getByRole('button', { name: BTN_AGGIORNA }).click();

  // Poll fetchCount instead of sleeping — the request fires shortly after the click.
  await expect.poll(() => fetchCount, { timeout: 5_000 }).toBeGreaterThan(countBefore);
});

test('Auto-refresh toggle is present and can be switched off', async ({
  page,
  keycloakUrl,
}) => {
  await page.goto(`${keycloakUrl}/realms/demo/webhooks/ui`);
  await page.getByRole('tab', { name: TAB_METRICHE }).click();
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
  await page.getByRole('tab', { name: TAB_METRICHE }).click();
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
