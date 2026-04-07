import { useState } from 'react';
import { Page, PageSection, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import '@patternfly/react-core/dist/styles/base.css';
import { ErrorBoundary } from './ErrorBoundary';
import { WebhookTable } from './components/WebhookTable';
import { MetricsPage } from './components/MetricsPage';
import { SettingsPage } from './components/SettingsPage';
import { useSettings } from './lib/useSettings';
import { type WebhookApiClient } from './api/webhookApi';

interface AppProps {
  api: WebhookApiClient;
}

export function App({ api }: AppProps) {
  const [activeTab, setActiveTab] = useState<string | number>('webhooks');
  const { settings, updateSettings } = useSettings();

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
            <Tab eventKey="settings" title={<TabTitleText>Impostazioni</TabTitleText>} />
          </Tabs>
        </PageSection>
        <PageSection>
          {activeTab === 'webhooks' && (
            <WebhookTable api={api} defaults={settings.webhookDefaults} pageSize={settings.deliveryHistoryPageSize} />
          )}
          {activeTab === 'metrics' && (
            <MetricsPage api={api} refreshInterval={settings.metricsRefreshInterval} />
          )}
          {activeTab === 'settings' && (
            <SettingsPage settings={settings} onUpdate={updateSettings} />
          )}
        </PageSection>
      </Page>
    </ErrorBoundary>
  );
}
