import { execSync } from 'child_process';
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT = 'e2e-test';
const root = path.resolve(__dirname, '..');
const COMPOSE =
  `docker compose -f ${root}/demo/docker-compose.yml` +
  ` -f ${__dirname}/docker-compose.test.yml -p ${PROJECT}`;

async function pollHealth(url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`Keycloak not ready after ${timeoutMs}ms — last error: ${last}`);
}

async function globalSetup(): Promise<void> {
  // 1. Boot the stack
  console.log('[setup] docker compose up...');
  execSync(`${COMPOSE} up -d --build`, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      KEYCLOAK_PORT: '0',
      CONSUMER_PORT: '0',
      KC_ADMIN_PASSWORD: 'admin',
      KC_REALM: 'demo',
    },
  });

  // 2. Read assigned ports (docker allocates them after up)
  const readPort = (service: string): number => {
    const out = execSync(`${COMPOSE} port ${service} 8080`, { cwd: root })
      .toString()
      .trim();
    // output format: "0.0.0.0:XXXXX" or ":::XXXXX"
    const port = parseInt(out.split(':').pop()!, 10);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(
        `Could not determine host port for service '${service}': got ${JSON.stringify(out)}`,
      );
    }
    return port;
  };

  const keycloakPort = readPort('keycloak');
  const consumerPort = readPort('consumer');
  const ports = { keycloakPort, consumerPort };

  fs.writeFileSync(path.join(__dirname, '.ports.json'), JSON.stringify(ports, null, 2));
  console.log(`[setup] ports: keycloak=${keycloakPort}, consumer=${consumerPort}`);

  // 3. Poll Keycloak health
  const kcBase = `http://localhost:${keycloakPort}`;
  await pollHealth(`${kcBase}/realms/master`);
  console.log('[setup] Keycloak is ready');

  // 4. Authenticate as webhook-admin and save storage state
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const uiUrl = `${kcBase}/realms/demo/webhooks/ui`;
    await page.goto(uiUrl);

    // keycloak-js redirects to Keycloak login page (login-required mode)
    await page.waitForURL(/\/realms\/demo\/protocol\/openid-connect\/auth/);

    await page.fill('#username', 'webhook-admin');
    await page.fill('#password', 'webhook-admin');
    await page.click('[type=submit]');

    // Wait for redirect back to the UI and app to render
    await page.waitForURL((url) => url.href.startsWith(uiUrl));
    await page.waitForLoadState('networkidle');

    await context.storageState({ path: path.join(__dirname, '.auth.json') });
  } finally {
    await browser.close();
  }

  console.log('[setup] auth saved');
}

export default globalSetup;
