import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '../components/SettingsPage';
import type { AppSettings } from '../lib/useSettings';

const defaultSettings: AppSettings = { metricsRefreshInterval: 10_000 };

describe('SettingsPage', () => {
  it('renders 4 radio options', () => {
    render(<SettingsPage settings={defaultSettings} onUpdate={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '5 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '10 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '60 secondi' })).toBeInTheDocument();
  });

  it('checks the radio matching current settings', () => {
    render(<SettingsPage settings={{ metricsRefreshInterval: 30_000 }} onUpdate={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '30 secondi' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '10 secondi' })).not.toBeChecked();
  });

  it('calls onUpdate with the new interval when a radio is clicked', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('radio', { name: '60 secondi' }));
    expect(onUpdate).toHaveBeenCalledWith({ metricsRefreshInterval: 60_000 });
  });
});
