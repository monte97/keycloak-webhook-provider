import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SecretDisclosureModal } from '../components/SecretDisclosureModal';

describe('SecretDisclosureModal', () => {
  it('shows the new secret, disables Done until ack checkbox is ticked', () => {
    const onClose = vi.fn();
    render(
      <SecretDisclosureModal
        isOpen
        newSecret="super-secret-value-123"
        onClose={onClose}
      />,
    );

    expect(screen.getByText('super-secret-value-123')).toBeInTheDocument();

    const doneBtn = screen.getByRole('button', { name: /done/i });
    expect(doneBtn).toBeDisabled();

    const checkbox = screen.getByLabelText(/copied the secret/i);
    fireEvent.click(checkbox);

    expect(doneBtn).toBeEnabled();

    fireEvent.click(doneBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
