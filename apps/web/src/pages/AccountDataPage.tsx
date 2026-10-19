import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { apiFetch } from '../api/client';
import { downloadBlob } from './documents/storage';
import { PageHead, ddmmyyyy, num, plural } from '../w360/ui';
import { Sk } from '../w360/skeletons';
import { isAppPath } from '../w360/appPath';

// Bumped 06/10/2026: the purposes' wording changed (records -> data,
// service requests -> service orders).
const VERSION = '2026-10-06';
const PURPOSES = [
  ['document_processing', 'Store and organise my data and the people connected to them.'],
  ['ai_extraction', 'Use AI providers to read documents when I ask for a reading.'],
  ['service_notifications', 'Send messages about my service orders and their progress.'],
] as const;
type Receipt = {id:string;status:string;createdAt:string;stages:{name:string;status:string}[]};

export function AccountDataPage() {
  const [search] = useSearchParams();
  const welcome = search.get('welcome') === '1';
  const destination = search.get('returnTo') || '/home';
  const continueTo = isAppPath(destination) || /^\/legacy(\/|$)/.test(destination) ? destination : '/home';
  const [purposes,setPurposes] = useState<string[]>([]);
  const [receipt,setReceipt] = useState<Receipt|null>(null);
  // The head states what the server holds, not the unsaved ticks below; undefined while the first read is pending, null once it failed.
  const [saved,setSaved] = useState<{purposes:string[];acceptedAt:string|null}|null>();
  const [confirmation,setConfirmation] = useState('');
  const [busy,setBusy] = useState('');
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [loaded,setLoaded] = useState(false);
  const read = async (res:Response) => {
    const body = await res.json();
    if (!res.ok) {
      if (res.status===401) throw new Error('Sign out and sign in again, then retry.');
      throw new Error(typeof body.detail==='string' ? body.detail : body.error || 'The request could not be completed. Try again.');
    }
    return body;
  };
  const refresh = async () => {
    const [consent,deletion] = await Promise.all([
      apiFetch('/api/gateway/account/consent').then(read),
      apiFetch('/api/gateway/account/erasure').then(read),
    ]);
    setPurposes(consent.purposes || []); setSaved(consent); setReceipt(deletion.request || null); setLoaded(true);
  };
  useEffect(() => { void refresh().catch(e=>{ setError(e.message); setSaved(null); }); }, []);
  const run = async (name:string,work:()=>Promise<void>) => {
    setBusy(name); setMessage(''); setError('');
    try { await work(); } catch(e) { setError(e instanceof Error ? e.message : 'The request could not be completed.'); }
    finally { setBusy(''); }
  };
  // A zero count is not drawn (only a money balance keeps its zero); "Recorded" still says the choices were saved.
  const summaryLine = saved ? [
    saved.purposes.length ? `${num(saved.purposes.length)} of ${plural(PURPOSES.length, 'choice')} on` : '',
    saved.acceptedAt ? `Recorded ${ddmmyyyy(saved.acceptedAt)}` : '',
    receipt ? `Deletion requested ${ddmmyyyy(receipt.createdAt)}` : '',
  ].filter(Boolean).join(' · ') || undefined : undefined;
  // The shared app frame (design.md § Page head, "One frame"): `.w360 main`
  // carries the width cap and padding, so this page starts at every page's edge.
  return <main>
    <PageHead title="Privacy & your data"
      summary={saved === undefined ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" /> : summaryLine} />
    {welcome && <p>Welcome to Pattadar. Read the notice and record your choices before adding your first property. AI readings and service messages have separate choices.</p>}
    <p><strong>Your data, your rights.</strong> You can keep a copy of your data, record your choices, or request account deletion. Read the <Link to="/privacy">privacy notice</Link> and <Link to="/terms">terms of use</Link>.</p>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <section style={{marginBlock:'2rem'}}>
      <h2>Your choices</h2>
      <p>Notice version {VERSION}. These choices are recorded with your account and the date. Changes do not undo files already processed or messages already sent.</p>
      {PURPOSES.map(([key,label])=><label key={key} style={{display:'block',marginBlock:12}}><input type="checkbox" checked={purposes.includes(key)} disabled={!loaded||!!busy} onChange={e=>setPurposes(p=>e.target.checked?[...p,key]:p.filter(x=>x!==key))}/> {label}</label>)}
      <button className="btn primary" disabled={!loaded||!!busy} onClick={()=>void run('consent',async()=>{
        setSaved(await read(await apiFetch('/api/gateway/account/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:VERSION,purposes})})));
        setMessage('Your choices have been recorded.');
      })}>{busy==='consent'?'Saving…':'Save choices'}</button>
      {welcome && <p><Link to={continueTo}>Continue to Pattadar</Link></p>}
    </section>
    <section style={{marginBlock:'2rem'}}>
      <h2>Export your data</h2>
      <p>Download your account data and a manifest of your stored files as JSON. The original files remain available in Documents.</p>
      <button className="btn" disabled={!!busy} onClick={()=>void run('export',async()=>{
        const res=await apiFetch('/api/gateway/account/export',{timeoutMs:120_000});
        if(!res.ok) { await read(res); return; }
        downloadBlob(await res.blob(),`pattadar-export-${new Date().toISOString().slice(0,10)}.json`);
        setMessage('Your export has been downloaded.');
      })}>{busy==='export'?'Preparing export…':'Download my data'}</button>
    </section>
    <section style={{marginBlock:'2rem'}}>
      <h2>Delete your account</h2>
      <p>Deletion covers your data, stored file versions, assistant data and sign-in account. Sign in again before requesting deletion. A request is processed in stages; it is complete only when every required stage succeeds. You can check its progress here.</p>
      {receipt ? <><p role="status">Request {receipt.id}: {receipt.status}</p><ul>{receipt.stages.map(stage=><li key={stage.name}>{stage.name}: {stage.status}</li>)}</ul><button className="btn" disabled={!!busy} onClick={()=>void run('refresh',refresh)}>Refresh status</button></> : <>
        <label style={{display:'block'}}>Type DELETE MY ACCOUNT to request deletion<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" style={{display:'block',marginBlock:12,width:'100%'}}/></label>
        <button className="btn" disabled={!!busy||confirmation!=='DELETE MY ACCOUNT'} onClick={()=>void run('erasure',async()=>{
          const result=await read(await apiFetch('/api/gateway/account/erasure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation})}));
          setReceipt(result); setConfirmation(''); setMessage('Your deletion request was recorded. Your data has not been deleted yet.');
        })}>{busy==='erasure'?'Recording request…':'Request account deletion'}</button>
      </>}
    </section>
    <p>For help with a data request: <a href="mailto:grievance@pattadar.com">grievance@pattadar.com</a>.</p>
  </main>;
}
