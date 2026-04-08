import { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Alert,
  Checkbox,
} from '@patternfly/react-core';

interface SecretDisclosureModalProps {
  isOpen: boolean;
  newSecret: string;
  onClose: () => void;
}

export function SecretDisclosureModal({
  isOpen,
  newSecret,
  onClose,
}: SecretDisclosureModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (isOpen) setAcknowledged(false);
  }, [isOpen, newSecret]);

  return (
    <Modal
      variant={ModalVariant.medium}
      title="New secret generated"
      isOpen={isOpen}
      onClose={() => {
        if (acknowledged) onClose();
      }}
      actions={[
        <Button
          key="done"
          variant="primary"
          onClick={onClose}
          isDisabled={!acknowledged}
        >
          Done
        </Button>,
      ]}
    >
      <Alert variant="warning" isInline title="Copy this secret now">
        You will not be able to view it again. If you lose it, you will need to rotate the
        secret again.
      </Alert>
      <div style={{ marginTop: 'var(--pf-v5-global--spacer--md)' }}>
        <code
          style={{
            display: 'block',
            padding: 'var(--pf-v5-global--spacer--sm)',
            background: 'var(--pf-v5-global--BackgroundColor--200, #f0f0f0)',
            wordBreak: 'break-all',
            userSelect: 'all',
          }}
        >
          {newSecret}
        </code>
        <Button
          variant="link"
          isInline
          style={{ marginTop: 'var(--pf-v5-global--spacer--xs)' }}
          onClick={() => navigator.clipboard?.writeText(newSecret)}
        >
          Copy to clipboard
        </Button>
      </div>
      <div style={{ marginTop: 'var(--pf-v5-global--spacer--md)' }}>
        <Checkbox
          id="ack-secret-copied"
          label="I have copied the secret to a safe place"
          isChecked={acknowledged}
          onChange={(_, checked) => setAcknowledged(checked)}
        />
      </div>
    </Modal>
  );
}
