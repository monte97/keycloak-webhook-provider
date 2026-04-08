import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SecretRotationModal } from '../components/SecretRotationModal';

describe('SecretRotationModal — graceful', () => {
  it('renders graceDays select with default 7 and calls onConfirm with chosen value', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <SecretRotationModal
        mode="graceful"
        isOpen
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    expect(screen.getByText(/rotate secret/i)).toBeInTheDocument();
    const select = screen.getByLabelText(/grace period/i) as HTMLSelectElement;
    expect(select.value).toBe('7');

    fireEvent.change(select, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /^rotate$/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ graceDays: 30 }));
  });
});

describe('SecretRotationModal — emergency', () => {
  it('disables confirm until user types "rotate" in the confirmation input', async () => {
    const onConfirm = vi.fn();
    render(
      <SecretRotationModal
        mode="emergency"
        isOpen
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: /emergency rotate/i });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByLabelText(/type "rotate" to confirm/i);
    fireEvent.change(input, { target: { value: 'rotat' } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'rotate' } });
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({}));
  });
});
