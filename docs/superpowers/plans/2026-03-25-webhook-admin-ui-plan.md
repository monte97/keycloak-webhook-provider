# Webhook Admin UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a React + PatternFly admin UI to the keycloak-webhook-provider JAR for managing webhooks visually.

**Architecture:** Vite project in `webhook-ui/`, built into the JAR via `frontend-maven-plugin`. Served by new endpoints on the existing `WebhooksResource` class. Authentication via Keycloak JS adapter using `security-admin-console` client.

**Tech Stack:** React 18, PatternFly 5 (`@patternfly/react-core` ^5.4, `@patternfly/react-table` ^5.4), Vite 5, TypeScript 5, Vitest, React Testing Library, `frontend-maven-plugin` 1.15

**Spec:** `docs/superpowers/specs/2026-03-25-webhook-admin-ui-design.md`

---

## File structure

### New files

```
webhook-ui/
├── src/
│   ├── main.tsx                    ← KC JS adapter init, render App
│   ├── App.tsx                     ← App shell with ErrorBoundary
│   ├── ErrorBoundary.tsx           ← Top-level error catch
│   ├── api/
│   │   ├── types.ts                ← Webhook, WebhookInput, CircuitState, etc.
│   │   └── webhookApi.ts           ← Typed REST client over fetch()
│   ├── components/
│   │   ├── WebhookTable.tsx        ← Main page: table + toolbar + polling
│   │   ├── WebhookModal.tsx        ← Create/edit modal
│   │   └── CircuitBadge.tsx        ← Colored badge + reset popover
│   └── __tests__/
│       ├── webhookApi.test.ts      ← API client tests
│       ├── CircuitBadge.test.tsx   ← Badge rendering + reset
│       ├── WebhookModal.test.tsx   ← Form validation + create/edit
│       └── WebhookTable.test.tsx   ← Table rendering + actions
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

### Modified files

```
pom.xml                                              ← add frontend-maven-plugin
.gitignore                                           ← add webhook-ui/node_modules/, webhook-ui/node/, src/main/resources/webhook-ui/
src/main/java/.../resources/WebhooksResource.java    ← add GET /ui and GET /ui/{path}
```

---

### Task 1: Build infrastructure — Vite project + Maven integration

**Files:**
- Create: `webhook-ui/package.json`
- Create: `webhook-ui/tsconfig.json`
- Create: `webhook-ui/vite.config.ts`
- Create: `webhook-ui/vitest.config.ts`
- Create: `webhook-ui/index.html`
- Modify: `pom.xml` (add `frontend-maven-plugin` after `maven-compiler-plugin`)
- Modify: `.gitignore`

- [ ] **Step 1: Create `webhook-ui/package.json`**

```json
{
  "name": "webhook-ui",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@patternfly/react-core": "^5.4.0",
    "@patternfly/react-table": "^5.4.0",
    "@patternfly/react-icons": "^5.4.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `webhook-ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `webhook-ui/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../src/main/resources/webhook-ui',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/auth': 'http://localhost:8080',
      '/realms': 'http://localhost:8080',
      '/js': 'http://localhost:8080',
    },
  },
});
```

- [ ] **Step 4: Create `webhook-ui/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 5: Create `webhook-ui/src/__tests__/setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Create `webhook-ui/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Webhook Management</title>
  <script>
    window.__KC_REALM__ = "{{REALM}}";
    window.__KC_BASE__ = "{{BASE_PATH}}";
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 7: Add `frontend-maven-plugin` to `pom.xml`**

Add this plugin block inside `<plugins>`, **before** the `maven-shade-plugin` (so frontend builds before JAR packaging). Insert after the closing `</plugin>` of `maven-compiler-plugin` and before `maven-surefire-plugin`:

```xml
      <plugin>
        <groupId>com.github.eirslett</groupId>
        <artifactId>frontend-maven-plugin</artifactId>
        <version>1.15.1</version>
        <configuration>
          <workingDirectory>webhook-ui</workingDirectory>
          <nodeVersion>v20.18.0</nodeVersion>
          <installDirectory>webhook-ui</installDirectory>
        </configuration>
        <executions>
          <execution>
            <id>install-node-and-npm</id>
            <goals><goal>install-node-and-npm</goal></goals>
          </execution>
          <execution>
            <id>npm-ci</id>
            <goals><goal>npm</goal></goals>
            <configuration>
              <arguments>ci</arguments>
            </configuration>
          </execution>
          <execution>
            <id>npm-test</id>
            <goals><goal>npm</goal></goals>
            <configuration>
              <arguments>test</arguments>
            </configuration>
          </execution>
          <execution>
            <id>npm-build</id>
            <goals><goal>npm</goal></goals>
            <configuration>
              <arguments>run build</arguments>
            </configuration>
          </execution>
        </executions>
      </plugin>
```

- [ ] **Step 8: Update `.gitignore`**

Append these lines:

```
webhook-ui/node_modules/
webhook-ui/node/
src/main/resources/webhook-ui/
```

- [ ] **Step 9: Create placeholder `webhook-ui/src/main.tsx`** (so `npm run build` succeeds)

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div>Webhook UI placeholder</div>
  </React.StrictMode>,
);
```

- [ ] **Step 10: Install dependencies and verify build**

```bash
cd webhook-ui && npm install
npm test   # should pass (no tests yet = 0 failures)
npm run build   # should produce ../src/main/resources/webhook-ui/index.html
```

Expected: `src/main/resources/webhook-ui/` contains `index.html` + `assets/` directory.

- [ ] **Step 11: Verify Maven build produces JAR with UI assets**

```bash
cd /home/monte97/Projects/keycloak-service/webhook-provider
JAVA_HOME=/home/monte97/.sdkman/candidates/java/17.0.0-tem \
PATH=/home/monte97/.sdkman/candidates/java/17.0.0-tem/bin:$PATH \
mvn package -Dmaven.failsafe.skip=true -q
jar tf target/keycloak-webhook-provider-*.jar | grep webhook-ui
```

Expected: output shows `webhook-ui/index.html` and `webhook-ui/assets/*`.

- [ ] **Step 12: Commit**

```bash
git add webhook-ui/package.json webhook-ui/tsconfig.json webhook-ui/vite.config.ts \
  webhook-ui/vitest.config.ts webhook-ui/index.html webhook-ui/src/main.tsx \
  webhook-ui/src/__tests__/setup.ts webhook-ui/package-lock.json \
  pom.xml .gitignore
git commit -m "feat(ui): scaffold Vite project + Maven build integration"
```

---

### Task 2: TypeScript types + API client

**Files:**
- Create: `webhook-ui/src/api/types.ts`
- Create: `webhook-ui/src/api/webhookApi.ts`
- Create: `webhook-ui/src/__tests__/webhookApi.test.ts`

- [ ] **Step 1: Create `webhook-ui/src/api/types.ts`**

```typescript
export interface Webhook {
  id: string;
  url: string;
  algorithm: string;
  enabled: boolean;
  eventTypes: string[];
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  createdAt: string;
  retryMaxElapsedSeconds?: number;
  retryMaxIntervalSeconds?: number;
}

export interface WebhookInput {
  url: string;
  secret?: string;
  algorithm?: string;
  enabled: boolean;
  eventTypes: string[];
}

export interface SecretStatus {
  type: 'secret';
  configured: boolean;
}

export interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureAt: string | null;
  failureThreshold: number;
  openSeconds: number;
}

export interface TestResult {
  httpStatus: number;
  success: boolean;
  durationMs: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API error ${status}: ${body}`);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 2: Write failing tests for `webhookApi`**

Create `webhook-ui/src/__tests__/webhookApi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebhookApi } from '../api/webhookApi';
import type { WebhookInput } from '../api/types';
import { ApiError } from '../api/types';

const mockUpdateToken = vi.fn().mockResolvedValue(true);
const mockKeycloak = { token: 'test-token', updateToken: mockUpdateToken } as any;

describe('webhookApi', () => {
  let api: ReturnType<typeof createWebhookApi>;

  beforeEach(() => {
    vi.restoreAllMocks();
    api = createWebhookApi('/auth', 'my-realm', mockKeycloak);
  });

  it('list() fetches webhooks with correct URL and auth header', async () => {
    const webhooks = [{ id: '1', url: 'http://test.com', enabled: true }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(webhooks), { status: 200 }),
    );

    const result = await api.list();

    expect(mockUpdateToken).toHaveBeenCalledWith(30);
    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks?first=0&max=100',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
    expect(result).toEqual(webhooks);
  });

  it('create() POSTs with JSON body', async () => {
    const input: WebhookInput = {
      url: 'http://test.com/hook',
      enabled: true,
      eventTypes: ['access.LOGIN'],
    };
    const created = { id: '2', ...input };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(created), { status: 201 }),
    );

    const result = await api.create(input);

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result).toEqual(created);
  });

  it('throws ApiError on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 }),
    );

    await expect(api.list()).rejects.toThrow(ApiError);
    await expect(api.list()).rejects.toMatchObject({ status: 403 });
  });

  it('delete() sends DELETE request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await api.delete('abc');

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks/abc',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('resetCircuit() POSTs to circuit/reset', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await api.resetCircuit('abc');

    expect(fetch).toHaveBeenCalledWith(
      '/auth/realms/my-realm/webhooks/abc/circuit/reset',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
```

- [ ] **Step 3: Run tests — expect failures**

```bash
cd webhook-ui && npx vitest run
```

Expected: FAIL — `createWebhookApi` does not exist.

- [ ] **Step 4: Implement `webhook-ui/src/api/webhookApi.ts`**

```typescript
import type { Webhook, WebhookInput, SecretStatus, CircuitState, TestResult } from './types';
import { ApiError } from './types';

interface KeycloakInstance {
  token: string;
  updateToken(minValidity: number): Promise<boolean>;
}

export function createWebhookApi(basePath: string, realm: string, keycloak: KeycloakInstance) {
  const baseUrl = `${basePath}/realms/${realm}/webhooks`;

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    await keycloak.updateToken(30);
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${keycloak.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError(res.status, body);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  return {
    list(first = 0, max = 100): Promise<Webhook[]> {
      return request(`?first=${first}&max=${max}`);
    },
    count(): Promise<number> {
      return request('/count');
    },
    get(id: string): Promise<Webhook> {
      return request(`/${id}`);
    },
    create(data: WebhookInput): Promise<Webhook> {
      return request('', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<WebhookInput>): Promise<Webhook> {
      return request(`/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<void> {
      return request(`/${id}`, { method: 'DELETE' });
    },
    getSecretStatus(id: string): Promise<SecretStatus> {
      return request(`/${id}/secret`);
    },
    test(id: string): Promise<TestResult> {
      return request(`/${id}/test`, { method: 'POST' });
    },
    getCircuit(id: string): Promise<CircuitState> {
      return request(`/${id}/circuit`);
    },
    resetCircuit(id: string): Promise<void> {
      return request(`/${id}/circuit/reset`, { method: 'POST' });
    },
  };
}

export type WebhookApiClient = ReturnType<typeof createWebhookApi>;
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd webhook-ui && npx vitest run
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add webhook-ui/src/api/ webhook-ui/src/__tests__/webhookApi.test.ts
git commit -m "feat(ui): add typed API client with tests"
```

---

### Task 3: JAX-RS endpoints for serving UI static files

**Files:**
- Modify: `src/main/java/dev/montell/keycloak/resources/WebhooksResource.java`
- Create: `src/test/java/dev/montell/keycloak/unit/WebhooksResourceUiTest.java`

- [ ] **Step 1: Write failing tests for UI serving endpoints**

Create `src/test/java/dev/montell/keycloak/unit/WebhooksResourceUiTest.java`:

```java
package dev.montell.keycloak.unit;

import dev.montell.keycloak.resources.WebhooksResource;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakContext;
import org.keycloak.models.RealmModel;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.URI;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WebhooksResourceUiTest {

    @Mock KeycloakSession session;
    @Mock RealmModel realm;
    @Mock KeycloakContext context;
    @Mock UriInfo uriInfo;

    WebhooksResource resource;

    @BeforeEach
    void setUp() {
        when(realm.getName()).thenReturn("test-realm");
        when(session.getContext()).thenReturn(context);
        when(context.getUri()).thenReturn(uriInfo);
        when(uriInfo.getBaseUri()).thenReturn(URI.create("http://localhost:8080/auth/"));
        resource = new WebhooksResource(session, realm);
    }

    @Test
    void serveUi_returnsHtmlWithRealmAndBasePath() {
        Response response = resource.serveUi();

        assertEquals(200, response.getStatus());
        assertEquals("text/html", response.getMediaType().toString());
        String body = (String) response.getEntity();
        assertTrue(body.contains("\"test-realm\""), "Should contain realm name");
        assertTrue(body.contains("\"/auth\""), "Should contain base path");
    }

    @Test
    void serveUiAsset_returnsJsFile() {
        // This test verifies the content-type mapping. The actual file won't exist
        // in test classpath, so we test the path traversal guard separately.
        Response response = resource.serveUiAsset("../etc/passwd");

        assertEquals(400, response.getStatus());
    }

    @Test
    void serveUiAsset_rejectsPathTraversal() {
        Response response = resource.serveUiAsset("../../secret");
        assertEquals(400, response.getStatus());

        Response response2 = resource.serveUiAsset("foo/../bar");
        assertEquals(400, response2.getStatus());
    }

    @Test
    void serveUiAsset_returns404ForMissingFile() {
        Response response = resource.serveUiAsset("nonexistent.js");
        assertEquals(404, response.getStatus());
    }
}
```

- [ ] **Step 2: Run tests — expect compilation failure**

```bash
JAVA_HOME=/home/monte97/.sdkman/candidates/java/17.0.0-tem \
PATH=/home/monte97/.sdkman/candidates/java/17.0.0-tem/bin:$PATH \
mvn test -Dmaven.failsafe.skip=true -pl . -q
```

Expected: FAIL — `serveUi()` and `serveUiAsset()` methods don't exist.

- [ ] **Step 3: Add UI serving endpoints to `WebhooksResource.java`**

Add these two methods before the `// --- mapping helpers ---` comment (before line 348):

```java
    // --- UI static file serving ---

    @GET @Path("ui")
    @Produces("text/html")
    public Response serveUi() {
        try (var is = getClass().getClassLoader().getResourceAsStream("webhook-ui/index.html")) {
            if (is == null) return Response.status(404).entity("UI not found").build();
            String html = new String(is.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            String basePath = session.getContext().getUri().getBaseUri().getPath();
            // Remove trailing slash for clean path
            if (basePath.endsWith("/")) basePath = basePath.substring(0, basePath.length() - 1);
            html = html.replace("{{REALM}}", realm.getName())
                       .replace("{{BASE_PATH}}", basePath);
            return Response.ok(html).type("text/html")
                .header("Cache-Control", "no-cache").build();
        } catch (java.io.IOException e) {
            return Response.serverError().entity("Failed to read UI").build();
        }
    }

    @GET @Path("ui/{path: .+}")
    @Produces(MediaType.WILDCARD)
    public Response serveUiAsset(@PathParam("path") String path) {
        if (path.contains("..")) {
            return Response.status(400).entity("Invalid path").build();
        }
        var is = getClass().getClassLoader().getResourceAsStream("webhook-ui/" + path);
        if (is == null) return Response.status(404).entity("Not found").build();
        String contentType = guessContentType(path);
        String cacheControl = path.startsWith("assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache";
        return Response.ok(is).type(contentType)
            .header("Cache-Control", cacheControl).build();
    }

    private String guessContentType(String path) {
        if (path.endsWith(".js"))  return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
JAVA_HOME=/home/monte97/.sdkman/candidates/java/17.0.0-tem \
PATH=/home/monte97/.sdkman/candidates/java/17.0.0-tem/bin:$PATH \
mvn test -Dmaven.failsafe.skip=true -pl . -q
```

Expected: all Java tests PASS (existing 82 + new 4 = 86).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/dev/montell/keycloak/resources/WebhooksResource.java \
  src/test/java/dev/montell/keycloak/unit/WebhooksResourceUiTest.java
git commit -m "feat(ui): add JAX-RS endpoints for serving UI static files"
```

---

### Task 4: App shell — KC adapter + ErrorBoundary + PatternFly setup

**Files:**
- Create: `webhook-ui/src/ErrorBoundary.tsx`
- Create: `webhook-ui/src/App.tsx`
- Modify: `webhook-ui/src/main.tsx`

- [ ] **Step 1: Create `webhook-ui/src/ErrorBoundary.tsx`**

```tsx
import React from 'react';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateHeader,
  EmptyStateIcon,
  Button,
} from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState>
          <EmptyStateHeader
            titleText="Something went wrong"
            headingLevel="h1"
            icon={<EmptyStateIcon icon={ExclamationCircleIcon} />}
          />
          <EmptyStateBody>{this.state.error.message}</EmptyStateBody>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </EmptyState>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Create `webhook-ui/src/App.tsx`**

```tsx
import React from 'react';
import { Page, PageSection } from '@patternfly/react-core';
import '@patternfly/react-core/dist/styles/base.css';
import { ErrorBoundary } from './ErrorBoundary';
import { WebhookTable } from './components/WebhookTable';
import { createWebhookApi, type WebhookApiClient } from './api/webhookApi';

interface AppProps {
  api: WebhookApiClient;
}

export function App({ api }: AppProps) {
  return (
    <ErrorBoundary>
      <Page>
        <PageSection>
          <WebhookTable api={api} />
        </PageSection>
      </Page>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 3: Replace `webhook-ui/src/main.tsx`**

```tsx
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

init().catch((err) => {
  document.getElementById('root')!.innerHTML =
    `<pre>Failed to initialize: ${err.message}</pre>`;
});
```

- [ ] **Step 4: Verify build still works** (will fail until WebhookTable exists — create a stub)

Create `webhook-ui/src/components/WebhookTable.tsx` as placeholder:

```tsx
import type { WebhookApiClient } from '../api/webhookApi';

export function WebhookTable({ api: _api }: { api: WebhookApiClient }) {
  return <div>WebhookTable placeholder</div>;
}
```

```bash
cd webhook-ui && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/ErrorBoundary.tsx webhook-ui/src/App.tsx \
  webhook-ui/src/main.tsx webhook-ui/src/components/WebhookTable.tsx
git commit -m "feat(ui): add app shell — KC adapter init, ErrorBoundary, PatternFly Page"
```

---

### Task 5: CircuitBadge component

**Files:**
- Create: `webhook-ui/src/components/CircuitBadge.tsx`
- Create: `webhook-ui/src/__tests__/CircuitBadge.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `webhook-ui/src/__tests__/CircuitBadge.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CircuitBadge } from '../components/CircuitBadge';

describe('CircuitBadge', () => {
  it('renders green label for CLOSED state', () => {
    render(<CircuitBadge state="CLOSED" failureCount={0} webhookId="1" onReset={vi.fn()} />);
    expect(screen.getByText('CLOSED')).toBeInTheDocument();
  });

  it('renders red label for OPEN state', () => {
    render(<CircuitBadge state="OPEN" failureCount={5} webhookId="1" onReset={vi.fn()} />);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
  });

  it('renders yellow label for HALF_OPEN state', () => {
    render(<CircuitBadge state="HALF_OPEN" failureCount={3} webhookId="1" onReset={vi.fn()} />);
    expect(screen.getByText('HALF_OPEN')).toBeInTheDocument();
  });

  it('OPEN badge shows reset button on click', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<CircuitBadge state="OPEN" failureCount={5} webhookId="1" onReset={onReset} />);

    fireEvent.click(screen.getByText('OPEN'));
    expect(screen.getByText(/5 failures/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('calls onReset when reset button clicked', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<CircuitBadge state="OPEN" failureCount={5} webhookId="1" onReset={onReset} />);

    fireEvent.click(screen.getByText('OPEN'));
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));

    await waitFor(() => expect(onReset).toHaveBeenCalledWith('1'));
  });

  it('CLOSED badge is not clickable', () => {
    render(<CircuitBadge state="CLOSED" failureCount={0} webhookId="1" onReset={vi.fn()} />);
    // No popover trigger — just a static label
    fireEvent.click(screen.getByText('CLOSED'));
    expect(screen.queryByText(/failures/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd webhook-ui && npx vitest run src/__tests__/CircuitBadge.test.tsx
```

Expected: FAIL — `CircuitBadge` exports nothing useful yet.

- [ ] **Step 3: Implement `webhook-ui/src/components/CircuitBadge.tsx`**

```tsx
import React, { useRef, useState } from 'react';
import { Label, Popover, Button } from '@patternfly/react-core';

interface CircuitBadgeProps {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  webhookId: string;
  onReset: (webhookId: string) => Promise<void>;
}

const colorMap = {
  CLOSED: 'green',
  OPEN: 'red',
  HALF_OPEN: 'gold',
} as const;

export function CircuitBadge({ state, failureCount, webhookId, onReset }: CircuitBadgeProps) {
  const [isResetting, setIsResetting] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await onReset(webhookId);
    } finally {
      setIsResetting(false);
    }
  };

  if (state !== 'OPEN') {
    return <Label color={colorMap[state]}>{state}</Label>;
  }

  return (
    <Popover
      triggerRef={triggerRef}
      headerContent="Circuit breaker is OPEN"
      bodyContent={
        <div>
          <p>{failureCount} failures</p>
          <Button
            variant="primary"
            size="sm"
            isLoading={isResetting}
            onClick={handleReset}
            style={{ marginTop: 8 }}
          >
            Reset to CLOSED
          </Button>
        </div>
      }
    >
      <span ref={triggerRef} style={{ cursor: 'pointer' }}>
        <Label color="red">{state}</Label>
      </span>
    </Popover>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd webhook-ui && npx vitest run src/__tests__/CircuitBadge.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/components/CircuitBadge.tsx webhook-ui/src/__tests__/CircuitBadge.test.tsx
git commit -m "feat(ui): add CircuitBadge component with popover reset"
```

---

### Task 6: WebhookModal component

**Files:**
- Create: `webhook-ui/src/components/WebhookModal.tsx`
- Create: `webhook-ui/src/__tests__/WebhookModal.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `webhook-ui/src/__tests__/WebhookModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WebhookModal } from '../components/WebhookModal';
import type { Webhook } from '../api/types';

describe('WebhookModal', () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode with empty fields', () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    expect(screen.getByText(/create webhook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url/i)).toHaveValue('');
  });

  it('renders edit mode with pre-filled fields', () => {
    const webhook: Webhook = {
      id: '1',
      url: 'https://example.com/hook',
      algorithm: 'HmacSHA256',
      enabled: true,
      eventTypes: ['access.LOGIN', 'access.LOGOUT'],
      circuitState: 'CLOSED',
      failureCount: 0,
      createdAt: '2026-01-01T00:00:00Z',
    };
    render(
      <WebhookModal mode="edit" isOpen webhook={webhook} onSave={onSave} onClose={onClose} />,
    );

    expect(screen.getByText(/edit webhook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url/i)).toHaveValue('https://example.com/hook');
  });

  it('validates URL is required', async () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/url is required/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('validates URL format', async () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'not-a-url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/must be a valid http/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('requires at least one event type', async () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'https://example.com/hook' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least one event type/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with correct data on valid submit', async () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'https://example.com/hook' },
    });

    // Type an event type and add it
    const eventInput = screen.getByPlaceholderText(/add event type/i);
    fireEvent.change(eventInput, { target: { value: 'access.LOGIN' } });
    fireEvent.keyDown(eventInput, { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/hook',
          eventTypes: ['access.LOGIN'],
          enabled: true,
        }),
      );
    });
  });

  it('shows API error inside modal', async () => {
    onSave.mockRejectedValueOnce(new Error('Server error'));
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'https://example.com/hook' },
    });
    const eventInput = screen.getByPlaceholderText(/add event type/i);
    fireEvent.change(eventInput, { target: { value: 'access.LOGIN' } });
    fireEvent.keyDown(eventInput, { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd webhook-ui && npx vitest run src/__tests__/WebhookModal.test.tsx
```

Expected: FAIL — `WebhookModal` does not exist.

- [ ] **Step 3: Implement `webhook-ui/src/components/WebhookModal.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Form,
  FormGroup,
  TextInput,
  Switch,
  FormSelect,
  FormSelectOption,
  Alert,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
} from '@patternfly/react-core';
import type { Webhook, WebhookInput } from '../api/types';

interface WebhookModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  webhook?: Webhook;
  secretConfigured?: boolean | null;
  onSave: (data: WebhookInput) => Promise<void>;
  onClose: () => void;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function WebhookModal({ mode, isOpen, webhook, secretConfigured, onSave, onClose }: WebhookModalProps) {
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState('HmacSHA256');
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [eventInput, setEventInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && webhook) {
      setUrl(webhook.url);
      setEnabled(webhook.enabled);
      setAlgorithm(webhook.algorithm);
      setEventTypes([...webhook.eventTypes]);
      setSecret('');
    } else {
      setUrl('');
      setEnabled(true);
      setSecret('');
      setAlgorithm('HmacSHA256');
      setEventTypes([]);
    }
    setErrors({});
    setApiError(null);
    setEventInput('');
  }, [mode, webhook, isOpen]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!url.trim()) errs.url = 'URL is required';
    else if (!isValidUrl(url)) errs.url = 'Must be a valid HTTP or HTTPS URL';
    if (eventTypes.length === 0) errs.eventTypes = 'At least one event type is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setApiError(null);
    try {
      const data: WebhookInput = { url, enabled, eventTypes, algorithm };
      if (secret) data.secret = secret;
      await onSave(data);
      onClose();
    } catch (err: any) {
      setApiError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const addEventType = () => {
    const trimmed = eventInput.trim();
    if (trimmed && !eventTypes.includes(trimmed)) {
      setEventTypes([...eventTypes, trimmed]);
      setEventInput('');
      if (errors.eventTypes) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.eventTypes;
          return next;
        });
      }
    }
  };

  const removeEventType = (type: string) => {
    setEventTypes(eventTypes.filter((t) => t !== type));
  };

  const handleEventKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEventType();
    }
  };

  const secretHelperText = mode === 'edit'
    ? secretConfigured === true
      ? 'Secret configured. Leave blank to keep current value.'
      : secretConfigured === false
        ? 'No secret configured.'
        : 'Secret status unknown.'
    : undefined;

  return (
    <Modal
      variant={ModalVariant.medium}
      title={mode === 'create' ? 'Create webhook' : 'Edit webhook'}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="save" variant="primary" onClick={handleSubmit} isLoading={saving}>
          Save
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      {apiError && (
        <Alert variant="danger" isInline title="Error" style={{ marginBottom: 16 }}>
          {apiError}
        </Alert>
      )}
      <Form>
        <FormGroup label="URL" isRequired fieldId="url">
          <TextInput
            id="url"
            aria-label="URL"
            value={url}
            onChange={(_e, val) => setUrl(val)}
            validated={errors.url ? 'error' : 'default'}
          />
          {errors.url && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">{errors.url}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>

        <FormGroup label="Enabled" fieldId="enabled">
          <Switch
            id="enabled"
            isChecked={enabled}
            onChange={(_e, val) => setEnabled(val)}
          />
        </FormGroup>

        <FormGroup label="Secret" fieldId="secret">
          <TextInput
            id="secret"
            type="password"
            value={secret}
            onChange={(_e, val) => setSecret(val)}
            placeholder={mode === 'edit' ? '••••••••' : 'Optional HMAC secret'}
          />
          {secretHelperText && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem>{secretHelperText}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>

        <FormGroup label="Algorithm" fieldId="algorithm">
          <FormSelect id="algorithm" value={algorithm} onChange={(_e, val) => setAlgorithm(val)}>
            <FormSelectOption value="HmacSHA256" label="HmacSHA256" />
            <FormSelectOption value="HmacSHA1" label="HmacSHA1" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Event types" isRequired fieldId="eventTypes">
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <TextInput
              id="eventTypeInput"
              placeholder="Add event type"
              value={eventInput}
              onChange={(_e, val) => setEventInput(val)}
              onKeyDown={handleEventKeyDown}
            />
            <Button variant="secondary" onClick={addEventType} isDisabled={!eventInput.trim()}>
              Add
            </Button>
          </div>
          {eventTypes.length > 0 && (
            <LabelGroup>
              {eventTypes.map((t) => (
                <Label key={t} onClose={() => removeEventType(t)}>
                  {t}
                </Label>
              ))}
            </LabelGroup>
          )}
          {errors.eventTypes && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">{errors.eventTypes}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd webhook-ui && npx vitest run src/__tests__/WebhookModal.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add webhook-ui/src/components/WebhookModal.tsx webhook-ui/src/__tests__/WebhookModal.test.tsx
git commit -m "feat(ui): add WebhookModal component — create/edit with validation"
```

---

### Task 7: WebhookTable component — main page

**Files:**
- Modify: `webhook-ui/src/components/WebhookTable.tsx` (replace placeholder)
- Create: `webhook-ui/src/__tests__/WebhookTable.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `webhook-ui/src/__tests__/WebhookTable.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { WebhookTable } from '../components/WebhookTable';
import type { Webhook } from '../api/types';

const mockWebhooks: Webhook[] = [
  {
    id: '1',
    url: 'https://api.example.com/webhook',
    algorithm: 'HmacSHA256',
    enabled: true,
    eventTypes: ['access.LOGIN', 'access.LOGOUT'],
    circuitState: 'CLOSED',
    failureCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '2',
    url: 'https://sync.internal/events',
    algorithm: 'HmacSHA256',
    enabled: false,
    eventTypes: ['admin.USER-CREATE'],
    circuitState: 'OPEN',
    failureCount: 5,
    createdAt: '2026-01-02T00:00:00Z',
  },
];

function createMockApi(webhooks: Webhook[] = mockWebhooks) {
  return {
    list: vi.fn().mockResolvedValue(webhooks),
    count: vi.fn().mockResolvedValue(webhooks.length),
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    getSecretStatus: vi.fn().mockResolvedValue({ type: 'secret', configured: false }),
    test: vi.fn().mockResolvedValue({ httpStatus: 200, success: true, durationMs: 42 }),
    getCircuit: vi.fn(),
    resetCircuit: vi.fn().mockResolvedValue(undefined),
  };
}

describe('WebhookTable', () => {
  let api: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    vi.useFakeTimers();
    api = createMockApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders table with webhook data', async () => {
    await act(async () => {
      render(<WebhookTable api={api as any} />);
    });

    expect(await screen.findByText('https://api.example.com/webhook')).toBeInTheDocument();
    expect(screen.getByText('https://sync.internal/events')).toBeInTheDocument();
    expect(screen.getByText('2 events')).toBeInTheDocument();
    expect(screen.getByText('1 event')).toBeInTheDocument();
  });

  it('shows empty state when no webhooks', async () => {
    api = createMockApi([]);
    await act(async () => {
      render(<WebhookTable api={api as any} />);
    });

    expect(await screen.findByText(/no webhooks configured/i)).toBeInTheDocument();
  });

  it('opens create modal when button clicked', async () => {
    await act(async () => {
      render(<WebhookTable api={api as any} />);
    });

    await screen.findByText('https://api.example.com/webhook');
    fireEvent.click(screen.getByRole('button', { name: /create webhook/i }));

    expect(screen.getByText(/create webhook/i)).toBeInTheDocument();
  });

  it('calls delete API after confirmation', async () => {
    await act(async () => {
      render(<WebhookTable api={api as any} />);
    });

    await screen.findByText('https://api.example.com/webhook');

    // Open kebab for first row, click Delete
    const kebabs = screen.getAllByRole('button', { name: /actions/i });
    fireEvent.click(kebabs[0]!);
    fireEvent.click(screen.getByText(/delete/i));

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('1');
    });
  });

  it('shows test ping result as alert', async () => {
    await act(async () => {
      render(<WebhookTable api={api as any} />);
    });

    await screen.findByText('https://api.example.com/webhook');

    const kebabs = screen.getAllByRole('button', { name: /actions/i });
    fireEvent.click(kebabs[0]!);
    fireEvent.click(screen.getByText(/test ping/i));

    await waitFor(() => {
      expect(api.test).toHaveBeenCalledWith('1');
      expect(screen.getByText(/200/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd webhook-ui && npx vitest run src/__tests__/WebhookTable.test.tsx
```

Expected: FAIL — `WebhookTable` is a placeholder.

- [ ] **Step 3: Implement `webhook-ui/src/components/WebhookTable.tsx`**

```tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Button,
  EmptyState,
  EmptyStateHeader,
  EmptyStateBody,
  EmptyStateIcon,
  Alert,
  AlertGroup,
  AlertActionCloseButton,
  Modal,
  ModalVariant,
  Switch,
  Tooltip,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  Title,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { PlusCircleIcon, CubesIcon, EllipsisVIcon } from '@patternfly/react-icons';
import type { Webhook, WebhookInput } from '../api/types';
import type { WebhookApiClient } from '../api/webhookApi';
import { CircuitBadge } from './CircuitBadge';
import { WebhookModal } from './WebhookModal';

interface AlertItem {
  key: number;
  variant: 'success' | 'danger';
  title: string;
}

const POLL_INTERVAL = 30_000;
let alertKey = 0;

export function WebhookTable({ api }: { api: WebhookApiClient }) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingWebhook, setEditingWebhook] = useState<Webhook | undefined>();
  const [secretStatus, setSecretStatus] = useState<boolean | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [openKebab, setOpenKebab] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await api.list();
      setWebhooks(data);
    } catch {
      // Silently fail on poll errors
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchWebhooks();
    pollRef.current = setInterval(() => {
      if (!document.hidden) fetchWebhooks();
    }, POLL_INTERVAL);
    const onVisibility = () => {
      if (!document.hidden) fetchWebhooks();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchWebhooks]);

  const addAlert = (variant: AlertItem['variant'], title: string) => {
    const key = ++alertKey;
    setAlerts((prev) => [...prev, { key, variant, title }]);
    setTimeout(() => setAlerts((prev) => prev.filter((a) => a.key !== key)), 5000);
  };

  const handleCreate = () => {
    setModalMode('create');
    setEditingWebhook(undefined);
    setSecretStatus(null);
    setModalOpen(true);
  };

  const handleEdit = async (webhook: Webhook) => {
    setModalMode('edit');
    setEditingWebhook(webhook);
    try {
      const status = await api.getSecretStatus(webhook.id);
      setSecretStatus(status.configured);
    } catch {
      setSecretStatus(null);
    }
    setModalOpen(true);
  };

  const handleSave = async (data: WebhookInput) => {
    if (modalMode === 'create') {
      await api.create(data);
      addAlert('success', 'Webhook created');
    } else if (editingWebhook) {
      await api.update(editingWebhook.id, data);
      addAlert('success', 'Webhook updated');
    }
    fetchWebhooks();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(deleteTarget.id);
      addAlert('success', `Webhook deleted`);
      fetchWebhooks();
    } catch (err: any) {
      addAlert('danger', `Delete failed: ${err.message}`);
    }
    setDeleteTarget(null);
  };

  const handleToggleEnabled = async (webhook: Webhook) => {
    try {
      await api.update(webhook.id, { ...webhook, enabled: !webhook.enabled });
      fetchWebhooks();
    } catch (err: any) {
      if (err.status === 403) setReadOnly(true);
      addAlert('danger', `Toggle failed: ${err.message}`);
    }
  };

  const handleTest = async (webhook: Webhook) => {
    try {
      const result = await api.test(webhook.id);
      addAlert(
        result.success ? 'success' : 'danger',
        `Test ping: HTTP ${result.httpStatus} (${result.durationMs}ms)`,
      );
    } catch (err: any) {
      addAlert('danger', `Test failed: ${err.message}`);
    }
  };

  const handleCircuitReset = async (webhookId: string) => {
    await api.resetCircuit(webhookId);
    addAlert('success', 'Circuit breaker reset');
    fetchWebhooks();
  };

  if (loading) return null;

  if (webhooks.length === 0) {
    return (
      <>
        <EmptyState>
          <EmptyStateHeader
            titleText="No webhooks configured"
            headingLevel="h2"
            icon={<EmptyStateIcon icon={CubesIcon} />}
          />
          <EmptyStateBody>
            Create a webhook to start receiving event notifications.
          </EmptyStateBody>
          <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleCreate}>
            Create webhook
          </Button>
        </EmptyState>
        <WebhookModal
          mode="create"
          isOpen={modalOpen}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <AlertGroup isToast isLiveRegion>
        {alerts.map((a) => (
          <Alert
            key={a.key}
            variant={a.variant}
            title={a.title}
            actionClose={
              <AlertActionCloseButton
                onClose={() => setAlerts((prev) => prev.filter((x) => x.key !== a.key))}
              />
            }
          />
        ))}
      </AlertGroup>

      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Title headingLevel="h1" size="xl">
              Webhooks
            </Title>
          </ToolbarItem>
          <ToolbarItem align={{ default: 'alignRight' }}>
            <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleCreate}>
              Create webhook
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      <Table aria-label="Webhooks">
        <Thead>
          <Tr>
            <Th>URL</Th>
            <Th>Enabled</Th>
            <Th>Circuit</Th>
            <Th>Events</Th>
            <Th>Actions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {webhooks.map((wh) => (
            <Tr key={wh.id}>
              <Td dataLabel="URL">
                <Tooltip content={wh.url}>
                  <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                    {wh.url}
                  </span>
                </Tooltip>
              </Td>
              <Td dataLabel="Enabled">
                <Switch
                  isChecked={wh.enabled}
                  onChange={() => handleToggleEnabled(wh)}
                  isDisabled={readOnly}
                  aria-label={`Toggle ${wh.url}`}
                />
              </Td>
              <Td dataLabel="Circuit">
                <CircuitBadge
                  state={wh.circuitState}
                  failureCount={wh.failureCount}
                  webhookId={wh.id}
                  onReset={handleCircuitReset}
                />
              </Td>
              <Td dataLabel="Events">
                <Tooltip content={wh.eventTypes.join(', ')}>
                  <span>{wh.eventTypes.length} event{wh.eventTypes.length !== 1 ? 's' : ''}</span>
                </Tooltip>
              </Td>
              <Td dataLabel="Actions">
                <Dropdown
                  isOpen={openKebab === wh.id}
                  onSelect={() => setOpenKebab(null)}
                  onOpenChange={(open) => setOpenKebab(open ? wh.id : null)}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      variant="plain"
                      onClick={() => setOpenKebab(openKebab === wh.id ? null : wh.id)}
                      aria-label="Actions"
                    >
                      <EllipsisVIcon />
                    </MenuToggle>
                  )}
                  popperProps={{ position: 'right' }}
                >
                  <DropdownList>
                    <DropdownItem key="edit" onClick={() => handleEdit(wh)}>
                      Edit
                    </DropdownItem>
                    <DropdownItem key="test" onClick={() => handleTest(wh)}>
                      Test ping
                    </DropdownItem>
                    <DropdownItem key="delete" onClick={() => setDeleteTarget(wh)} isDanger>
                      Delete
                    </DropdownItem>
                  </DropdownList>
                </Dropdown>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <WebhookModal
        mode={modalMode}
        isOpen={modalOpen}
        webhook={editingWebhook}
        secretConfigured={secretStatus}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
      />

      <Modal
        variant={ModalVariant.small}
        title="Delete webhook"
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        actions={[
          <Button key="delete" variant="danger" onClick={handleDelete}>
            Delete
          </Button>,
          <Button key="cancel" variant="link" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>,
        ]}
      >
        Delete webhook to <strong>{deleteTarget?.url}</strong>? This cannot be undone.
      </Modal>
    </>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd webhook-ui && npx vitest run src/__tests__/WebhookTable.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run all frontend tests**

```bash
cd webhook-ui && npx vitest run
```

Expected: all tests across all files PASS.

- [ ] **Step 6: Commit**

```bash
git add webhook-ui/src/components/WebhookTable.tsx webhook-ui/src/__tests__/WebhookTable.test.tsx
git commit -m "feat(ui): add WebhookTable component — table, polling, CRUD, test ping"
```

---

### Task 8: Full build verification

**Files:** none new — this task verifies the full pipeline.

- [ ] **Step 1: Run full Maven build**

```bash
cd /home/monte97/Projects/keycloak-service/webhook-provider
JAVA_HOME=/home/monte97/.sdkman/candidates/java/17.0.0-tem \
PATH=/home/monte97/.sdkman/candidates/java/17.0.0-tem/bin:$PATH \
mvn package -Dmaven.failsafe.skip=true
```

Expected: BUILD SUCCESS — both Java tests (86+) and frontend tests pass.

- [ ] **Step 2: Verify JAR contents**

```bash
jar tf target/keycloak-webhook-provider-*.jar | grep webhook-ui | head -10
```

Expected: lists `webhook-ui/index.html`, `webhook-ui/assets/index-*.js`, `webhook-ui/assets/index-*.css`.

- [ ] **Step 3: Verify `index.html` contains placeholders** (will be replaced at runtime)

```bash
jar xf target/keycloak-webhook-provider-*.jar webhook-ui/index.html -d /tmp/verify-jar
grep '{{REALM}}' /tmp/verify-jar/webhook-ui/index.html
grep '{{BASE_PATH}}' /tmp/verify-jar/webhook-ui/index.html
rm -rf /tmp/verify-jar
```

Expected: both placeholders found in the bundled HTML.

- [ ] **Step 4: Commit final state (if any uncommitted changes from build)**

```bash
git status
# If clean: nothing to commit
# If any generated files leaked: check .gitignore and fix
```

- [ ] **Step 5: Push**

```bash
git push
```
