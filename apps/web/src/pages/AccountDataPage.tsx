import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { apiFetch } from '../api/client';
import { downloadBlob } from './documents/storage';

const VERSION = '2026-09-12';
const PURPOSES = [
  ['document_processing', 'Store and organise my records and the people connected to them.'],
  ['ai_extraction', 'Use AI providers to read documents when I ask for a reading.'],
  ['service_notifications', 'Send messages about my service requests and their progress.'],
] as const;
type Receipt = {id:string;status:string;createdAt:string;stages:{name:string;status:string}[]};

export function AccountDataPage() {
  const [search] = useSearchParams();
  const welcome = search.get('welcome') === '1';
  const destination = search.get('returnTo') || '/app';
  const continueTo = /^\/(app|legacy)(\/|$)/.test(destination) ? destination : '/app';
  const [purposes,setPurposes] = useState<string[]>([]);
  const [receipt,setReceipt] = useState<Receipt|null>(null);
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
    setPurposes(consent.purposes || []); setReceipt(deletion.request || null); setLoaded(true);
  };
  useEffect(() => { void refresh().catch(e=>setError(e.message)); }, []);
  const run = async (name:string,work:()=>Promise<void>) => {
    setBusy(name); setMessage(''); setError('');
    try { await work(); } catch(e) { setError(e instanceof Error ? e.message : 'The request could not be completed.'); }
    finally { setBusy(''); }
  };
  return <main className="page" style={{maxWidth:800,padding:'2rem'}}>
    <h1>Your account and data</h1>
    {welcome && <p>Welcome to Pattadar. Read the notice and record your choices before adding your first record. AI readings and service messages have separate choices.</p>}
    <p>Read the <Link to="/privacy">privacy notice</Link> and <Link to="/terms">terms of use</Link>. You can keep a copy of your records, record your choices, or request account deletion.</p>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <section style={{marginBlock:'2rem'}}>
      <h2>Your recorded choices</h2>
      <p>Notice version {VERSION}. These choices are recorded with your account and the date. Changes do not undo files already processed or messages already sent.</p>
      {PURPOSES.map(([key,label])=><label key={key} style={{display:'block',marginBlock:12}}><input type="checkbox" checked={purposes.includes(key)} disabled={!loaded||!!busy} onChange={e=>setPurposes(p=>e.target.checked?[...p,key]:p.filter(x=>x!==key))}/> {label}</label>)}
      <button className="btn primary" disabled={!loaded||!!busy} onClick={()=>void run('consent',async()=>{
        await read(await apiFetch('/api/gateway/account/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:VERSION,purposes})}));
        setMessage('Your choices have been recorded.');
      })}>{busy==='consent'?'Saving…':'Save choices'}</button>
      {welcome && <p><Link to={continueTo}>Continue to my records</Link></p>}
    </section>
    <section style={{marginBlock:'2rem'}}>
      <h2>Export your records</h2>
      <p>Download your account data and a manifest of your stored files as JSON. The original files remain available in Papers.</p>
      <button className="btn" disabled={!!busy} onClick={()=>void run('export',async()=>{
        const res=await apiFetch('/api/gateway/account/export',{timeoutMs:120_000});
        if(!res.ok) { await read(res); return; }
        downloadBlob(await res.blob(),`pattadar-export-${new Date().toISOString().slice(0,10)}.json`);
        setMessage('Your export has been downloaded.');
      })}>{busy==='export'?'Preparing export…':'Download my data'}</button>
    </section>
    <section style={{marginBlock:'2rem'}}>
      <h2>Delete your account</h2>
      <p>Deletion covers your records, stored file versions, assistant data and sign-in account. Sign in again before requesting deletion. A request is processed in stages; it is complete only when every required stage succeeds. You can check its progress here.</p>
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
