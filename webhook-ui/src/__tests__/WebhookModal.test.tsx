import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WebhookModal } from '../components/WebhookModal';
import type { Webhook } from '../api/types';

describe('WebhookModal', () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode with empty fields', () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    expect(screen.getByText(/create webhook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url/i)).toHaveValue('');
  });

  it('renders edit mode with pre-filled fields', () => {
    const webhook: Webhook = {
      id: '1',
      url: 'https://example.com/hook',
      algorithm: 'HmacSHA256',
      enabled: true,
      eventTypes: ['access.LOGIN', 'access.LOGOUT'],
      circuitState: 'CLOSED',
      failureCount: 0,
      createdAt: '2026-01-01T00:00:00Z',
    };
    render(
      <WebhookModal mode="edit" isOpen webhook={webhook} onSave={onSave} onClose={onClose} />,
    );

    expect(screen.getByText(/edit webhook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url/i)).toHaveValue('https://example.com/hook');
  });

  it('validates URL is required', async () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/url is required/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('validates URL format', async () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'not-a-url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/must be a valid http/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('requires at least one event type', async () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'https://example.com/hook' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least one event type/i)).toBeInTheDocument();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with correct data on valid submit', async () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'https://example.com/hook' },
    });

    // Open event type dropdown and select an option
    fireEvent.click(screen.getByPlaceholderText(/search event types/i));
    fireEvent.click(screen.getByText('access.LOGIN'));

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/hook',
          eventTypes: ['access.LOGIN'],
          enabled: true,
          algorithm: 'HmacSHA256',
        }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not add duplicate event types', async () => {
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    // Select access.LOGIN
    fireEvent.click(screen.getByPlaceholderText(/search event types/i));
    fireEvent.click(screen.getByText('access.LOGIN'));

    // Open again — access.LOGIN should not appear in the list (already selected)
    fireEvent.click(screen.getByPlaceholderText(/search event types/i));
    const loginOptions = screen.getAllByText('access.LOGIN');
    // Only the label chip should show it, not the dropdown
    expect(loginOptions).toHaveLength(1);
  });

  it('shows API error inside modal', async () => {
    onSave.mockRejectedValueOnce(new Error('Server error'));
    render(<WebhookModal mode="create" isOpen onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/url/i), {
      target: { value: 'https://example.com/hook' },
    });
    fireEvent.click(screen.getByPlaceholderText(/search event types/i));
    fireEvent.click(screen.getByText('access.LOGIN'));

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
  });
});
