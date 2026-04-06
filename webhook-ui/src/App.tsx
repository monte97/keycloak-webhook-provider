import { useState } from 'react';
import { Page, PageSection, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import '@patternfly/react-core/dist/styles/base.css';
import { ErrorBoundary } from './ErrorBoundary';
import { WebhookTable } from './components/WebhookTable';
import { MetricsPage } from './components/MetricsPage';
import { type WebhookApiClient } from './api/webhookApi';

interface AppProps {
  api: WebhookApiClient;
}

export function App({ api }: AppProps) {
  const [activeTab, setActiveTab] = useState<string | number>('webhooks');

  return (
    <ErrorBoundary>
      <Page>
        <PageSection variant="light" type="tabs">
          <Tabs
            activeKey={activeTab}
            onSelect={(_event, key) => setActiveTab(key)}
            aria-label="Main navigation"
          >
            <Tab eventKey="webhooks" title={<TabTitleText>Webhooks</TabTitleText>} />
            <Tab eventKey="metrics" title={<TabTitleText>Metriche</TabTitleText>} />
          </Tabs>
        </PageSection>
        <PageSection>
          {activeTab === 'webhooks' && <WebhookTable api={api} />}
          {activeTab === 'metrics' && <MetricsPage api={api} />}
        </PageSection>
      </Page>
    </ErrorBoundary>
  );
}
