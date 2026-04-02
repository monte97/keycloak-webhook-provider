import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT = 'e2e-test';
const root = path.resolve(__dirname, '..');
const COMPOSE =
  `docker compose -f ${root}/demo/docker-compose.yml` +
  ` -f ${__dirname}/docker-compose.test.yml -p ${PROJECT}`;

async function globalTeardown(): Promise<void> {
  console.log('[teardown] docker compose down -v...');
  try {
    execSync(`${COMPOSE} down -v`, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    // Don't fail the test run just because teardown errored
    console.error('[teardown] warning:', e);
  }

  // Clean up generated files
  for (const f of ['.ports.json', '.auth.json']) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  console.log('[teardown] done');
}

export default globalTeardown;
