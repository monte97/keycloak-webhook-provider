import {
  Card,
  CardBody,
  CardTitle,
  Form,
  FormGroup,
  Radio,
  Title,
} from '@patternfly/react-core';
import type { AppSettings, AppSettingsPatch } from '../lib/useSettings';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (patch: AppSettingsPatch) => void;
}

const INTERVAL_OPTIONS = [
  { label: '5 secondi', value: 5_000 },
  { label: '10 secondi', value: 10_000 },
  { label: '30 secondi', value: 30_000 },
  { label: '60 secondi', value: 60_000 },
] as const;

export function SettingsPage({ settings, onUpdate }: SettingsPageProps) {
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
    </>
  );
}
