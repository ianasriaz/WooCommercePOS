import { Component } from 'react';
const T = {
  ink: '#0f172a',
  inkSoft: '#64748b',
  line: '#e5e7eb',
  surface: '#ffffff',
  canvas: '#fafafa',
  accent: '#16a34a',
  danger: '#b91c1c',
};

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('POS Error Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', 
          alignItems: 'center', justifyContent: 'center', 
          background: T?.canvas || '#0f172a', color: T?.ink || '#f1f5f9', 
          fontFamily: 'system-ui, sans-serif', padding: 20, textAlign: 'center'
        }}>
          <div style={{
            background: T?.surface || '#1e293b', padding: 40, borderRadius: 16,
            maxWidth: 400, boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: `1px solid ${T?.line || '#334155'}`
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={T?.danger || '#ef4444'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 20px' }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h1 style={{ fontSize: 24, margin: '0 0 10px', fontWeight: 700 }}>Application Error</h1>
            <p style={{ fontSize: 14, color: T?.inkSoft || '#94a3b8', margin: '0 0 24px', lineHeight: 1.5 }}>
              The POS encountered an unexpected error. Your cart data should be safe.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: T?.accent || '#3b82f6', color: '#fff', border: 'none',
                padding: '12px 24px', borderRadius: 8, fontSize: 15, fontWeight: 600,
                cursor: 'pointer', width: '100%'
              }}
            >
              Reload POS
            </button>
            {this.state.error && (
              <div style={{ 
                marginTop: 20, padding: 10, background: 'rgba(0,0,0,0.2)', 
                borderRadius: 6, fontSize: 11, textAlign: 'left', 
                color: T?.danger || '#ef4444', overflowX: 'auto',
                fontFamily: 'monospace', border: `1px solid ${T?.danger || '#ef4444'}40`
              }}>
                {this.state.error.toString()}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
