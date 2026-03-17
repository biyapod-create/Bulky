import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', color: 'var(--text)', fontFamily: 'monospace' }}>
          <h2 style={{ color: 'var(--error)', marginBottom: '16px' }}>Something went wrong</h2>
          <p style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>
            The page crashed. This is usually caused by a missing function or data error.
          </p>
          <pre style={{
            background: 'var(--bg-tertiary)',
            padding: '16px',
            borderRadius: '8px',
            overflow: 'auto',
            maxHeight: '300px',
            fontSize: '12px',
            whiteSpace: 'pre-wrap'
          }}>
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null, errorInfo: null }); }}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
