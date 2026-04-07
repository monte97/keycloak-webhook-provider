/**
 * Screenshot script for the Webhook Admin UI user guide.
 * Run from the repo root:  node docs/user-guide/take-screenshots.mjs
 *
 * Prerequisites:
 *   - demo stack running: cd demo && make up
 *   - Playwright installed: cd e2e && npm ci
 */

import { chromium } from './node_modules_ref/@playwright/test/index.js';

// We import from e2e/node_modules — run this script from repo root via:
//   node --experimental-vm-modules docs/user-guide/take-screenshots.mjs
// or simply require from e2e node_modules (see wrapper below)
