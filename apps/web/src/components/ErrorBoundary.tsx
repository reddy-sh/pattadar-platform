/**
 * The last thing between a thrown render and a white screen.
 *
 * Until this existed there was no error boundary anywhere in the app and no
 * route declared an `errorElement`, so a single `undefined.x` inside any one
 * panel unmounted the entire tree: the nav, the header, the URL bar's meaning,
 * everything. What the owner got was a blank page — no wordmark, no way back,
 * nothing to read out to whoever they rang about it.
 *
 * Two jobs, and the second is why this is a class rather than a route-level
 * `errorElement` alone:
 *
 *  1. `errorElement` on the routes catches what React Router raises — loader
 *     and render errors under that route — and keeps the shell around it.
 *  2. A `<Suspense>` whose lazy chunk fails to download does NOT raise through
 *     the router; it rejects the promise and re-throws on render. Every screen
 *     here is behind React.lazy, so a deploy that rotates hashed filenames
 *     while a tab is open — or a phone that loses signal between two screens —
 *     white-screened the app. A boundary wrapping the Suspense catches it and
 *     offers the one thing that actually fixes a stale chunk: reload.
 *
 * Deliberately plain elements and inline style, not MUI and not w360.css: this
 * has to render when the reason the page died might BE the theme provider or a
 * stylesheet that never arrived.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** What died, in the owner's words — "This screen", "Pattadar". */
  what?: string;
}
interface State { error: Error | null }

const wrap: React.CSSProperties = {
  minHeight: '60vh', display: 'grid', placeContent: 'center', justifyItems: 'center',
  gap: '0.75rem', textAlign: 'center', padding: '3rem 1.5rem',
  fontFamily: 'Inter, system-ui, sans-serif', color: '#c9c0ba',
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry endpoint yet, so the console is the only record. Logged
    // rather than swallowed: a boundary that hides the stack from the people
    // fixing it is worse than the white screen it replaced.
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A chunk that 404s after a deploy is the one failure a reload really does
    // fix, and it is common enough to name rather than lump in with the rest.
    const stale = /dynamically imported module|Importing a module script failed|Failed to fetch/i
      .test(error.message);

    return (
      <div style={wrap} role="alert">
        <p style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 600, color: '#f5efe9' }}>
          {stale
            ? 'Pattadar updated while this tab was open'
            : `${this.props.what ?? 'This screen'} stopped before it finished drawing`}
        </p>
        <p style={{ margin: 0, maxWidth: '30rem', fontSize: '0.8125rem', lineHeight: 1.5 }}>
          {stale
            ? 'Reloading picks up the new version. Nothing you have saved is affected.'
            : 'Nothing has been lost — this is a fault in the page, not in your records. '
              + 'Reloading usually clears it.'}
        </p>
        <p style={{ margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: '0.6875rem',
                    color: '#8a807a', overflowWrap: 'anywhere', maxWidth: '30rem' }}>
          {error.message}
        </p>
        <span style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '0.4375rem 0.875rem', borderRadius: 999, cursor: 'pointer',
                     border: 0, background: '#e08b3c', color: '#231a14',
                     font: 'inherit', fontSize: '0.8125rem', fontWeight: 500 }}
          >
            Reload
          </button>
          {!stale && (
            <button
              type="button"
              // Back to the dashboard rather than history.back(): the screen
              // that threw is very often the one behind you.
              onClick={() => { window.location.href = '/app'; }}
              style={{ padding: '0.4375rem 0.875rem', borderRadius: 999, cursor: 'pointer',
                       border: '1px solid #453c36', background: 'none', color: 'inherit',
                       font: 'inherit', fontSize: '0.8125rem' }}
            >
              Go to your dashboard
            </button>
          )}
        </span>
      </div>
    );
  }
}
