import { useState, useEffect } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Radio,
  Switch,
  TextInput,
  Title,
  Alert,
  Spinner,
} from '@patternfly/react-core';
import type { AppSettings, AppSettingsPatch } from '../lib/useSettings';
import type { RealmSettings } from '../api/types';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (patch: AppSettingsPatch) => void;
  realmSettings: RealmSettings | null;
  realmSettingsLoading: boolean;
  realmSettingsError: string | null;
  onUpdateRealmSettings: (patch: Partial<RealmSettings>) => void;
}

const INTERVAL_OPTIONS = [
  { label: '5 secondi', value: 5_000 },
  { label: '10 secondi', value: 10_000 },
  { label: '30 secondi', value: 30_000 },
  { label: '60 secondi', value: 60_000 },
] as const;

const PAGE_SIZE_OPTIONS = [
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
] as const;

function RetryInput({
  label,
  fieldId,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  fieldId: string;
  value: number | null;
  placeholder: string;
  onChange: (val: number | null) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  const [error, setError] = useState('');

  useEffect(() => {
    setLocal(value != null ? String(value) : '');
  }, [value]);

  const handleBlur = () => {
    if (local.trim() === '') {
      setError('');
      onChange(null);
      return;
    }
    const n = Number(local);
    if (!Number.isInteger(n) || n < 1) {
      setError('Must be a positive integer');
      return;
    }
    setError('');
    onChange(n);
  };

  return (
    <FormGroup label={label} fieldId={fieldId}>
      <TextInput
        id={fieldId}
        aria-label={label}
        type="number"
        value={local}
        onChange={(_e, val) => {
          setLocal(val);
          if (error) setError('');
        }}
        onBlur={handleBlur}
        validated={error ? 'error' : 'default'}
        placeholder={placeholder}
      />
      {error && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{error}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

export function SettingsPage({
  settings,
  onUpdate,
  realmSettings,
  realmSettingsLoading,
  realmSettingsError,
  onUpdateRealmSettings,
}: SettingsPageProps) {
  return (
    <>
      <Title headingLevel="h1" size="xl" style={{ marginBottom: 16 }}>
        Impostazioni
      </Title>
      <Card>
        <CardTitle>Metriche</CardTitle>
        <CardBody>
          <Form>
            <FormGroup
              label="Intervallo auto-refresh"
              role="group"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <Radio
                  key={opt.value}
                  id={`interval-${opt.value}`}
                  name="metrics-refresh-interval"
                  label={opt.label}
                  isChecked={settings.metricsRefreshInterval === opt.value}
                  onChange={() => onUpdate({ metricsRefreshInterval: opt.value })}
                />
              ))}
            </FormGroup>
          </Form>
        </CardBody>
      </Card>
      <Card style={{ marginTop: 16 }}>
        <CardTitle>Webhook — valori predefiniti</CardTitle>
        <CardBody>
          <Form>
            <FormGroup label="Enabled by default" fieldId="default-enabled">
              <Switch
                id="default-enabled"
                aria-label="Enabled by default"
                isChecked={settings.webhookDefaults.enabled}
                onChange={(_e, val) =>
                  onUpdate({ webhookDefaults: { enabled: val } })
                }
              />
            </FormGroup>
            <RetryInput
              label="Max retry duration (seconds)"
              fieldId="retry-max-elapsed"
              value={settings.webhookDefaults.retryMaxElapsedSeconds}
              placeholder="900 (default server)"
              onChange={(val) =>
                onUpdate({ webhookDefaults: { retryMaxElapsedSeconds: val } })
              }
            />
            <RetryInput
              label="Max retry interval (seconds)"
              fieldId="retry-max-interval"
              value={settings.webhookDefaults.retryMaxIntervalSeconds}
              placeholder="180 (default server)"
              onChange={(val) =>
                onUpdate({ webhookDefaults: { retryMaxIntervalSeconds: val } })
              }
            />
          </Form>
        </CardBody>
      </Card>
      <Card style={{ marginTop: 16 }}>
        <CardTitle>Cronologia consegne</CardTitle>
        <CardBody>
          <Form>
            <FormGroup label="Righe per pagina" role="group">
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <Radio
                  key={opt.value}
                  id={`page-size-${opt.value}`}
                  name="delivery-history-page-size"
                  label={opt.label}
                  isChecked={settings.deliveryHistoryPageSize === opt.value}
                  onChange={() => onUpdate({ deliveryHistoryPageSize: opt.value })}
                />
              ))}
            </FormGroup>
          </Form>
        </CardBody>
      </Card>
      <Card style={{ marginTop: 16 }}>
        <CardTitle>Configurazione server</CardTitle>
        <CardBody>
          {realmSettingsLoading && <Spinner size="sm" aria-label="Loading server settings" />}
          {realmSettingsError && (
            <Alert variant="danger" isInline title={realmSettingsError} style={{ marginBottom: 8 }} />
          )}
          {!realmSettingsLoading && !realmSettingsError && realmSettings && (
            <Form>
              <RetryInput
                label="Event retention (days)"
                fieldId="retention-event-days"
                value={realmSettings.retentionEventDays}
                placeholder="30"
                onChange={(val) => { if (val !== null) onUpdateRealmSettings({ retentionEventDays: val }); }}
              />
              <RetryInput
                label="Send retention (days)"
                fieldId="retention-send-days"
                value={realmSettings.retentionSendDays}
                placeholder="90"
                onChange={(val) => { if (val !== null) onUpdateRealmSettings({ retentionSendDays: val }); }}
              />
              <RetryInput
                label="Circuit failure threshold"
                fieldId="circuit-failure-threshold"
                value={realmSettings.circuitFailureThreshold}
                placeholder="5"
                onChange={(val) => { if (val !== null) onUpdateRealmSettings({ circuitFailureThreshold: val }); }}
              />
              <RetryInput
                label="Circuit open duration (seconds)"
                fieldId="circuit-open-seconds"
                value={realmSettings.circuitOpenSeconds}
                placeholder="60"
                onChange={(val) => { if (val !== null) onUpdateRealmSettings({ circuitOpenSeconds: val }); }}
              />
            </Form>
          )}
        </CardBody>
      </Card>
    </>
  );
}
