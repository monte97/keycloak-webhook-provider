import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '../components/SettingsPage';
import type { AppSettings } from '../lib/useSettings';

const defaultSettings: AppSettings = {
  metricsRefreshInterval: 10_000,
  webhookDefaults: {
    enabled: true,
    retryMaxElapsedSeconds: null,
    retryMaxIntervalSeconds: null,
  },
};

describe('SettingsPage', () => {
  it('renders 4 radio options', () => {
    render(<SettingsPage settings={defaultSettings} onUpdate={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '5 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '10 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '60 secondi' })).toBeInTheDocument();
  });

  it('checks the radio matching current settings', () => {
    render(
      <SettingsPage
        settings={{ metricsRefreshInterval: 30_000, webhookDefaults: defaultSettings.webhookDefaults }}
        onUpdate={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: '30 secondi' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '10 secondi' })).not.toBeChecked();
  });

  it('calls onUpdate with the new interval when a radio is clicked', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('radio', { name: '60 secondi' }));
    expect(onUpdate).toHaveBeenCalledWith({ metricsRefreshInterval: 60_000 });
  });

  it('renders webhook defaults card with switch and number inputs', () => {
    render(<SettingsPage settings={defaultSettings} onUpdate={vi.fn()} />);
    expect(screen.getByText('Webhook — valori predefiniti')).toBeInTheDocument();
    expect(screen.getByLabelText('Enabled by default')).toBeInTheDocument();
    expect(screen.getByLabelText('Max retry duration (seconds)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max retry interval (seconds)')).toBeInTheDocument();
  });

  it('enabled switch reflects settings and calls onUpdate on toggle', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
    const toggle = screen.getByLabelText('Enabled by default');
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith({ webhookDefaults: { enabled: false } });
  });

  it('retry duration input calls onUpdate with number on valid input', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
    const input = screen.getByLabelText('Max retry duration (seconds)');
    fireEvent.change(input, { target: { value: '600' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith({
      webhookDefaults: { retryMaxElapsedSeconds: 600 },
    });
  });

  it('retry duration input calls onUpdate with null when cleared', () => {
    const onUpdate = vi.fn();
    const settingsWithRetry: AppSettings = {
      ...defaultSettings,
      webhookDefaults: { ...defaultSettings.webhookDefaults, retryMaxElapsedSeconds: 600 },
    };
    render(<SettingsPage settings={settingsWithRetry} onUpdate={onUpdate} />);
    const input = screen.getByLabelText('Max retry duration (seconds)');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith({
      webhookDefaults: { retryMaxElapsedSeconds: null },
    });
  });

  it('retry interval input calls onUpdate with number on valid input', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
    const input = screen.getByLabelText('Max retry interval (seconds)');
    fireEvent.change(input, { target: { value: '120' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith({
      webhookDefaults: { retryMaxIntervalSeconds: 120 },
    });
  });

  it('retry input shows error on invalid value and does not call onUpdate', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} />);
    const input = screen.getByLabelText('Max retry duration (seconds)');
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('retry input shows persisted value from settings', () => {
    const settingsWithRetry: AppSettings = {
      ...defaultSettings,
      webhookDefaults: {
        ...defaultSettings.webhookDefaults,
        retryMaxElapsedSeconds: 600,
        retryMaxIntervalSeconds: 120,
      },
    };
    render(<SettingsPage settings={settingsWithRetry} onUpdate={vi.fn()} />);
    expect(screen.getByLabelText('Max retry duration (seconds)')).toHaveValue(600);
    expect(screen.getByLabelText('Max retry interval (seconds)')).toHaveValue(120);
  });
});
