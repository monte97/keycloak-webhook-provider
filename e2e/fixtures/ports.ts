import { test as base } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface Ports {
  keycloakPort: number;
  consumerPort: number;
}

function readPorts(): Ports {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '.ports.json'), 'utf-8'),
  ) as Ports;
}

interface E2EFixtures {
  _ports: Ports;
  keycloakUrl: string;
  consumerPublicUrl: string;
  adminToken: string;
  webhookAdminToken: string;
}

export const test = base.extend<E2EFixtures>({
  _ports: async ({}, use) => {
    await use(readPorts());
  },

  keycloakUrl: async ({ _ports }, use) => {
    await use(`http://localhost:${_ports.keycloakPort}`);
  },

  consumerPublicUrl: async ({ _ports }, use) => {
    await use(`http://localhost:${_ports.consumerPort}`);
  },

  // Keycloak master-realm admin (can manage users, trigger events)
  adminToken: async ({ keycloakUrl }, use) => {
    const res = await fetch(
      `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=admin-cli&username=admin&password=admin&grant_type=password',
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`adminToken fetch failed: HTTP ${res.status} — ${body}`);
    }
    const data = (await res.json()) as { access_token: string };
    await use(data.access_token);
  },

  // webhook-admin (manage webhooks in demo realm)
  webhookAdminToken: async ({ keycloakUrl }, use) => {
    const res = await fetch(
      `${keycloakUrl}/realms/demo/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=admin-cli&username=webhook-admin&password=webhook-admin&grant_type=password',
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`webhookAdminToken fetch failed: HTTP ${res.status} — ${body}`);
    }
    const data = (await res.json()) as { access_token: string };
    await use(data.access_token);
  },
});

export { expect } from '@playwright/test';
