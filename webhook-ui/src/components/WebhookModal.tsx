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
} from '@patternfly/react-core';
import type { Webhook, WebhookInput } from '../api/types';

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
    } else {
      setUrl('');
      setEnabled(true);
      setSecret('');
      setAlgorithm('HmacSHA256');
      setEventTypes([]);
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
      await onSave(data);
      onClose();
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const addEventType = () => {
    const trimmed = eventInput.trim();
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
  };

  const removeEventType = (type: string) => {
    setEventTypes(eventTypes.filter((t) => t !== type));
  };

  const handleEventKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEventType();
    }
  };

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
          />
          {errors.url && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">{errors.url}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>

        <FormGroup label="Enabled" fieldId="enabled">
          <Switch
            id="enabled"
            aria-label="Enabled"
            isChecked={enabled}
            onChange={(_e: React.FormEvent<HTMLInputElement>, val: boolean) => setEnabled(val)}
          />
        </FormGroup>

        <FormGroup label="Secret" fieldId="secret">
          <TextInput
            id="secret"
            type="password"
            value={secret}
            onChange={(_e: React.FormEvent<HTMLInputElement>, val: string) => setSecret(val)}
            placeholder={mode === 'edit' ? '••••••••' : 'Optional HMAC secret'}
          />
          {secretHelperText && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem>{secretHelperText}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
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
        </FormGroup>

        <FormGroup label="Event types" isRequired fieldId="eventTypes">
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <TextInput
              id="eventTypeInput"
              placeholder="Add event type"
              value={eventInput}
              onChange={(_e: React.FormEvent<HTMLInputElement>, val: string) => setEventInput(val)}
              onKeyDown={handleEventKeyDown}
            />
            <Button variant="secondary" onClick={addEventType} isDisabled={!eventInput.trim()}>
              Add
            </Button>
          </div>
          {eventTypes.length > 0 && (
            <LabelGroup>
              {eventTypes.map((t) => (
                <Label key={t} onClose={() => removeEventType(t)}>
                  {t}
                </Label>
              ))}
            </LabelGroup>
          )}
          {errors.eventTypes && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">{errors.eventTypes}</HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      </Form>
    </Modal>
  );
}
