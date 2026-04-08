import { useState } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  TextInput,
  Alert,
} from '@patternfly/react-core';

interface SecretRotationModalProps {
  mode: 'graceful' | 'emergency';
  isOpen: boolean;
  onConfirm: (args: { graceDays?: number }) => void | Promise<void>;
  onClose: () => void;
}

export function SecretRotationModal({
  mode,
  isOpen,
  onConfirm,
  onClose,
}: SecretRotationModalProps) {
  const [graceDays, setGraceDays] = useState<number>(7);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setGraceDays(7);
    setConfirmText('');
    onClose();
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      if (mode === 'graceful') {
        await onConfirm({ graceDays });
      } else {
        await onConfirm({});
      }
      setGraceDays(7);
      setConfirmText('');
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'graceful') {
    return (
      <Modal
        variant={ModalVariant.small}
        title="Rotate secret"
        isOpen={isOpen}
        onClose={handleClose}
        actions={[
          <Button
            key="rotate"
            variant="primary"
            onClick={handleConfirm}
            isLoading={submitting}
          >
            Rotate
          </Button>,
          <Button key="cancel" variant="link" onClick={handleClose}>
            Cancel
          </Button>,
        ]}
      >
        <Alert variant="info" isInline title="Zero-downtime rotation">
          The current secret will remain valid as a fallback until the chosen expiry. Update
          your endpoints before the grace period ends.
        </Alert>
        <Form>
          <FormGroup label="Grace period" fieldId="grace-days">
            <FormSelect
              id="grace-days"
              value={String(graceDays)}
              onChange={(_, v) => setGraceDays(Number(v))}
              aria-label="Grace period"
            >
              <FormSelectOption key={1} value="1" label="1 day" />
              <FormSelectOption key={7} value="7" label="7 days (default)" />
              <FormSelectOption key={30} value="30" label="30 days" />
            </FormSelect>
          </FormGroup>
        </Form>
      </Modal>
    );
  }

  // emergency mode
  return (
    <Modal
      variant={ModalVariant.small}
      title="Emergency rotate secret"
      isOpen={isOpen}
      onClose={handleClose}
      actions={[
        <Button
          key="rotate"
          variant="danger"
          onClick={handleConfirm}
          isDisabled={confirmText !== 'rotate'}
          isLoading={submitting}
        >
          Emergency rotate
        </Button>,
        <Button key="cancel" variant="link" onClick={handleClose}>
          Cancel
        </Button>,
      ]}
    >
      <Alert variant="danger" isInline title="Immediate invalidation">
        This action invalidates the current secret IMMEDIATELY. Webhooks verified with the old
        secret will fail until the new secret is distributed. Use only when the current secret
        has been compromised.
      </Alert>
      <Form>
        <FormGroup label='Type "rotate" to confirm' fieldId="confirm-text">
          <TextInput
            id="confirm-text"
            value={confirmText}
            onChange={(_, v) => setConfirmText(v)}
            aria-label='Type "rotate" to confirm'
          />
        </FormGroup>
      </Form>
    </Modal>
  );
}
