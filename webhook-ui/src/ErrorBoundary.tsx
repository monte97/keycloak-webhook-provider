import React from 'react';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
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
          <EmptyStateFooter>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </EmptyStateFooter>
        </EmptyState>
      );
    }
    return this.props.children;
  }
}
