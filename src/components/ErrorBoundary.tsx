import { Component, type ReactNode } from 'react'
import { reportError } from '../lib/errorReporting'

// Last-resort catch for render-time crashes: report it, show a friendly
// reload panel instead of a white screen.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error: unknown) {
    reportError(error)
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
        <div className="ktc-glass" style={{ padding: 32, maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>Something went wrong</h1>
          <p className="ktc-label" style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6 }}>
            The error has been reported to KTC automatically. Reloading usually fixes it.
          </p>
          <button className="ktc-btn" style={{ marginTop: 18, width: 'auto', padding: '11px 26px' }}
            onClick={() => window.location.reload()}>
            ↻ Reload
          </button>
        </div>
      </div>
    )
  }
}
