import React from 'react';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateHeader,
  EmptyStateIcon,
  Button,
} from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState>
          <EmptyStateHeader
            titleText="Something went wrong"
            headingLevel="h1"
            icon={<EmptyStateIcon icon={ExclamationCircleIcon} />}
          />
          <EmptyStateBody>{this.state.error.message}</EmptyStateBody>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </EmptyState>
      );
    }
    return this.props.children;
  }
}
