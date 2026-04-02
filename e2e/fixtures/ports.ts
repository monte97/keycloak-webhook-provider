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
  keycloakUrl: string;
  consumerPublicUrl: string;
  adminToken: string;
  webhookAdminToken: string;
}

export const test = base.extend<E2EFixtures>({
  keycloakUrl: async ({}, use) => {
    const { keycloakPort } = readPorts();
    await use(`http://localhost:${keycloakPort}`);
  },

  consumerPublicUrl: async ({}, use) => {
    const { consumerPort } = readPorts();
    await use(`http://localhost:${consumerPort}`);
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
    const data = (await res.json()) as { access_token: string };
    await use(data.access_token);
  },
});

export { expect } from '@playwright/test';
