import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console so DevTools and crash reporter can pick it up
    console.error(`[ErrorBoundary:${this.props.name || 'Unknown'}]`, error, errorInfo);
    // Push to notification center if available
    try {
      if (window.__bulkyNotify) {
        window.__bulkyNotify({
          type: 'error',
          title: `Error in ${this.props.name || 'a page'}`,
          message: error?.message || 'An unexpected error occurred'
        });
      }
    } catch (e) {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40,
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}>
          <AlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>
            Something went wrong
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 14 }}>
            {this.props.name ? `The ${this.props.name} section encountered an error.` : 'An error occurred.'}
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 20px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
