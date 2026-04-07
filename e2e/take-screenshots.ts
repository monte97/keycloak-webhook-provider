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
    viewport: { width: 1280, height: 800 },
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

  // ── 03 Delivery drawer ───────────────────────────────────────────────────
  // Click the URL cell in the first row (not the toggle or action buttons)
  const firstRowUrl = page.locator('tbody tr').first().locator('td').first();
  await firstRowUrl.click();
  await page.waitForSelector('[data-ouia-component-type="PF5/DrawerPanelContent"]', {
    state: 'visible',
    timeout: 5000,
  }).catch(async () => {
    // fallback: try clicking the row itself offset to avoid toggle
    await page.locator('tbody tr').first().click({ position: { x: 200, y: 15 } });
    await page.waitForTimeout(500);
  });
  await page.waitForTimeout(800);
  await shot(page, '03-delivery-drawer');

  // ── 04 Circuit breaker section (zoom) ───────────────────────────────────
  // Scroll the drawer to make the circuit section visible and screenshot it
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
  // Wait for drawer to fully close
  await page.waitForSelector('[data-ouia-component-type="PF5/DrawerPanelContent"]', {
    state: 'hidden',
    timeout: 5000,
  }).catch(() => {});
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

  await browser.close();
  console.log(`\nDone. Screenshots saved to: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
