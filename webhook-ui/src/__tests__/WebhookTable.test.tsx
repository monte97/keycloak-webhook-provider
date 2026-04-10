import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { WebhookTable } from '../components/WebhookTable';
import type { Webhook } from '../api/types';

const mockWebhooks: Webhook[] = [
  {
    id: '1',
    url: 'https://api.example.com/webhook',
    algorithm: 'HmacSHA256',
    enabled: true,
    eventTypes: ['access.LOGIN', 'access.LOGOUT'],
    circuitState: 'CLOSED',
    failureCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '2',
    url: 'https://sync.internal/events',
    algorithm: 'HmacSHA256',
    enabled: false,
    eventTypes: ['admin.USER-CREATE'],
    circuitState: 'OPEN',
    failureCount: 5,
    createdAt: '2026-01-02T00:00:00Z',
  },
];

function createMockApi(webhooks: Webhook[] = mockWebhooks) {
  return {
    list: vi.fn().mockResolvedValue(webhooks),
    count: vi.fn().mockResolvedValue(webhooks.length),
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    getSecretStatus: vi.fn().mockResolvedValue({ type: 'secret', configured: false }),
    test: vi.fn().mockResolvedValue({ httpStatus: 200, success: true, durationMs: 42 }),
    getCircuit: vi.fn(),
    resetCircuit: vi.fn().mockResolvedValue(undefined),
    getSends: vi.fn().mockResolvedValue([]),
    resendFailed: vi.fn().mockResolvedValue({ resent: 0, failed: 0, skipped: 0 }),
    getMetrics: vi.fn().mockResolvedValue(''),
  };
}

describe('WebhookTable', () => {
  let api: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    api = createMockApi();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders table with webhook data', async () => {
    await act(async () => {
      render(<WebhookTable api={api as any} pageSize={50} />);
    });

    expect(await screen.findByText('https://api.example.com/webhook')).toBeInTheDocument();
    expect(screen.getByText('https://sync.internal/events')).toBeInTheDocument();
    expect(screen.getByText('2 events')).toBeInTheDocument();
    expect(screen.getByText('1 event')).toBeInTheDocument();
  });

  it('shows empty state when no webhooks', async () => {
    api = createMockApi([]);
    await act(async () => {
      render(<WebhookTable api={api as any} pageSize={50} />);
    });

    expect(await screen.findByText(/no webhooks configured/i)).toBeInTheDocument();
  });

  it('opens create modal when button clicked', async () => {
    await act(async () => {
      render(<WebhookTable api={api as any} pageSize={50} />);
    });

    await screen.findByText('https://api.example.com/webhook');
    fireEvent.click(screen.getByRole('button', { name: /create webhook/i }));

    // PF5 renders both the button label and modal title — >= 2 means the modal is open
    expect(screen.getAllByText(/create webhook/i).length).toBeGreaterThanOrEqual(2);
  });

  it('calls delete API after confirmation', async () => {
    await act(async () => {
      render(<WebhookTable api={api as any} pageSize={50} />);
    });

    await screen.findByText('https://api.example.com/webhook');

    // Open kebab for first row, click Delete
    const kebabs = screen.getAllByRole('button', { name: /actions/i });
    fireEvent.click(kebabs[0]!);
    fireEvent.click(screen.getByText(/delete/i));

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('1');
    });
  });

  it('shows test ping result as alert', async () => {
    await act(async () => {
      render(<WebhookTable api={api as any} pageSize={50} />);
    });

    await screen.findByText('https://api.example.com/webhook');

    const kebabs = screen.getAllByRole('button', { name: /actions/i });
    fireEvent.click(kebabs[0]!);
    fireEvent.click(screen.getByText(/test ping/i));

    await waitFor(() => {
      expect(api.test).toHaveBeenCalledWith('1');
      expect(screen.getByText(/200/)).toBeInTheDocument();
    });
  });

  describe('pagination', () => {
    it('calls api.list with first=0 and max=20 on initial load', async () => {
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      expect(api.list).toHaveBeenCalledWith(0, 20);
    });

    it('Next button is disabled when result has fewer than 20 items', async () => {
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      await screen.findByText('https://api.example.com/webhook');
      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('Next button is enabled when result has exactly 20 items', async () => {
      const twentyWebhooks = Array.from({ length: 20 }, (_, i) => ({
        ...mockWebhooks[0]!,
        id: String(i),
        url: `https://example.com/hook-${i}`,
      }));
      api = createMockApi(twentyWebhooks);
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      await screen.findByText('https://example.com/hook-0');
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });

    it('Prev button is disabled on page 1', async () => {
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      await screen.findByText('https://api.example.com/webhook');
      expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    });

    it('clicking Next calls api.list with first=20 and max=20', async () => {
      const twentyWebhooks = Array.from({ length: 20 }, (_, i) => ({
        ...mockWebhooks[0]!,
        id: String(i),
        url: `https://example.com/hook-${i}`,
      }));
      api = createMockApi(twentyWebhooks);
      await act(async () => {
        render(<WebhookTable api={api as any} pageSize={50} />);
      });
      await screen.findByText('https://example.com/hook-0');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
      });
      await waitFor(() => {
        expect(api.list).toHaveBeenCalledWith(20, 20);
      });
    });
  });
});
