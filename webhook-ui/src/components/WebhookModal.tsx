import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Form,
  FormGroup,
  TextInput,
  Switch,
  FormSelect,
  FormSelectOption,
  Alert,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core';
import type { Webhook, WebhookInput } from '../api/types';
import { ALL_EVENT_OPTIONS } from './eventTypes';

interface WebhookModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  webhook?: Webhook;
  secretConfigured?: boolean | null;
  onSave: (data: WebhookInput) => Promise<void>;
  onClose: () => void;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function WebhookModal({ mode, isOpen, webhook, secretConfigured, onSave, onClose }: WebhookModalProps) {
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState('HmacSHA256');
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [eventInput, setEventInput] = useState('');
  const [eventSelectOpen, setEventSelectOpen] = useState(false);
  const [retryMaxElapsed, setRetryMaxElapsed] = useState('');
  const [retryMaxInterval, setRetryMaxInterval] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && webhook) {
      setUrl(webhook.url);
      setEnabled(webhook.enabled);
      setAlgorithm(webhook.algorithm);
      setEventTypes([...webhook.eventTypes]);
      setSecret('');
      setRetryMaxElapsed(webhook.retryMaxElapsedSeconds != null ? String(webhook.retryMaxElapsedSeconds) : '');
      setRetryMaxInterval(webhook.retryMaxIntervalSeconds != null ? String(webhook.retryMaxIntervalSeconds) : '');
    } else {
      setUrl('');
      setEnabled(true);
      setSecret('');
      setAlgorithm('HmacSHA256');
      setEventTypes([]);
      setRetryMaxElapsed('');
      setRetryMaxInterval('');
    }
    setErrors({});
    setApiError(null);
    setEventInput('');
  }, [mode, webhook, isOpen]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!url.trim()) errs.url = 'URL is required';
    else if (!isValidUrl(url)) errs.url = 'Must be a valid HTTP or HTTPS URL';
    if (eventTypes.length === 0) errs.eventTypes = 'At least one event type is required';
    if (retryMaxElapsed && (isNaN(Number(retryMaxElapsed)) || Number(retryMaxElapsed) < 1))
      errs.retryMaxElapsed = 'Must be a positive number';
    if (retryMaxInterval && (isNaN(Number(retryMaxInterval)) || Number(retryMaxInterval) < 1))
      errs.retryMaxInterval = 'Must be a positive number';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setApiError(null);
    try {
      const data: WebhookInput = { url, enabled, eventTypes, algorithm };
      if (secret) data.secret = secret;
      if (retryMaxElapsed) data.retryMaxElapsedSeconds = Number(retryMaxElapsed);
      if (retryMaxInterval) data.retryMaxIntervalSeconds = Number(retryMaxInterval);
      await onSave(data);
      onClose();
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const addEventType = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !eventTypes.includes(trimmed)) {
      setEventTypes([...eventTypes, trimmed]);
      setEventInput('');
      if (errors.eventTypes) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next['eventTypes'];
          return next;
        });
      }
    }
    setEventSelectOpen(false);
  };

  const removeEventType = (type: string) => {
    setEventTypes(eventTypes.filter((t) => t !== type));
  };

  const filteredOptions = ALL_EVENT_OPTIONS.filter(
    (opt) => !eventTypes.includes(opt.value) &&
      (opt.value.toLowerCase().includes(eventInput.toLowerCase()) ||
       opt.description.toLowerCase().includes(eventInput.toLowerCase())),
  );

  const secretHelperText = mode === 'edit'
    ? secretConfigured === true
      ? 'Secret configured. Leave blank to keep current value.'
      : secretConfigured === false
        ? 'No secret configured.'
        : 'Secret status unknown.'
    : undefined;

  return (
    <Modal
      variant={ModalVariant.medium}
      title={mode === 'create' ? 'Create webhook' : 'Edit webhook'}
      isOpen={isOpen}
      onClose={() => onClose()}
      actions={[
        <Button key="save" variant="primary" onClick={handleSubmit} isLoading={saving}>
          Save
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      {apiError && (
        <Alert variant="danger" isInline title="Error" style={{ marginBottom: 16 }}>
          {apiError}
        </Alert>
      )}
      <Form>
        <FormGroup label="URL" isRequired fieldId="url">
          <TextInput
            id="url"
            aria-label="URL"
            value={url}
            onChange={(_e: React.FormEvent<HTMLInputElement>, val: string) => setUrl(val)}
            validated={errors.url ? 'error' : 'default'}
            placeholder="https://api.example.com/webhook"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={errors.url ? 'error' : 'default'}>
                {errors.url || 'The endpoint that will receive webhook POST requests.'}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup label="Enabled" fieldId="enabled">
          <Switch
            id="enabled"
            aria-label="Enabled"
            isChecked={enabled}
            onChange={(_e: React.FormEvent<HTMLInputElement>, val: boolean) => setEnabled(val)}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Disabled webhooks will not receive any events.</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup label="Secret" fieldId="secret">
          <TextInput
            id="secret"
            type="password"
            value={secret}
            onChange={(_e: React.FormEvent<HTMLInputElement>, val: string) => setSecret(val)}
            placeholder={mode === 'edit' ? '••••••••' : 'Optional HMAC secret'}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                {secretHelperText || 'Used to sign payloads with HMAC. Your endpoint can verify the X-Webhook-Signature header.'}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup label="Algorithm" fieldId="algorithm">
          <FormSelect
            id="algorithm"
            value={algorithm}
            onChange={(_e: React.FormEvent<HTMLSelectElement>, val: string) => setAlgorithm(val)}
          >
            <FormSelectOption value="HmacSHA256" label="HmacSHA256" />
            <FormSelectOption value="HmacSHA1" label="HmacSHA1" />
          </FormSelect>
          <FormHelperText>
            <HelperText>
              <HelperTextItem>HMAC algorithm for signing webhook payloads. SHA-256 recommended.</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup label="Max retry duration (seconds)" fieldId="retryMaxElapsed">
          <TextInput
            id="retryMaxElapsed"
            type="number"
            value={retryMaxElapsed}
            onChange={(_e: React.FormEvent<HTMLInputElement>, val: string) => setRetryMaxElapsed(val)}
            validated={errors.retryMaxElapsed ? 'error' : 'default'}
            placeholder="900"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={errors.retryMaxElapsed ? 'error' : 'default'}>
                {errors.retryMaxElapsed || 'Total time window for retry attempts. Default: 900 (15 minutes).'}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup label="Max retry interval (seconds)" fieldId="retryMaxInterval">
          <TextInput
            id="retryMaxInterval"
            type="number"
            value={retryMaxInterval}
            onChange={(_e: React.FormEvent<HTMLInputElement>, val: string) => setRetryMaxInterval(val)}
            validated={errors.retryMaxInterval ? 'error' : 'default'}
            placeholder="180"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={errors.retryMaxInterval ? 'error' : 'default'}>
                {errors.retryMaxInterval || 'Maximum wait between retries (exponential backoff cap). Default: 180 (3 minutes).'}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>

        <FormGroup label="Event types" isRequired fieldId="eventTypes">
          <Select
            id="eventTypeSelect"
            isOpen={eventSelectOpen}
            onSelect={(_e, value) => { if (value) addEventType(String(value)); }}
            onOpenChange={setEventSelectOpen}
            popperProps={{ appendTo: () => document.body, maxWidth: 'trigger', enableFlip: true }}
            isScrollable
            style={{ maxHeight: 300 } as React.CSSProperties}
            toggle={(toggleRef) => (
              <MenuToggle ref={toggleRef} onClick={() => setEventSelectOpen(!eventSelectOpen)} isExpanded={eventSelectOpen} style={{ width: '100%' }}>
                <TextInputGroup>
                  <TextInputGroupMain
                    value={eventInput}
                    onChange={(_e, val) => { setEventInput(val); if (!eventSelectOpen) setEventSelectOpen(true); }}
                    placeholder="Search event types..."
                    aria-label="Search event types"
                  />
                </TextInputGroup>
              </MenuToggle>
            )}
          >
            <SelectList>
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                  <SelectOption key={opt.value} value={opt.value} description={opt.description}>
                    {opt.value}
                  </SelectOption>
                ))
              ) : (
                <SelectOption isDisabled>No matching events</SelectOption>
              )}
            </SelectList>
          </Select>
          {eventTypes.length > 0 && (
            <LabelGroup style={{ marginTop: 8 }}>
              {eventTypes.map((t) => (
                <Label key={t} onClose={() => removeEventType(t)}>
                  {t}
                </Label>
              ))}
            </LabelGroup>
          )}
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant={errors.eventTypes ? 'error' : 'default'}>
                {errors.eventTypes || 'Use * for all events, access.* / admin.* for categories, or pick specific events.'}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </Form>
    </Modal>
  );
}
