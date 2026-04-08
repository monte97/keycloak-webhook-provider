import { useState, useEffect, useRef } from 'react';
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
  Modal,
  ModalVariant,
  Checkbox,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import type { Webhook, WebhookSend, CircuitState } from '../api/types';
import type { WebhookApiClient } from '../api/webhookApi';
import { SecretRotationModal } from './SecretRotationModal';
import { SecretDisclosureModal } from './SecretDisclosureModal';

interface DeliveryDrawerProps {
  webhook: Webhook | null;
  api: WebhookApiClient;
  onClose: () => void;
  onCircuitReset: (id: string) => void;
  onWebhookChange?: () => void;
  pageSize: number;
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
  onWebhookChange,
  pageSize,
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
  const [resendingSendId, setResendingSendId] = useState<string | null>(null);
  const [confirmResendId, setConfirmResendId] = useState<string | null>(null);
  const [forceResend, setForceResend] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const prevPageSizeRef = useRef(pageSize);

  const [rotationModalMode, setRotationModalMode] = useState<'graceful' | 'emergency' | null>(null);
  const [disclosedSecret, setDisclosedSecret] = useState<string | null>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);

  const isRotating = !!webhook?.hasSecondarySecret;

  useEffect(() => {
    if (!webhook) return;
    setFilter('all');
    setCurrentPage(1);
    loadSends(webhook.id, 'all', 1);
    loadCircuit(webhook.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook?.id]);

  useEffect(() => {
    if (prevPageSizeRef.current === pageSize) return;
    prevPageSizeRef.current = pageSize;
    if (!webhook) return;
    setCurrentPage(1);
    loadSends(webhook.id, filter, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  const loadSends = async (id: string, f: 'all' | 'failed', page: number) => {
    setLoadingSends(true);
    setSendsError(null);
    try {
      const first = (page - 1) * pageSize;
      const params =
        f === 'failed'
          ? { first, max: pageSize, success: false as const }
          : { first, max: pageSize };
      const result = await api.getSends(id, params);
      setSends(result);
      setHasMore(result.length === pageSize);
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
    setCurrentPage(1);
    if (webhook) loadSends(webhook.id, 'all', 1);
  };

  const handleFilterFailed = () => {
    setFilter('failed');
    setCurrentPage(1);
    if (webhook) loadSends(webhook.id, 'failed', 1);
  };

  const handleResendFailed = async () => {
    if (!webhook) return;
    setResending(true);
    try {
      await api.resendFailed(webhook.id, 24);
      await loadSends(webhook.id, filter, currentPage);
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

  const handleResendSingle = async (sendId: string) => {
    if (!webhook) return;
    if (circuit?.state === 'OPEN') {
      setConfirmResendId(sendId);
      setForceResend(false);
      return;
    }
    setResendingSendId(sendId);
    try {
      await api.resendSingle(webhook.id, sendId, false);
      await loadSends(webhook.id, filter, currentPage);
    } catch (e) {
      setSendsError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResendingSendId(null);
    }
  };

  const handleConfirmResend = async () => {
    if (!webhook || !confirmResendId) return;
    setConfirmResendId(null);
    setResendingSendId(confirmResendId);
    try {
      await api.resendSingle(webhook.id, confirmResendId, forceResend);
      await loadSends(webhook.id, filter, currentPage);
    } catch (e) {
      setSendsError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setResendingSendId(null);
    }
  };

  const handleRotate = async (args: { graceDays?: number }) => {
    if (!webhook) return;
    setRotationError(null);
    try {
      const resp = await api.rotateSecret(webhook.id, {
        mode: rotationModalMode!,
        graceDays: args.graceDays,
      });
      setRotationModalMode(null);
      setDisclosedSecret(resp.newSecret);
      onWebhookChange?.();
    } catch (e) {
      setRotationError(String(e));
    }
  };

  const handleCompleteRotation = async () => {
    if (!webhook) return;
    try {
      await api.completeRotation(webhook.id);
      onWebhookChange?.();
    } catch (e) {
      setRotationError(String(e));
    }
  };

  if (!webhook) return null;

  return (
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
        {/* Secret section */}
        <div style={{ marginBottom: 'var(--pf-v5-global--spacer--md)' }}>
          <strong>Secret</strong>
          <div style={{ marginTop: '8px' }}>
            {!isRotating ? (
              <Label color="green">Active</Label>
            ) : (
              <Label color="orange">Rotating</Label>
            )}
          </div>
          <div style={{ marginTop: '8px', display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              onClick={() => setRotationModalMode('graceful')}
              isDisabled={isRotating}
            >
              Rotate secret
            </Button>
            {isRotating && (
              <Button variant="secondary" onClick={handleCompleteRotation}>
                Complete rotation now
              </Button>
            )}
            <Button variant="danger" onClick={() => setRotationModalMode('emergency')}>
              Emergency rotate
            </Button>
          </div>
          {rotationError && (
            <div style={{ color: 'red', marginTop: '8px' }}>{rotationError}</div>
          )}
        </div>

        {/* Circuit breaker section */}
        <Title headingLevel="h3" size="md" style={{ marginBottom: 8 }}>
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
          <Title headingLevel="h3" size="md">
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
          <>
            <Table aria-label="Delivery history" variant="compact">
              <Thead>
                <Tr>
                  <Th>Status</Th>
                  <Th>HTTP</Th>
                  <Th>Retries</Th>
                  <Th>Sent at</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {sends.length === 0 ? (
                  <Tr>
                    <Td
                      colSpan={5}
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
                      <Td dataLabel="Actions">
                        <Button
                          variant="link"
                          size="sm"
                          isLoading={resendingSendId === s.id}
                          isDisabled={resendingSendId !== null || confirmResendId !== null}
                          onClick={() => handleResendSingle(s.id)}
                        >
                          Resend
                        </Button>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <Button
                variant="secondary"
                isDisabled={currentPage === 1 || loadingSends}
                onClick={() => {
                  const p = currentPage - 1;
                  setCurrentPage(p);
                  loadSends(webhook.id, filter, p);
                }}
              >
                ← Prev
              </Button>
              <span>Pagina {currentPage}</span>
              <Button
                variant="secondary"
                isDisabled={!hasMore || loadingSends}
                onClick={() => {
                  const p = currentPage + 1;
                  setCurrentPage(p);
                  loadSends(webhook.id, filter, p);
                }}
              >
                Next →
              </Button>
            </div>
          </>
        )}
      </div>

      {confirmResendId !== null && (
        <Modal
          variant={ModalVariant.small}
          title="Confirm resend"
          isOpen
          onClose={() => setConfirmResendId(null)}
          actions={[
            <Button key="confirm" variant="primary" onClick={handleConfirmResend}>
              Confirm resend
            </Button>,
            <Button key="cancel" variant="link" onClick={() => setConfirmResendId(null)}>
              Cancel
            </Button>,
          ]}
        >
          <Alert
            variant="warning"
            isInline
            title="The circuit breaker is currently OPEN. The endpoint may still be unreachable."
            style={{ marginBottom: 16 }}
          />
          <Checkbox
            id="force-resend"
            label="Force send anyway"
            isChecked={forceResend}
            onChange={(_event, checked) => setForceResend(checked)}
          />
        </Modal>
      )}

      {rotationModalMode && (
        <SecretRotationModal
          mode={rotationModalMode}
          isOpen
          onConfirm={handleRotate}
          onClose={() => setRotationModalMode(null)}
        />
      )}

      {disclosedSecret && (
        <SecretDisclosureModal
          isOpen
          newSecret={disclosedSecret}
          onClose={() => setDisclosedSecret(null)}
        />
      )}
    </DrawerPanelContent>
  );
}
