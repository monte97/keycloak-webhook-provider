import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CircuitBadge } from '../components/CircuitBadge';

describe('CircuitBadge', () => {
  it('renders green label for CLOSED state', () => {
    render(<CircuitBadge state="CLOSED" failureCount={0} webhookId="1" onReset={vi.fn()} />);
    expect(screen.getByText('CLOSED')).toBeInTheDocument();
  });

  it('renders red label for OPEN state', () => {
    render(<CircuitBadge state="OPEN" failureCount={5} webhookId="1" onReset={vi.fn()} />);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
  });

  it('renders gold label for HALF_OPEN state', () => {
    render(<CircuitBadge state="HALF_OPEN" failureCount={3} webhookId="1" onReset={vi.fn()} />);
    expect(screen.getByText('HALF_OPEN')).toBeInTheDocument();
  });

  it('OPEN badge shows reset button on click', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<CircuitBadge state="OPEN" failureCount={5} webhookId="1" onReset={onReset} />);

    await act(async () => {
      fireEvent.click(screen.getByText('OPEN'));
    });
    expect(screen.getByText(/5 failures/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('calls onReset when reset button clicked', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<CircuitBadge state="OPEN" failureCount={5} webhookId="1" onReset={onReset} />);

    await act(async () => {
      fireEvent.click(screen.getByText('OPEN'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    });

    await waitFor(() => expect(onReset).toHaveBeenCalledWith('1'));
  });

  it('CLOSED badge is not clickable', () => {
    render(<CircuitBadge state="CLOSED" failureCount={0} webhookId="1" onReset={vi.fn()} />);
    // No popover trigger — just a static label
    fireEvent.click(screen.getByText('CLOSED'));
    expect(screen.queryByText(/failures/i)).not.toBeInTheDocument();
  });
});
