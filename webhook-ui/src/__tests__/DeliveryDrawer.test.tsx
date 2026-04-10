import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Drawer } from '@patternfly/react-core';
import { DeliveryDrawer } from '../components/DeliveryDrawer';
import type { Webhook, WebhookSend, CircuitState, WebhookEvent } from '../api/types';
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
    getSendPayload: vi.fn().mockResolvedValue({ payload: '{}' }),
    getEvents: vi.fn().mockResolvedValue([]),
    getRealmSettings: vi.fn().mockResolvedValue({
      retentionEventDays: 30,
      retentionSendDays: 90,
      circuitFailureThreshold: 5,
      circuitOpenSeconds: 60,
    }),
    updateRealmSettings: vi.fn().mockResolvedValue({}),
    getMetrics: vi.fn().mockResolvedValue(''),
    rotateSecret: vi.fn().mockResolvedValue({ newSecret: 'abc123', rotationExpiresAt: null, mode: 'graceful' }),
    completeRotation: vi.fn().mockResolvedValue(undefined),
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
          pageSize={50}
        />
      </Drawer>,
    );

    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText('503')).toBeInTheDocument();
    });
    expect(api.getSends).toHaveBeenCalledWith('w1', { first: 0, max: 50 });
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
          pageSize={50}
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
          pageSize={50}
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
          pageSize={50}
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
          pageSize={50}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    fireEvent.click(screen.getByRole('button', { name: /^failed$/i }));

    await waitFor(() => {
      expect(api.getSends).toHaveBeenCalledWith('w1', { first: 0, max: 50, success: false });
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
          pageSize={50}
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
          pageSize={50}
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
          pageSize={50}
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
          pageSize={50}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    const resendButtons = screen.getAllByRole('button', { name: /^resend$/i });
    expect(resendButtons).toHaveLength(2); // one per row

    fireEvent.click(resendButtons[0]!);

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
          pageSize={50}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    const resendButtons = screen.getAllByRole('button', { name: /^resend$/i });
    fireEvent.click(resendButtons[0]!);

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
          pageSize={50}
        />
      </Drawer>,
    );

    await waitFor(() => screen.getByText('200'));
    const resendButtons = screen.getAllByRole('button', { name: /^resend$/i });
    fireEvent.click(resendButtons[0]!);

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
          pageSize={50}
        />
      </Drawer>,
    );
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  describe('pagination', () => {
    it('initial load calls getSends with first=0, max=pageSize', async () => {
      const api = makeApi();
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={10} />
        </Drawer>,
      );
      await waitFor(() => {
        expect(api.getSends).toHaveBeenCalledWith('w1', { first: 0, max: 10 });
      });
    });

    it('full page response enables Next button', async () => {
      const tenSends = Array.from({ length: 10 }, (_, i) => ({ ...successSend, id: `s${i}` }));
      const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={10} />
        </Drawer>,
      );
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
      });
    });

    it('partial page response disables Next button', async () => {
      const api = makeApi({ getSends: vi.fn().mockResolvedValue([successSend]) });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={10} />
        </Drawer>,
      );
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
      });
    });

    it('Prev is disabled on page 1', async () => {
      const api = makeApi();
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={10} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('Pagina 1'));
      expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    });

    it('clicking Next calls getSends with first=pageSize and shows page 2', async () => {
      const tenSends = Array.from({ length: 10 }, (_, i) => ({ ...successSend, id: `s${i}` }));
      const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={10} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('Pagina 1'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => {
        expect(api.getSends).toHaveBeenCalledWith('w1', { first: 10, max: 10 });
        expect(screen.getByText('Pagina 2')).toBeInTheDocument();
      });
    });

    it('clicking Prev from page 2 calls getSends with first=0 and shows page 1', async () => {
      const tenSends = Array.from({ length: 10 }, (_, i) => ({ ...successSend, id: `s${i}` }));
      const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={10} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('Pagina 1'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => screen.getByText('Pagina 2'));
      fireEvent.click(screen.getByRole('button', { name: /prev/i }));
      await waitFor(() => {
        expect(api.getSends).toHaveBeenLastCalledWith('w1', { first: 0, max: 10 });
        expect(screen.getByText('Pagina 1')).toBeInTheDocument();
      });
    });

    it('filter change resets page to 1', async () => {
      const tenSends = Array.from({ length: 10 }, (_, i) => ({ ...successSend, id: `s${i}` }));
      const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={10} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('Pagina 1'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => screen.getByText('Pagina 2'));
      fireEvent.click(screen.getByRole('button', { name: /^failed$/i }));
      await waitFor(() => {
        expect(screen.getByText('Pagina 1')).toBeInTheDocument();
      });
    });

    it('pageSize prop change resets to page 1', async () => {
      const tenSends = Array.from({ length: 10 }, (_, i) => ({ ...successSend, id: `s${i}` }));
      const api = makeApi({ getSends: vi.fn().mockResolvedValue(tenSends) });
      const { rerender } = render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={10} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('Pagina 1'));
      fireEvent.click(screen.getByRole('button', { name: /next/i }));
      await waitFor(() => screen.getByText('Pagina 2'));
      rerender(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={25} />
        </Drawer>,
      );
      await waitFor(() => {
        expect(screen.getByText('Pagina 1')).toBeInTheDocument();
      });
    });
  });

  describe('Secret card', () => {
    it('shows Active label and enabled Rotate button when no rotation is in progress', async () => {
      const noRotationWebhook: Webhook = { ...webhook, hasSecondarySecret: false };
      const localApi = makeApi();
      render(
        <Drawer isExpanded>
          <DeliveryDrawer
            webhook={noRotationWebhook}
            api={localApi}
            onClose={vi.fn()}
            onCircuitReset={vi.fn()}
            pageSize={50}
          />
        </Drawer>,
      );

      await waitFor(() => screen.getByText('200'));

      expect(screen.getByText(/^active$/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /rotate secret/i })).not.toBeDisabled();
      expect(screen.queryByRole('button', { name: /complete rotation/i })).not.toBeInTheDocument();
    });

    it('shows Rotating label and disables Rotate button when rotation is in progress', async () => {
      const rotatingWebhook: Webhook = {
        ...webhook,
        hasSecondarySecret: true,
        rotationExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        rotationStartedAt: new Date(Date.now() - 60_000).toISOString(),
      };
      const localApi = makeApi();
      render(
        <Drawer isExpanded>
          <DeliveryDrawer
            webhook={rotatingWebhook}
            api={localApi}
            onClose={vi.fn()}
            onCircuitReset={vi.fn()}
            pageSize={50}
          />
        </Drawer>,
      );

      await waitFor(() => screen.getByText('200'));

      expect(screen.getByText(/^rotating$/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /rotate secret/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /complete rotation/i })).not.toBeDisabled();
    });
  });

  describe('Events tab', () => {
    const mockEvent: WebhookEvent = {
      id: 'ev1',
      realmId: 'demo',
      eventType: 'USER',
      kcEventId: 'kc1',
      eventObject: '{"realmId":"demo","type":"LOGIN"}',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    };

    it('renders Delivery history and Events tabs', async () => {
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /delivery history/i }));
      expect(screen.getByRole('tab', { name: /events/i })).toBeInTheDocument();
    });

    it('getEvents is NOT called on drawer open', async () => {
      const getEvents = vi.fn().mockResolvedValue([]);
      const localApi = makeApi({ getEvents });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /delivery history/i }));
      expect(getEvents).not.toHaveBeenCalled();
    });

    it('clicking Events tab calls getEvents with first=0 and max=pageSize', async () => {
      const getEvents = vi.fn().mockResolvedValue([mockEvent]);
      const localApi = makeApi({ getEvents });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /events/i }));
      fireEvent.click(screen.getByRole('tab', { name: /events/i }));
      await waitFor(() => {
        expect(getEvents).toHaveBeenCalledWith('w1', { first: 0, max: 50 });
      });
    });

    it('renders event rows with eventType and relative time', async () => {
      const localApi = makeApi({ getEvents: vi.fn().mockResolvedValue([mockEvent]) });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /events/i }));
      fireEvent.click(screen.getByRole('tab', { name: /events/i }));
      await waitFor(() => {
        expect(screen.getByText('USER')).toBeInTheDocument();
        expect(screen.getByText(/ago/)).toBeInTheDocument();
      });
    });

    it('clicking Payload on event row opens PayloadPreviewModal', async () => {
      const localApi = makeApi({ getEvents: vi.fn().mockResolvedValue([mockEvent]) });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /events/i }));
      fireEvent.click(screen.getByRole('tab', { name: /events/i }));
      await waitFor(() => screen.getByText('USER'));
      fireEvent.click(screen.getByRole('button', { name: /^payload$/i }));
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /event payload/i })).toBeInTheDocument();
      });
    });

    it('clicking Next in Events tab calls getEvents with correct offset', async () => {
      const fullPage = Array.from({ length: 50 }, (_, i) => ({
        ...mockEvent,
        id: `ev${i}`,
      }));
      const getEvents = vi.fn().mockResolvedValue(fullPage);
      const localApi = makeApi({ getEvents });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /events/i }));
      fireEvent.click(screen.getByRole('tab', { name: /events/i }));
      await waitFor(() => expect(getEvents).toHaveBeenCalledWith('w1', { first: 0, max: 50 }));
      // Click Next
      const nextButtons = screen.getAllByRole('button', { name: /next/i });
      fireEvent.click(nextButtons[nextButtons.length - 1]!);
      await waitFor(() => expect(getEvents).toHaveBeenCalledWith('w1', { first: 50, max: 50 }));
    });

    it('Events Prev button is disabled on page 1', async () => {
      const getEvents = vi.fn().mockResolvedValue([mockEvent]);
      const localApi = makeApi({ getEvents });
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={localApi} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByRole('tab', { name: /events/i }));
      fireEvent.click(screen.getByRole('tab', { name: /events/i }));
      await waitFor(() => screen.getByText('USER'));
      const prevButtons = screen.getAllByRole('button', { name: /prev/i });
      expect(prevButtons[prevButtons.length - 1]).toBeDisabled();
    });
  });

  describe('createdAt and rotation info', () => {
    it('shows "Created" date in drawer header', async () => {
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={webhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('200'));
      expect(screen.getByText(/created/i)).toBeInTheDocument();
    });

    it('shows rotation expiry when rotationExpiresAt is set', async () => {
      const rotatingWebhook: Webhook = {
        ...webhook,
        hasSecondarySecret: true,
        rotationExpiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        rotationStartedAt: new Date(Date.now() - 60_000).toISOString(),
      };
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={rotatingWebhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('200'));
      expect(screen.getByText(/expires/i)).toBeInTheDocument();
    });

    it('does not show rotation expiry when rotationExpiresAt is null', async () => {
      const rotatingWebhook: Webhook = {
        ...webhook,
        hasSecondarySecret: true,
        rotationExpiresAt: null,
        rotationStartedAt: new Date(Date.now() - 60_000).toISOString(),
      };
      render(
        <Drawer isExpanded>
          <DeliveryDrawer webhook={rotatingWebhook} api={api} onClose={vi.fn()} onCircuitReset={vi.fn()} pageSize={50} />
        </Drawer>,
      );
      await waitFor(() => screen.getByText('200'));
      expect(screen.queryByText(/expires/i)).not.toBeInTheDocument();
    });
  });
});
