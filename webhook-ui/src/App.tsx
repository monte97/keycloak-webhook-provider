import { Page, PageSection } from '@patternfly/react-core';
import '@patternfly/react-core/dist/styles/base.css';
import { ErrorBoundary } from './ErrorBoundary';
import { WebhookTable } from './components/WebhookTable';
import { type WebhookApiClient } from './api/webhookApi';

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
