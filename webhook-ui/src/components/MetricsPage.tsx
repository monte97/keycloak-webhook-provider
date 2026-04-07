import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button,
  Switch,
  Spinner,
  Alert,
  Card,
  CardBody,
  CardTitle,
  ExpandableSection,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Title,
  Grid,
  GridItem,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import type { WebhookApiClient } from '../api/webhookApi';
import { parseMetrics, type ParsedMetrics } from '../lib/parseMetrics';

const REFRESH_INTERVAL = 10_000;

export function MetricsPage({ api }: { api: WebhookApiClient }) {
  const [metrics, setMetrics] = useState<ParsedMetrics | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchMetrics = useCallback(async () => {
    try {
      const raw = await api.getMetrics();
      setRawText(raw);
      setMetrics(parseMetrics(raw));
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchMetrics, REFRESH_INTERVAL);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, fetchMetrics]);

  const fmt = (val: number | null): string => (val !== null ? String(val) : '—');

  if (loading) {
    return <Spinner aria-label="Loading metrics" />;
  }

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Title headingLevel="h1" size="xl">
              Metriche
            </Title>
          </ToolbarItem>
          <ToolbarItem align={{ default: 'alignRight' }}>
            <Switch
              id="auto-refresh-toggle"
              label="Auto-refresh"
              isChecked={autoRefresh}
              onChange={(_event, checked) => setAutoRefresh(checked)}
              aria-label="Auto-refresh"
            />
          </ToolbarItem>
          <ToolbarItem>
            <Button variant="secondary" icon={<SyncAltIcon />} onClick={fetchMetrics}>
              Aggiorna
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {error && <Alert variant="danger" title={error} isInline style={{ marginBottom: 16 }} />}

      <Grid hasGutter>
        <GridItem span={6}>
          <Card isCompact>
            <CardTitle>Dispatches</CardTitle>
            <CardBody>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(metrics?.dispatches ?? null)}</div>
              <div
                style={{
                  color:
                    metrics?.successRate !== null && metrics?.successRate !== undefined
                      ? 'var(--pf-v5-global--success-color--100)'
                      : undefined,
                }}
              >
                {metrics?.successRate !== null && metrics?.successRate !== undefined
                  ? `${metrics.successRate.toFixed(1)}% success`
                  : '—'}
              </div>
            </CardBody>
          </Card>
        </GridItem>
        <GridItem span={6}>
          <Card isCompact>
            <CardTitle>Events received</CardTitle>
            <CardBody>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {fmt(metrics?.eventsReceived ?? null)}
              </div>
              <div>across all types</div>
            </CardBody>
          </Card>
        </GridItem>
        <GridItem span={6}>
          <Card isCompact>
            <CardTitle>Retries</CardTitle>
            <CardBody>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(metrics?.retries ?? null)}</div>
              <div
                style={{
                  color:
                    metrics?.exhausted !== null &&
                    metrics?.exhausted !== undefined &&
                    metrics.exhausted > 0
                      ? 'var(--pf-v5-global--warning-color--100)'
                      : 'var(--pf-v5-global--success-color--100)',
                }}
              >
                {metrics?.exhausted !== null && metrics?.exhausted !== undefined
                  ? `${metrics.exhausted} exhausted`
                  : '—'}
              </div>
            </CardBody>
          </Card>
        </GridItem>
        <GridItem span={6}>
          <Card isCompact>
            <CardTitle>Queue pending</CardTitle>
            <CardBody>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {fmt(metrics?.queuePending ?? null)}
              </div>
              <div
                style={{
                  color:
                    metrics?.queuePending != null && metrics.queuePending > 0
                      ? 'var(--pf-v5-global--warning-color--100)'
                      : 'var(--pf-v5-global--success-color--100)',
                }}
              >
                {metrics?.queuePending == null
                  ? '—'
                  : metrics.queuePending > 0
                  ? `${metrics.queuePending} pending`
                  : 'idle'}
              </div>
            </CardBody>
          </Card>
        </GridItem>
      </Grid>

      <ExpandableSection toggleText="Raw Prometheus" style={{ marginTop: 16 }}>
        <pre
          style={{
            background: '#f5f5f5',
            border: '1px solid #e8e8e8',
            borderRadius: 4,
            padding: 12,
            fontSize: 12,
            overflow: 'auto',
            maxHeight: 400,
          }}
        >
          {rawText || 'No data'}
        </pre>
      </ExpandableSection>
    </>
  );
}
