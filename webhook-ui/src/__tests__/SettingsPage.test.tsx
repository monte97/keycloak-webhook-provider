import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '../components/SettingsPage';
import type { AppSettings } from '../lib/useSettings';
import type { RealmSettings } from '../api/types';

const defaultSettings: AppSettings = {
  metricsRefreshInterval: 10_000,
  webhookDefaults: {
    enabled: true,
    retryMaxElapsedSeconds: null,
    retryMaxIntervalSeconds: null,
  },
  deliveryHistoryPageSize: 50,
};

describe('SettingsPage', () => {
  it('renders 4 radio options', () => {
    render(<SettingsPage settings={defaultSettings} onUpdate={vi.fn()} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '5 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '10 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 secondi' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '60 secondi' })).toBeInTheDocument();
  });

  it('checks the radio matching current settings', () => {
    render(
      <SettingsPage
        settings={{ ...defaultSettings, metricsRefreshInterval: 30_000 }}
        onUpdate={vi.fn()}
        realmSettings={null}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: '30 secondi' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '10 secondi' })).not.toBeChecked();
  });

  it('calls onUpdate with the new interval when a radio is clicked', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: '60 secondi' }));
    expect(onUpdate).toHaveBeenCalledWith({ metricsRefreshInterval: 60_000 });
  });

  it('renders webhook defaults card with switch and number inputs', () => {
    render(<SettingsPage settings={defaultSettings} onUpdate={vi.fn()} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    expect(screen.getByText('Webhook — valori predefiniti')).toBeInTheDocument();
    expect(screen.getByLabelText('Enabled by default')).toBeInTheDocument();
    expect(screen.getByLabelText('Max retry duration (seconds)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max retry interval (seconds)')).toBeInTheDocument();
  });

  it('enabled switch reflects settings and calls onUpdate on toggle', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    const toggle = screen.getByLabelText('Enabled by default');
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledWith({ webhookDefaults: { enabled: false } });
  });

  it('retry duration input calls onUpdate with number on valid input', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
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
    render(<SettingsPage settings={settingsWithRetry} onUpdate={onUpdate} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    const input = screen.getByLabelText('Max retry duration (seconds)');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith({
      webhookDefaults: { retryMaxElapsedSeconds: null },
    });
  });

  it('retry interval input calls onUpdate with number on valid input', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    const input = screen.getByLabelText('Max retry interval (seconds)');
    fireEvent.change(input, { target: { value: '120' } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith({
      webhookDefaults: { retryMaxIntervalSeconds: 120 },
    });
  });

  it('retry input shows error on invalid value and does not call onUpdate', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    const input = screen.getByLabelText('Max retry duration (seconds)');
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Must be a positive integer')).toBeInTheDocument();
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
    render(<SettingsPage settings={settingsWithRetry} onUpdate={vi.fn()} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    expect(screen.getByLabelText('Max retry duration (seconds)')).toHaveValue(600);
    expect(screen.getByLabelText('Max retry interval (seconds)')).toHaveValue(120);
  });

  it('renders "Cronologia consegne" card with 4 page size radio options', () => {
    render(<SettingsPage settings={defaultSettings} onUpdate={vi.fn()} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    expect(screen.getByText('Cronologia consegne')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '10' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '25' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '50' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '100' })).toBeInTheDocument();
  });

  it('checks the page size radio matching settings.deliveryHistoryPageSize', () => {
    render(
      <SettingsPage
        settings={{ ...defaultSettings, deliveryHistoryPageSize: 10 }}
        onUpdate={vi.fn()}
        realmSettings={null}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: '10' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '50' })).not.toBeChecked();
  });

  it('clicking a page size radio calls onUpdate with deliveryHistoryPageSize', () => {
    const onUpdate = vi.fn();
    render(<SettingsPage settings={defaultSettings} onUpdate={onUpdate} realmSettings={null} realmSettingsLoading={false} realmSettingsError={null} onUpdateRealmSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: '25' }));
    expect(onUpdate).toHaveBeenCalledWith({ deliveryHistoryPageSize: 25 });
  });
});

const defaultRealmSettings: RealmSettings = {
  retentionEventDays: 30,
  retentionSendDays: 90,
  circuitFailureThreshold: 5,
  circuitOpenSeconds: 60,
};

describe('SettingsPage — Configurazione server card', () => {
  it('renders the card title', () => {
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={defaultRealmSettings}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    expect(screen.getByText('Configurazione server')).toBeInTheDocument();
  });

  it('shows values from realmSettings', () => {
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={defaultRealmSettings}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Event retention (days)')).toHaveValue(30);
    expect(screen.getByLabelText('Send retention (days)')).toHaveValue(90);
    expect(screen.getByLabelText('Circuit failure threshold')).toHaveValue(5);
    expect(screen.getByLabelText('Circuit open duration (seconds)')).toHaveValue(60);
  });

  it('calls onUpdateRealmSettings with correct field on blur', () => {
    const onUpdateRealmSettings = vi.fn();
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={defaultRealmSettings}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={onUpdateRealmSettings}
      />,
    );
    const input = screen.getByLabelText('Event retention (days)');
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.blur(input);
    expect(onUpdateRealmSettings).toHaveBeenCalledWith({ retentionEventDays: 45 });
  });

  it('does not call onUpdateRealmSettings when input is cleared (null)', () => {
    const onUpdateRealmSettings = vi.fn();
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={defaultRealmSettings}
        realmSettingsLoading={false}
        realmSettingsError={null}
        onUpdateRealmSettings={onUpdateRealmSettings}
      />,
    );
    const input = screen.getByLabelText('Event retention (days)');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onUpdateRealmSettings).not.toHaveBeenCalled();
  });

  it('shows Spinner when realmSettingsLoading is true', () => {
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={null}
        realmSettingsLoading={true}
        realmSettingsError={null}
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows error Alert when realmSettingsError is set', () => {
    render(
      <SettingsPage
        settings={defaultSettings}
        onUpdate={vi.fn()}
        realmSettings={null}
        realmSettingsLoading={false}
        realmSettingsError="Network error"
        onUpdateRealmSettings={vi.fn()}
      />,
    );
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});
