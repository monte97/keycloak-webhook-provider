import { Modal, ModalVariant, Button, Alert } from '@patternfly/react-core';

interface PayloadPreviewModalProps {
  isOpen: boolean;
  eventObject: string | null;
  errorMessage: string | null;
  onClose: () => void;
}

export function PayloadPreviewModal({
  isOpen,
  eventObject,
  errorMessage,
  onClose,
}: PayloadPreviewModalProps) {
  const prettyJson = eventObject
    ? (() => {
        try {
          return JSON.stringify(JSON.parse(eventObject), null, 2);
        } catch {
          return eventObject;
        }
      })()
    : null;

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Event payload"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="close" variant="primary" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      {errorMessage && (
        <Alert variant="warning" isInline title={errorMessage} style={{ marginBottom: 12 }} />
      )}
      {prettyJson && (
        <>
          <pre
            style={{
              overflow: 'auto',
              maxHeight: 400,
              padding: 12,
              background: 'var(--pf-v5-global--BackgroundColor--200, #f4f4f4)',
              borderRadius: 4,
              fontSize: '0.85em',
              marginBottom: 8,
            }}
          >
            {prettyJson}
          </pre>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigator.clipboard.writeText(prettyJson)}
          >
            Copy to clipboard
          </Button>
        </>
      )}
    </Modal>
  );
}
