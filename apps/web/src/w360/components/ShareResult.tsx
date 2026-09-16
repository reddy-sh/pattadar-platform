import { useState } from 'react';

/** Keep the one-time secret visible until the owner has copied it. */
export default function ShareResult({ path }: { path: string }) {
  const [message, setMessage] = useState('');
  const url = new URL(path, window.location.origin).href;
  return <div className="stack" style={{ gap: 'var(--space-sm)' }}>
    <p>The link is ready. Copy it and send it to the intended recipient. Anyone with this link can open the selected files until it expires or you revoke it.</p>
    <label className="field">Recipient link
      <input aria-label="Recipient link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
    </label>
    <div className="row">
      <button type="button" className="btn primary" onClick={async () => {
        try { await navigator.clipboard.writeText(url); setMessage('Copied.'); }
        catch { setMessage('Select the link above and copy it.'); }
      }}>Copy link</button>
      {typeof navigator.share === 'function' && <button type="button" className="btn" onClick={async () => {
        try { await navigator.share({ title: 'Shared files', url }); }
        catch { /* Dismissing the share sheet leaves the link available. */ }
      }}>Send link</button>}
    </div>
    <p role="status">{message}</p>
  </div>;
}
