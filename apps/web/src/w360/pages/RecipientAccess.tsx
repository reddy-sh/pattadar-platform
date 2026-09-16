import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { downloadBlob } from '../../pages/documents/storage';
import '../w360.css';

type View = {
  title: string; scope: 'shares' | 'work'; expiresOn: string;
  items: { id: string; title: string; kind: string; available: boolean }[];
  boundary: object | null; status?: string; statusLabel?: string; actions?: string[];
  note?: string; outcomeNote?: string; dueDate?: string;
  answers?: { label: string; value: string }[];
  deliverables?: { id: string; label: string; note: string; review: string; review_note: string }[];
};

async function checked(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => ({})) as { detail?: string; error?: string };
  if (!res.ok) throw new Error(body.detail || body.error || 'This request could not be completed.');
  return body;
}

export default function RecipientAccess() {
  const { token = '' } = useParams();
  const { pathname } = useLocation();
  const scope = pathname.startsWith('/work/') ? 'work' : 'shares';
  const base = `/api/gateway/capabilities/${scope}/${encodeURIComponent(token)}`;
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ url: string; mime: string; title: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const data = await checked(await fetch(base, { cache: 'no-store', referrerPolicy: 'no-referrer' }));
      setView(data as View);
    } catch (e) { setView(null); setError(e instanceof Error ? e.message : 'This link is unavailable.'); }
  }, [base]);
  useEffect(() => { setView(null); setError(''); void load(); }, [load]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const openFile = async (item: View['items'][number]) => {
    setBusy(true); setError('');
    try {
      const result = await fetch(`${base}/files/${encodeURIComponent(item.id)}`, { cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (!result.ok) { await checked(result); return; }
      const blob = await result.blob();
      // Arbitrary HTML/SVG must never execute with the application's origin.
      if (blob.type !== 'application/pdf' && !/^image\/(png|jpeg|webp|gif|avif)$/.test(blob.type)) {
        downloadBlob(blob, item.title); return;
      }
      setPreview({ url: URL.createObjectURL(blob), mime: blob.type, title: item.title });
    } catch (e) { setError(e instanceof Error ? e.message : 'This file could not be opened.'); }
    finally { setBusy(false); }
  };

  const act = async (action: string) => {
    setBusy(true); setError('');
    try {
      await checked(await fetch(`${base}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }), referrerPolicy: 'no-referrer' }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'The action could not be saved.'); }
    finally { setBusy(false); }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(''); setMessage('');
    const body = new FormData(); body.append('label', label); body.append('note', note);
    if (file) body.append('file', file);
    try {
      await checked(await fetch(`${base}/deliverables`, { method: 'POST', body, referrerPolicy: 'no-referrer' }));
      setMessage(file ? 'Submitted. The owner can review this file now.' : 'Your update was recorded for the owner.');
      setLabel(''); setNote(''); setFile(null); form.reset();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Your submission could not be saved.'); }
    finally { setBusy(false); }
  };

  return <div className="w360" data-scheme="light" style={{ display: 'block', minHeight: '100vh' }}>
    <main style={{ maxWidth: 840, margin: '0 auto', padding: '2rem 1.25rem' }}>
      <p className="brand">Pattadar<span>.</span></p>
      <h1>{view?.title || (error ? 'Link unavailable' : 'Opening the link…')}</h1>
      {error && <p role="alert">{error}</p>}
      {view && <div className="stack" style={{ gap: '1.5rem' }}>
        <p>Available until {view.expiresOn}. The owner may revoke this link at any time.</p>
        {view.scope === 'work' && <section className="card">
          <h2>{view.statusLabel}</h2>
          <p>{view.note}</p>
          {view.dueDate && <p>Due: {view.dueDate}</p>}
          {view.outcomeNote && <p>{view.outcomeNote}</p>}
          {(view.answers || []).map((answer, index) => <p key={index}><strong>{answer.label}:</strong> {answer.value}</p>)}
          <div className="row">{(view.actions || []).filter((a) => a === 'assign' || a === 'start').map((action) =>
            <button className="btn primary" key={action} disabled={busy} onClick={() => { void act(action); }}>
              {action === 'assign' ? 'Accept this job' : 'Mark work started'}
            </button>)}</div>
          <p className="note">The owner reviews submitted files before accepting the work.</p>
        </section>}
        <section className="card">
          <h2>Selected files</h2>
          {!view.items.length && !view.boundary && <p>No files were shared with this link.</p>}
          {view.items.map((item) => <div className="row between" key={item.id} style={{ marginBottom: '1rem' }}>
            <span>{item.title}</span>
            {item.available ? <span className="row"><button className="btn" disabled={busy} onClick={() => { void openFile(item); }}>Open</button>
              <a className="btn" href={`${base}/files/${encodeURIComponent(item.id)}`} rel="noreferrer" download>Download</a></span>
              : <span>Original file unavailable</span>}
          </div>)}
          {view.boundary && <button className="btn" onClick={() => downloadBlob(new Blob([JSON.stringify(view.boundary, null, 2)],
            { type: 'application/geo+json' }), 'shared-boundary.geojson')}>Download boundary GeoJSON</button>}
        </section>
        {preview && <section className="card">
          <div className="row between"><h2>{preview.title}</h2><button className="btn" onClick={() => setPreview(null)}>Close preview</button></div>
          {preview.mime === 'application/pdf'
            ? <iframe title={preview.title} src={preview.url} sandbox="allow-same-origin" style={{ width: '100%', height: '70vh', border: 0 }} />
            : <img src={preview.url} alt={preview.title} style={{ maxWidth: '100%', maxHeight: '70vh' }} />}
        </section>}
        {view.scope === 'work' && <>
          {(view.deliverables || []).length > 0 && <section className="card"><h2>Submitted work</h2>
            {view.deliverables!.map((item) => <div key={item.id}>
              <h3>{item.label} · {item.review}</h3><p>{item.note}</p>{item.review_note && <p>{item.review_note}</p>}
            </div>)}
          </section>}
          {(view.actions?.includes('deliver') || view.status === 'submitted') && <form className="card stack" onSubmit={(e) => { void submit(e); }}>
            <h2>Send work or an update</h2>
            <label className="field">Title<input required maxLength={240} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
            <label className="field">Update<textarea maxLength={10000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <label className="field">File (optional)<input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
            <p className="note">A file is sent to the owner for review. A text update is added to the job history.</p>
            <button className="btn primary" disabled={busy || !label.trim()}>{busy ? 'Sending…' : 'Send to owner'}</button>
          </form>}
        </>}
        {message && <p role="status">{message}</p>}
      </div>}
    </main>
  </div>;
}
