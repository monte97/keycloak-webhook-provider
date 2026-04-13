/**
 * Screenshot script for the Webhook Admin UI user guide.
 *
 * Run from the repo root:
 *   cd e2e && npx ts-node --project tsconfig.json take-screenshots.ts
 *
 * Prerequisites:
 *   - demo stack running on port 8088: cd demo && make up
 */

import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:8088';
const UI_URL = `${BASE_URL}/realms/demo/webhooks/ui`;
const OUT_DIR = path.resolve(__dirname, '../docs/user-guide/screenshots');

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
  console.log(`  ✓ ${name}.png`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1400 },
  });
  const page = await context.newPage();

  // ── Login ────────────────────────────────────────────────────────────────
  console.log('Logging in...');
  await page.goto(UI_URL);
  await page.waitForURL(/openid-connect\/auth/);
  await page.fill('#username', 'webhook-admin');
  await page.fill('#password', 'webhook-admin');
  await Promise.all([
    page.waitForURL((url) => url.href.startsWith(UI_URL)),
    page.click('[type=submit]'),
  ]);
  await page.waitForLoadState('networkidle');
  console.log('Logged in. Taking screenshots...\n');

  // ── 01 Webhooks list ─────────────────────────────────────────────────────
  await shot(page, '01-webhooks-list');

  // ── 02 Create webhook modal ──────────────────────────────────────────────
  await page.click('button:has-text("Create webhook")');
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(300);
  await shot(page, '02-create-webhook-modal');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  // Wait for modal backdrop animation to fully complete
  await page.locator('.pf-v5-c-backdrop').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);

  // ── 03 Delivery drawer (Delivery history tab) ───────────────────────────
  // Click the URL cell in the first data row to open the drawer.
  // The "Enabled" and "Actions" cells have stopPropagation; click the URL cell area (x≈50).
  await page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('tbody tr').first().click({ position: { x: 50, y: 12 } });
  // Drawer is detected by the "Rotate secret" button that appears inside it
  await page.getByRole('button', { name: 'Rotate secret' }).waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  await shot(page, '03-delivery-drawer');

  // ── 03b Events tab ───────────────────────────────────────────────────────
  // PF5 drawer tabs use .pf-v5-c-tabs__link, not role="tab"
  try {
    const eventsTab = page.locator('.pf-v5-c-tabs__link', { hasText: 'Events' });
    await eventsTab.waitFor({ state: 'visible', timeout: 5000 });
    await eventsTab.scrollIntoViewIfNeeded();
    await eventsTab.click();
    await page.waitForTimeout(1000);
    await shot(page, '03b-events-tab');
    // Go back to delivery history tab
    const deliveryTab = page.locator('.pf-v5-c-tabs__link', { hasText: 'Delivery history' });
    await deliveryTab.waitFor({ state: 'visible', timeout: 3000 });
    await deliveryTab.click();
    await page.waitForTimeout(400);
  } catch {
    console.log('  ⚠ Events tab not found, skipping 03b');
  }

  // ── 04 Circuit breaker section ───────────────────────────────────────────
  const circuitSection = page.locator('text=Circuit breaker').first();
  if (await circuitSection.isVisible()) {
    await circuitSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }
  await shot(page, '04-circuit-breaker');

  // Close drawer — try close button first, fall back to Escape
  const closeBtn = page.locator('button[aria-label="Close drawer panel"], button[aria-label="Close drawer"], button[aria-label="Close"]').first();
  const closeBtnVisible = await closeBtn.isVisible({ timeout: 2000 }).catch(() => false);
  if (closeBtnVisible) {
    await closeBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  // Wait for "Rotate secret" to disappear (drawer closed)
  await page.getByRole('button', { name: 'Rotate secret' }).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);

  // ── 05 Metrics tab ───────────────────────────────────────────────────────
  const metricsTab = page.getByRole('tab', { name: 'Metriche' });
  await metricsTab.click({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  await shot(page, '05-metrics-page');

  // ── 06 Metrics raw Prometheus expanded ──────────────────────────────────
  const rawToggle = page.locator('button').filter({ hasText: /Raw Prometheus/ }).first();
  if (await rawToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await rawToggle.click();
    await page.waitForTimeout(500);
  }
  await shot(page, '06-metrics-raw-prometheus');

  // ── 07 Settings page ────────────────────────────────────────────────────
  const settingsTab = page.getByRole('tab', { name: 'Impostazioni' });
  await settingsTab.click({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await shot(page, '07-settings-page');

  // ── 07b Settings — Server configuration card (Realm Settings) ───────────
  try {
    const serverConfigCard = page.getByText('Configurazione server');
    await serverConfigCard.waitFor({ state: 'visible', timeout: 8000 });
    await serverConfigCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, '07b-settings-server-config');
  } catch {
    console.log('  ⚠ Configurazione server card not found, skipping 07b');
  }

  await browser.close();
  console.log(`\nDone. Screenshots saved to: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
