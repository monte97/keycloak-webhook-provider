import React, { useRef, useState } from 'react';
import { Label, Popover, Button } from '@patternfly/react-core';

interface CircuitBadgeProps {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  webhookId: string;
  onReset: (webhookId: string) => Promise<void>;
}

const colorMap = {
  CLOSED: 'green',
  OPEN: 'red',
  HALF_OPEN: 'gold',
} as const;

export function CircuitBadge({ state, failureCount, webhookId, onReset }: CircuitBadgeProps) {
  const [isResetting, setIsResetting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await onReset(webhookId);
    } finally {
      setIsResetting(false);
      setIsVisible(false);
    }
  };

  if (state !== 'OPEN') {
    return <Label color={colorMap[state]}>{state}</Label>;
  }

  return (
    <Popover
      triggerRef={triggerRef}
      isVisible={isVisible}
      shouldOpen={() => setIsVisible(true)}
      shouldClose={() => setIsVisible(false)}
      appendTo="inline"
      headerContent="Circuit breaker is OPEN"
      bodyContent={
        <div>
          <p>{failureCount} failures</p>
          <Button
            variant="primary"
            size="sm"
            isLoading={isResetting}
            onClick={handleReset}
            style={{ marginTop: 8 }}
          >
            Reset to CLOSED
          </Button>
        </div>
      }
    >
      <span ref={triggerRef} style={{ cursor: 'pointer' }}>
        <Label color="red">{state}</Label>
      </span>
    </Popover>
  );
}
