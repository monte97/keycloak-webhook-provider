import { useState, useEffect } from 'react';
import {
  DrawerPanelContent,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
  Button,
  Spinner,
  Alert,
  Label,
  Title,
  DrawerContext,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import type { Webhook, WebhookSend, CircuitState } from '../api/types';
import type { WebhookApiClient } from '../api/webhookApi';

interface DeliveryDrawerProps {
  webhook: Webhook | null;
  api: WebhookApiClient;
  onClose: () => void;
  onCircuitReset: (id: string) => void;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function DeliveryDrawer({
  webhook,
  api,
  onClose,
  onCircuitReset,
}: DeliveryDrawerProps) {
  const [sends, setSends] = useState<WebhookSend[]>([]);
  const [circuit, setCircuit] = useState<CircuitState | null>(null);
  const [loadingSends, setLoadingSends] = useState(false);
  const [loadingCircuit, setLoadingCircuit] = useState(false);
  const [sendsError, setSendsError] = useState<string | null>(null);
  const [circuitError, setCircuitError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'failed'>('all');
  const [resending, setResending] = useState(false);
  const [resettingCircuit, setResettingCircuit] = useState(false);

  useEffect(() => {
    if (!webhook) return;
    setFilter('all');
    loadSends(webhook.id, 'all');
    loadCircuit(webhook.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook?.id]);

  const loadSends = async (id: string, f: 'all' | 'failed') => {
    setLoadingSends(true);
    setSendsError(null);
    try {
      const params =
        f === 'failed' ? { max: 50, success: false as const } : { max: 50 };
      setSends(await api.getSends(id, params));
    } catch (e) {
      setSendsError(
        e instanceof Error ? e.message : 'Failed to load delivery history',
      );
    } finally {
      setLoadingSends(false);
    }
  };

  const loadCircuit = async (id: string) => {
    setLoadingCircuit(true);
    setCircuitError(null);
    try {
      setCircuit(await api.getCircuit(id));
    } catch (e) {
      setCircuitError(
        e instanceof Error ? e.message : 'Failed to load circuit state',
      );
    } finally {
      setLoadingCircuit(false);
    }
  };

  const handleFilterAll = () => {
    setFilter('all');
    if (webhook) loadSends(webhook.id, 'all');
  };

  const handleFilterFailed = () => {
    setFilter('failed');
    if (webhook) loadSends(webhook.id, 'failed');
  };

  const handleResendFailed = async () => {
    if (!webhook) return;
    setResending(true);
    try {
      await api.resendFailed(webhook.id, 24);
      await loadSends(webhook.id, filter);
    } catch (e) {
      setSendsError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResending(false);
    }
  };

  const handleResetCircuit = async () => {
    if (!webhook) return;
    setResettingCircuit(true);
    try {
      await api.resetCircuit(webhook.id);
      await loadCircuit(webhook.id);
      onCircuitReset(webhook.id);
    } catch (e) {
      setCircuitError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setResettingCircuit(false);
    }
  };

  if (!webhook) return null;

  return (
    <DrawerContext.Provider value={{ isExpanded: true, isStatic: false, isInline: false }}>
    <DrawerPanelContent minSize="420px">
      <DrawerHead>
        <Title
          headingLevel="h2"
          size="md"
          style={{ wordBreak: 'break-all' }}
        >
          {webhook.url}
        </Title>
        <DrawerActions>
          <DrawerCloseButton onClick={onClose} />
        </DrawerActions>
      </DrawerHead>

      <div style={{ padding: '0 24px 24px' }}>
        {/* Circuit breaker section */}
        <Title headingLevel="h3" size="sm" style={{ marginBottom: 8 }}>
          Circuit breaker
        </Title>
        {loadingCircuit && (
          <Spinner size="sm" aria-label="Loading circuit state" />
        )}
        {circuitError && (
          <Alert
            variant="danger"
            isInline
            title={circuitError}
            style={{ marginBottom: 8 }}
          />
        )}
        {circuit && !loadingCircuit && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <Label
              color={
                circuit.state === 'CLOSED'
                  ? 'green'
                  : circuit.state === 'OPEN'
                    ? 'red'
                    : 'gold'
              }
            >
              {circuit.state}
            </Label>
            <span>{circuit.failureCount} failures</span>
            {circuit.lastFailureAt && (
              <span>last: {formatRelative(circuit.lastFailureAt)}</span>
            )}
            {circuit.state !== 'CLOSED' && (
              <Button
                variant="secondary"
                size="sm"
                isLoading={resettingCircuit}
                onClick={handleResetCircuit}
              >
                Reset circuit
              </Button>
            )}
          </div>
        )}

        {/* Delivery history section */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Title headingLevel="h3" size="sm">
            Delivery history
          </Title>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex' }}>
              <Button
                variant={filter === 'all' ? 'primary' : 'secondary'}
                size="sm"
                onClick={handleFilterAll}
              >
                All
              </Button>
              <Button
                variant={filter === 'failed' ? 'primary' : 'secondary'}
                size="sm"
                onClick={handleFilterFailed}
              >
                Failed
              </Button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              isLoading={resending}
              onClick={handleResendFailed}
            >
              Resend failed (24h)
            </Button>
          </div>
        </div>

        {loadingSends && <Spinner size="sm" aria-label="Loading sends" />}
        {sendsError && <Alert variant="danger" isInline title={sendsError} />}
        {!loadingSends && !sendsError && (
          <Table aria-label="Delivery history" variant="compact">
            <Thead>
              <Tr>
                <Th>Status</Th>
                <Th>HTTP</Th>
                <Th>Retries</Th>
                <Th>Sent at</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sends.length === 0 ? (
                <Tr>
                  <Td
                    colSpan={4}
                    style={{ textAlign: 'center', color: '#6a6e73' }}
                  >
                    No deliveries found
                  </Td>
                </Tr>
              ) : (
                sends.map((s) => (
                  <Tr key={s.id}>
                    <Td dataLabel="Status">
                      <Label color={s.success ? 'green' : 'red'}>
                        {s.success ? '✓' : '✗'}
                      </Label>
                    </Td>
                    <Td dataLabel="HTTP">{s.httpStatus}</Td>
                    <Td dataLabel="Retries">{s.retries}</Td>
                    <Td dataLabel="Sent at">{formatRelative(s.sentAt)}</Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        )}
      </div>
    </DrawerPanelContent>
    </DrawerContext.Provider>
  );
}
