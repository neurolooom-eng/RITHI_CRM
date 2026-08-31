import { Component, type ErrorInfo, type ReactNode } from 'react';

// ===========================================================================
// ERROR BOUNDARY.
//
// A React error thrown while rendering unmounts the WHOLE tree — the screen
// goes white, with the reason only in the console. That is indistinguishable
// from "the site is down", which is the worst way to learn about a bug.
//
// This catches it and says what happened, keeps the rest of the app usable,
// and offers the two things that actually recover a stuck screen: a reload,
// and clearing the cached rows the browser restored before the network
// answered (a dataset saved by an older build is a real cause).
// ===========================================================================

interface Props { children: ReactNode; where?: string }
interface State { error: Error | null; info: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept for the report below, and left in the console for a developer.
    this.setState({ info: (info.componentStack ?? '').trim().split('\n').slice(0, 6).join('\n') });
    console.error('[RITHI CRM] render failed', error, info);
  }

  private clearCaches = () => {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('rithi.cache.') || k.startsWith('rithi.sync.')) localStorage.removeItem(k);
      });
    } catch { /* storage disabled — reloading is still worth a try */ }
    window.location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
        <h2 style={{ margin: '0 0 6px' }}>😕 This screen hit an error</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          The rest of the app still works — use the menu to go elsewhere.
          {this.props.where ? ` (${this.props.where})` : ''}
        </p>
        <pre style={{
          background: 'var(--surface-2, #f3f4f6)', border: '1px solid var(--border, #ddd)',
          borderRadius: 8, padding: 12, overflowX: 'auto', fontSize: 12.5, whiteSpace: 'pre-wrap',
        }}>{error.message}{info ? `\n\n${info}` : ''}</pre>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>↻ Reload</button>
          <button className="btn btn-sm" onClick={this.clearCaches}>🧹 Clear cached data and reload</button>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          If it keeps happening, send this message on — it names the failing screen.
        </p>
      </div>
    );
  }
}
