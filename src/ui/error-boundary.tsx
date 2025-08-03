// error-boundary.tsx - Error boundary and error handling utilities
import React, { Component, ReactNode } from 'react';
import { Text, Box } from 'ink';
import { systemEventEmitter } from '../system-events.js';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  errorId?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: React.ErrorInfo, retry: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  isolate?: boolean; // Whether to isolate this boundary from parent boundaries
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryCount = 0;
  private maxRetries = 3;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorId = this.state.errorId || 'unknown';
    
    // Log error to system events
    systemEventEmitter.emitSystemInfo('React Error Boundary caught error', {
      errorId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });

    // Call custom error handler
    this.props.onError?.(error, errorInfo);

    // Update state with error info
    this.setState({
      error,
      errorInfo
    });

    // Log to console for debugging
    console.error('Error Boundary caught an error:', error);
    console.error('Component stack:', errorInfo.componentStack);
  }

  retry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.setState({ hasError: false, error: undefined, errorInfo: undefined });
      
      systemEventEmitter.emitSystemInfo('Error boundary retry attempted', {
        errorId: this.state.errorId,
        retryCount: this.retryCount
      });
    }
  };

  render() {
    if (this.state.hasError && this.state.error && this.state.errorInfo) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorInfo, this.retry);
      }

      // Default error UI
      return (
        <Box borderStyle="double" borderColor="red" padding={1}>
          <Box flexDirection="column">
            <Text color="red" bold>💥 Component Error</Text>
            <Text></Text>
            
            <Text color="yellow">Error ID: {this.state.errorId}</Text>
            <Text color="red">Message: {this.state.error.message}</Text>
            <Text></Text>
            
            {this.state.error.stack && (
              <>
                <Text color="gray">Stack Trace:</Text>
                <Box flexDirection="column" marginLeft={2}>
                  {this.state.error.stack.split('\n').slice(0, 5).map((line, index) => (
                    <Text key={index} color="gray">{line}</Text>
                  ))}
                </Box>
                <Text></Text>
              </>
            )}
            
            <Text color="gray">Component Stack:</Text>
            <Box flexDirection="column" marginLeft={2}>
              {this.state.errorInfo.componentStack.split('\n').slice(0, 3).map((line, index) => (
                <Text key={index} color="gray">{line.trim()}</Text>
              ))}
            </Box>
            <Text></Text>
            
            {this.retryCount < this.maxRetries ? (
              <Box>
                <Text color="cyan">Press 'r' to retry ({this.maxRetries - this.retryCount} attempts left)</Text>
              </Box>
            ) : (
              <Text color="red">Maximum retry attempts reached</Text>
            )}
            
            <Text color="gray">Press 'Ctrl+C' to exit</Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundaries
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) => {
  return React.forwardRef<any, P>((props, ref) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} ref={ref} />
    </ErrorBoundary>
  ));
};

// Hook for error handling in functional components
export const useErrorHandler = () => {
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = React.useCallback((error: Error) => {
    setError(error);
    
    systemEventEmitter.emitSystemInfo('useErrorHandler caught error', {
      error: error.message,
      stack: error.stack
    });
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  // Throw error to be caught by error boundary
  if (error) {
    throw error;
  }

  return { handleError, clearError };
};

// Async error handler for promises
export const handleAsyncError = (error: Error, context?: string) => {
  systemEventEmitter.emitSystemInfo('Async error occurred', {
    context: context || 'unknown',
    error: error.message,
    stack: error.stack
  });

  console.error(`Async error${context ? ` in ${context}` : ''}:`, error);
};

// Safe async wrapper
export const safeAsync = async <T,>(
  asyncFn: () => Promise<T>,
  context?: string,
  fallback?: T
): Promise<T | undefined> => {
  try {
    return await asyncFn();
  } catch (error) {
    handleAsyncError(error instanceof Error ? error : new Error(String(error)), context);
    return fallback;
  }
};

// Error recovery utilities
export const ErrorRecovery = {
  // Retry with exponential backoff
  retryWithBackoff: async <T,>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> => {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  },

  // Circuit breaker pattern
  createCircuitBreaker: <T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options: {
      failureThreshold?: number;
      resetTimeout?: number;
      monitoringPeriod?: number;
    } = {}
  ) => {
    const {
      failureThreshold = 5,
      resetTimeout = 60000,
      monitoringPeriod = 10000
    } = options;

    let failures = 0;
    let lastFailureTime = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';

    return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const now = Date.now();

      // Reset failure count if monitoring period has passed
      if (now - lastFailureTime > monitoringPeriod) {
        failures = 0;
      }

      // Check if circuit should be reset to half-open
      if (state === 'open' && now - lastFailureTime > resetTimeout) {
        state = 'half-open';
      }

      // Reject if circuit is open
      if (state === 'open') {
        throw new Error('Circuit breaker is open');
      }

      try {
        const result = await fn(...args);
        
        // Reset on success
        if (state === 'half-open') {
          state = 'closed';
          failures = 0;
        }
        
        return result;
      } catch (error) {
        failures++;
        lastFailureTime = now;

        // Open circuit if threshold reached
        if (failures >= failureThreshold) {
          state = 'open';
        }

        throw error;
      }
    };
  }
};
