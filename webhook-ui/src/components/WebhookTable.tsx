import { useState, useEffect, useCallback, useRef } from 'react';
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
  Drawer,
  DrawerContent,
  DrawerContentBody,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { PlusCircleIcon, CubesIcon, EllipsisVIcon } from '@patternfly/react-icons';
import { ApiError } from '../api/types';
import type { Webhook, WebhookInput } from '../api/types';
import type { WebhookApiClient } from '../api/webhookApi';
import type { WebhookDefaults } from '../lib/useSettings';
import { CircuitBadge } from './CircuitBadge';
import { WebhookModal } from './WebhookModal';
import { DeliveryDrawer } from './DeliveryDrawer';

interface AlertItem {
  key: number;
  variant: 'success' | 'danger';
  title: string;
}

const POLL_INTERVAL = 30_000;

export function WebhookTable({ api, defaults, pageSize }: { api: WebhookApiClient; defaults?: WebhookDefaults; pageSize: number }) {
  const alertKeyRef = useRef(0);
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
  const [drawerWebhook, setDrawerWebhook] = useState<Webhook | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await api.list();
      setWebhooks(data);
      setDrawerWebhook((prev) =>
        prev ? (data.find((w) => w.id === prev.id) ?? prev) : null,
      );
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
    const key = ++alertKeyRef.current;
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
    } catch (err: unknown) {
      addAlert('danger', `Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setDeleteTarget(null);
  };

  const handleToggleEnabled = async (webhook: Webhook) => {
    try {
      await api.update(webhook.id, { ...webhook, enabled: !webhook.enabled });
      fetchWebhooks();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) setReadOnly(true);
      addAlert('danger', `Toggle failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleTest = async (webhook: Webhook) => {
    try {
      const result = await api.test(webhook.id);
      addAlert(
        result.success ? 'success' : 'danger',
        `Test ping: HTTP ${result.httpStatus} (${result.durationMs}ms)`,
      );
    } catch (err: unknown) {
      addAlert('danger', `Test failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCircuitReset = async (webhookId: string) => {
    try {
      await api.resetCircuit(webhookId);
      addAlert('success', 'Circuit breaker reset');
      fetchWebhooks();
    } catch (e) {
      addAlert('danger', e instanceof ApiError ? e.message : 'Reset failed');
    }
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
          defaults={defaults}
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

      <Drawer isExpanded={drawerWebhook !== null} position="right">
        <DrawerContent
          panelContent={
            <DeliveryDrawer
              webhook={drawerWebhook}
              api={api}
              onClose={() => setDrawerWebhook(null)}
              onCircuitReset={handleCircuitReset}
              onWebhookChange={fetchWebhooks}
              pageSize={pageSize}
            />
          }
        >
          <DrawerContentBody>
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
                  <Tr
                    key={wh.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDrawerWebhook(wh)}
                  >
                    <Td dataLabel="URL">
                      <Tooltip content={wh.url}>
                        <span
                          style={{
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                          }}
                        >
                          {wh.url}
                        </span>
                      </Tooltip>
                    </Td>
                    <Td dataLabel="Enabled" onClick={(e) => e.stopPropagation()}>
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
                        <span>
                          {wh.eventTypes.length} event
                          {wh.eventTypes.length !== 1 ? 's' : ''}
                        </span>
                      </Tooltip>
                    </Td>
                    <Td dataLabel="Actions" onClick={(e) => e.stopPropagation()}>
                      <Dropdown
                        isOpen={openKebab === wh.id}
                        onSelect={() => setOpenKebab(null)}
                        onOpenChange={(open) => setOpenKebab(open ? wh.id : null)}
                        toggle={(toggleRef) => (
                          <MenuToggle
                            ref={toggleRef}
                            variant="plain"
                            onClick={() =>
                              setOpenKebab(openKebab === wh.id ? null : wh.id)
                            }
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
                          <DropdownItem
                            key="delete"
                            onClick={() => setDeleteTarget(wh)}
                            isDanger
                          >
                            Delete
                          </DropdownItem>
                        </DropdownList>
                      </Dropdown>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DrawerContentBody>
        </DrawerContent>
      </Drawer>

      <WebhookModal
        mode={modalMode}
        isOpen={modalOpen}
        webhook={editingWebhook}
        secretConfigured={secretStatus}
        defaults={modalMode === 'create' ? defaults : undefined}
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
