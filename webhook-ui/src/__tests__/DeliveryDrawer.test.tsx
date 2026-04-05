import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Drawer } from '@patternfly/react-core';
import { DeliveryDrawer } from '../components/DeliveryDrawer';
import type { Webhook, WebhookSend, CircuitState } from '../api/types';
import type { WebhookApiClient } from '../api/webhookApi';

const webhook: Webhook = {
  id: 'w1',
  url: 'https://example.com/hook',
  algorithm: 'HmacSHA256',
  enabled: true,
  eventTypes: ['*'],
  circuitState: 'CLOSED',
  failureCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
};

const successSend: WebhookSend = {
  id: 's1',
  webhookId: 'w1',
  webhookEventId: 'e1',
  eventType: 'USER',
  httpStatus: 200,
  success: true,
  retries: 0,
  sentAt: new Date(Date.now() - 60_000).toISOString(),
  lastAttemptAt: new Date(Date.now() - 60_000).toISOString(),
};

const failedSend: WebhookSend = {
  id: 's2',
  webhookId: 'w1',
  webhookEventId: 'e2',
  eventType: 'USER',
  httpStatus: 503,
  success: false,
  retries: 5,
  sentAt: new Date(Date.now() - 300_000).toISOString(),
  lastAttemptAt: new Date(Date.now() - 60_000).toISOString(),
};

const closedCircuit: CircuitState = {
  state: 'CLOSED',
  failureCount: 0,
  lastFailureAt: null,
  failureThreshold: 5,
  openSeconds: 60,
};

const openCircuit: CircuitState = {
  state: 'OPEN',
  failureCount: 5,
  lastFailureAt: new Date(Date.now() - 30_000).toISOString(),
  failureThreshold: 5,
  openSeconds: 60,
};

function makeApi(overrides: Partial<WebhookApiClient> = {}): WebhookApiClient {
  return {
    list: vi.fn(),
    count: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getSecretStatus: vi.fn(),
    test: vi.fn(),
    getCircuit: vi.fn().mockResolvedValue(closedCircuit),
    resetCircuit: vi.fn().mockResolvedValue(undefined),
    getSends: vi.fn().mockResolvedValue([successSend, failedSend]),
    resendFailed: vi.fn().mockResolvedValue({ resent: 1, failed: 0, skipped: 0 }),
    resendSingle: vi.fn().mockResolvedValue({ httpStatus: 200, success: true, durationMs: 10 }),
    ...overrides,
  } as unknown as WebhookApiClient;
}

describe('DeliveryDrawer', () => {
  let api: WebhookApiClient;
  const onClose = vi.fn();
  const onCircuitReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    api = makeApi();
  });

  it('renders sends table with success and failed rows', async () => {
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText('503')).toBeInTheDocument();
    });
    expect(api.getSends).toHaveBeenCalledWith('w1', { max: 50 });
    expect(api.getCircuit).toHaveBeenCalledWith('w1');
  });

  it('renders circuit state', async () => {
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => {
      expect(screen.getByText('CLOSED')).toBeInTheDocument();
    });
    expect(screen.getByText(/0 failures/i)).toBeInTheDocument();
  });

  it('shows Reset circuit button when circuit is OPEN', async () => {
    api = makeApi({ getCircuit: vi.fn().mockResolvedValue(openCircuit) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset circuit/i })).toBeInTheDocument();
    });
  });

  it('does not show Reset circuit button when circuit is CLOSED', async () => {
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('CLOSED'));
    expect(screen.queryByRole('button', { name: /reset circuit/i })).not.toBeInTheDocument();
  });

  it('Failed filter button calls getSends with success=false', async () => {
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    fireEvent.click(screen.getByRole('button', { name: /^failed$/i }));

    await waitFor(() => {
      expect(api.getSends).toHaveBeenCalledWith('w1', { max: 50, success: false });
    });
  });

  it('Resend failed (24h) button calls resendFailed and reloads sends', async () => {
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    fireEvent.click(screen.getByRole('button', { name: /resend failed/i }));

    await waitFor(() => {
      expect(api.resendFailed).toHaveBeenCalledWith('w1', 24);
    });
    // Reloads sends after resend
    expect(api.getSends).toHaveBeenCalledTimes(2);
  });

  it('Reset circuit button calls resetCircuit and onCircuitReset', async () => {
    api = makeApi({ getCircuit: vi.fn().mockResolvedValue(openCircuit) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByRole('button', { name: /reset circuit/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset circuit/i }));

    await waitFor(() => {
      expect(api.resetCircuit).toHaveBeenCalledWith('w1');
      expect(onCircuitReset).toHaveBeenCalledWith('w1');
    });
  });

  it('shows inline error when getSends rejects', async () => {
    api = makeApi({ getSends: vi.fn().mockRejectedValue(new Error('Network error')) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('per-row Resend button calls resendSingle and reloads sends', async () => {
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    const resendButtons = screen.getAllByRole('button', { name: /^resend$/i });
    expect(resendButtons).toHaveLength(2); // one per row

    fireEvent.click(resendButtons[0]);

    await waitFor(() => {
      expect(api.resendSingle).toHaveBeenCalledWith('w1', 's1', false);
    });
    // Reloads sends after resend
    expect(api.getSends).toHaveBeenCalledTimes(2);
  });

  it('shows confirmation dialog when circuit is OPEN and Resend clicked', async () => {
    api = makeApi({ getCircuit: vi.fn().mockResolvedValue(openCircuit) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    const resendButtons = screen.getAllByRole('button', { name: /^resend$/i });
    fireEvent.click(resendButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/circuit breaker is currently OPEN/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('checkbox', { name: /force send/i })).toBeInTheDocument();
  });

  it('confirmation dialog with force checkbox calls resendSingle with force=true', async () => {
    api = makeApi({ getCircuit: vi.fn().mockResolvedValue(openCircuit) });
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={webhook}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    const resendButtons = screen.getAllByRole('button', { name: /^resend$/i });
    fireEvent.click(resendButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/circuit breaker is currently OPEN/i)).toBeInTheDocument();
    });

    // Check the force checkbox
    fireEvent.click(screen.getByRole('checkbox', { name: /force send/i }));
    // Click the confirm Resend button in the dialog
    fireEvent.click(screen.getByRole('button', { name: /^confirm resend$/i }));

    await waitFor(() => {
      expect(api.resendSingle).toHaveBeenCalledWith('w1', 's1', true);
    });
  });

  it('renders nothing when webhook is null', () => {
    render(
      <Drawer isExpanded>
        <DeliveryDrawer
          webhook={null}
          api={api}
          onClose={onClose}
          onCircuitReset={onCircuitReset}
        />
      </Drawer>,
    );
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
