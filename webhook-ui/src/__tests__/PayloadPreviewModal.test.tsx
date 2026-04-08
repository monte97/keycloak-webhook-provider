import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PayloadPreviewModal } from '../components/PayloadPreviewModal';

describe('PayloadPreviewModal', () => {
  it('renders pretty-printed JSON when eventObject is provided', () => {
    render(
      <PayloadPreviewModal
        isOpen
        eventObject='{"type":"access.LOGIN","realmId":"demo"}'
        errorMessage={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Event payload')).toBeInTheDocument();
    expect(screen.getByText(/"type": "access\.LOGIN"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeInTheDocument();
  });

  it('renders error message when errorMessage is provided', () => {
    render(
      <PayloadPreviewModal
        isOpen
        eventObject={null}
        errorMessage="Event not found (may have been removed by retention)"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Event payload')).toBeInTheDocument();
    expect(
      screen.getByText('Event not found (may have been removed by retention)'),
    ).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <PayloadPreviewModal
        isOpen={false}
        eventObject='{"x":1}'
        errorMessage={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('Event payload')).not.toBeInTheDocument();
  });
});
