import { Component } from 'react';

// Keeps one crashing tab from blanking the whole app. Reset by changing `resetKey`
// (we key it on the active tab, so switching tabs clears a caught error).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error, info) {
    console.error('[tab crash]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '40px', maxWidth: 640 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>This tab hit an error</h2>
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>
            The rest of the app still works — switch tabs and come back, or reload.
          </p>
          <pre style={{ marginTop: 12, padding: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, overflow: 'auto', color: '#ef4444' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
