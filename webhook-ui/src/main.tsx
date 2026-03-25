import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { createWebhookApi } from './api/webhookApi';

declare global {
  interface Window {
    __KC_REALM__: string;
    __KC_BASE__: string;
  }
}

const basePath = window.__KC_BASE__ || '';
const realm = window.__KC_REALM__;

async function init() {
  if (!realm) throw new Error('__KC_REALM__ is not set — check server-side placeholder injection');
  // Load KC JS adapter from Keycloak itself
  const kcModule = await import(/* @vite-ignore */ `${basePath}/js/keycloak.js`);
  const Keycloak = kcModule.default;

  const keycloak = new Keycloak({
    url: basePath || '/',
    realm,
    clientId: 'security-admin-console',
  });

  const authenticated = await keycloak.init({ onLoad: 'login-required' });

  if (!authenticated) {
    window.location.reload();
    return;
  }

  const api = createWebhookApi(basePath, realm, keycloak);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App api={api} />
    </React.StrictMode>,
  );
}

init().catch((err: unknown) => {
  const root = document.getElementById('root');
  if (root) {
    const pre = document.createElement('pre');
    pre.textContent = `Failed to initialize: ${err instanceof Error ? err.message : String(err)}`;
    root.appendChild(pre);
  }
});
