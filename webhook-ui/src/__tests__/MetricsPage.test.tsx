import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MetricsPage } from '../components/MetricsPage';
import type { WebhookApiClient } from '../api/webhookApi';

const SAMPLE_METRICS = `# HELP webhook_events_received_total Keycloak events received
# TYPE webhook_events_received_total counter
webhook_events_received_total{realm="master",event_type="access.LOGIN"} 1000.0
# HELP webhook_dispatches_total HTTP send attempts completed
# TYPE webhook_dispatches_total counter
webhook_dispatches_total{realm="master",success="true"} 950.0
webhook_dispatches_total{realm="master",success="false"} 50.0
# HELP webhook_retries_total Retries scheduled via exponential backoff
# TYPE webhook_retries_total counter
webhook_retries_total{realm="master"} 43.0
# HELP webhook_retries_exhausted_total Retry chains terminated without success
# TYPE webhook_retries_exhausted_total counter
webhook_retries_exhausted_total{realm="master"} 3.0
# HELP webhook_queue_pending Tasks currently pending in the executor
# TYPE webhook_queue_pending gauge
webhook_queue_pending 0.0
`;

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
    getCircuit: vi.fn(),
    resetCircuit: vi.fn(),
    getSends: vi.fn(),
    resendFailed: vi.fn(),
    resendSingle: vi.fn(),
    getMetrics: vi.fn().mockResolvedValue(SAMPLE_METRICS),
    ...overrides,
  } as unknown as WebhookApiClient;
}

describe('MetricsPage', () => {
  let api: WebhookApiClient;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    api = makeApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows spinner on initial load', () => {
    api = makeApi({ getMetrics: vi.fn().mockReturnValue(new Promise(() => {})) });
    render(<MetricsPage api={api} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows 4 metric cards after fetch resolves', async () => {
    await act(async () => {
      render(<MetricsPage api={api} />);
    });

    await waitFor(() => {
      // dispatches = 950+50 = 1000, eventsReceived = 1000, both cards show 1000
      expect(screen.getAllByText('1000').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('43')).toBeInTheDocument(); // retries
    expect(screen.getByText('0')).toBeInTheDocument(); // queue pending
    expect(screen.getByText(/95\.0% success/)).toBeInTheDocument();
  });

  it('shows error alert on fetch failure', async () => {
    api = makeApi({ getMetrics: vi.fn().mockRejectedValue(new Error('Network error')) });
    await act(async () => {
      render(<MetricsPage api={api} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('Aggiorna button triggers a new fetch', async () => {
    await act(async () => {
      render(<MetricsPage api={api} />);
    });
    await waitFor(() => screen.getAllByText('1000'));

    expect(api.getMetrics).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /aggiorna/i }));

    await waitFor(() => {
      expect(api.getMetrics).toHaveBeenCalledTimes(2);
    });
  });

  it('auto-refresh toggle off cancels the interval', async () => {
    await act(async () => {
      render(<MetricsPage api={api} />);
    });
    await waitFor(() => screen.getAllByText('1000'));

    // Toggle off
    fireEvent.click(screen.getByLabelText(/auto-refresh/i));

    // Advance timer — should NOT trigger another fetch
    const callsBefore = (api.getMetrics as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(api.getMetrics).toHaveBeenCalledTimes(callsBefore);
  });

  it('auto-refresh fires fetch after interval', async () => {
    await act(async () => {
      render(<MetricsPage api={api} />);
    });
    await waitFor(() => screen.getAllByText('1000'));

    expect(api.getMetrics).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    await waitFor(() => {
      expect(api.getMetrics).toHaveBeenCalledTimes(2);
    });
  });

  it('shows dashes for missing metrics', async () => {
    api = makeApi({ getMetrics: vi.fn().mockResolvedValue('') });
    await act(async () => {
      render(<MetricsPage api={api} />);
    });

    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(4);
    });
  });
});
