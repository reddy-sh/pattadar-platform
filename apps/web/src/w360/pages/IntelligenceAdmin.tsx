import { useState } from 'react';
import type { ReactNode } from 'react';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';

import {
  useCheckIntelligenceProvider, useIntelligenceSettings, usePortfolio, useSaveIntelligenceOcr,
  useSaveIntelligenceProvider, useSetIntelligenceReader,
  type IntelligenceCredential, type IntelligenceProvider, type IntelligenceSettings,
} from '../api';
import { Drawer, DrawerAction } from '../Drawer';
import { ConfirmDialog } from './PropertyActions';
import { useToast } from '../Toast';
import { Card, ddmmyyyy, Empty, Failed, PageHead, plural, StatusChip } from '../ui';
import { Sk, SkTable } from '../skeletons';

/** Which AI reads owners' documents, and each provider's key and model.
 *  Super-admin only (the server decides; this page only draws the refusal).
 *
 *  Built to grow: the page is one table of the server's provider registry, as
 *  Properties is one table of records. A provider's settings open in a drawer,
 *  and making it the active reader replaces a saved choice, so it asks in the
 *  shared confirmation (design.md: removing or replacing something saved).
 *  The fifth provider costs a row, not another screenful of forms.
 *  Credentials are write-only: a saved one is never sent back. */

const INFO = 'Which AI reads new passbooks, registered documents and other property documents. '
  + 'Aadhaar cards and photo checks always use Claude. Keys saved here are encrypted, win over '
  + 'the server\'s own and are never shown again.';
// Mirrors ai_reading/admin.py and providers/google.py, so a refusal is explained before it is sent.
const PROCESSOR = /^projects\/[a-zA-Z0-9_-]+\/locations\/(us|eu|asia-south1)\/processors\/[a-zA-Z0-9_-]+$/;
const API_KEY = /^[A-Za-z0-9_.-]{20,300}$/;
const FALLBACK = 'anthropic';
const NO_STORE = 'Keys cannot be saved yet: the api service has no PLATFORM_SECRETS_KEY. Set it for the api '
  + '(locally in .local/cognito-local.env) and restart the api. Until then each provider uses the key in the '
  + 'server\'s own environment, if it has one.';

const usable = (c: IntelligenceCredential) => c.source === 'form' || c.source === 'server';
const modelName = (p: IntelligenceProvider, id = p.model) => p.models.find((m) => m.id === id)?.name ?? id;

function isServiceAccount(raw: string): boolean {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    return v?.type === 'service_account' && !!v.client_email && !!v.private_key;
  } catch {
    return false;
  }
}

/** A provider's one-word state, for its row and its drawer. */
function status(p: IntelligenceProvider, active: string): { state: string; word: string } {
  if (p.key.source === 'unreadable') return { state: 'bad', word: 'Key unreadable' };
  if (p.needs) return { state: 'warn', word: 'Needs setup' };
  return { state: 'good', word: p.id === active ? 'Active' : 'Ready' };
}

/** Where a key comes from, in one line under its field. */
function KeyNote({ cred, store, forgotten, onForget, onKeep }: {
  cred: IntelligenceCredential; store: boolean; forgotten: boolean;
  onForget: () => void; onKeep: () => void;
}) {
  if (!store) return <span className="note">Saving keys here is off; see the notice on the page.</span>;
  if (forgotten) {
    return (
      <span className="note">
        Will be removed when you save.{' '}
        <button type="button" className="linkbtn" onClick={onKeep}>Undo</button>
      </span>
    );
  }
  if (cred.source === 'unreadable') {
    return (
      <span className="note" role="alert">
        The saved one can no longer be decrypted. Type it again, or{' '}
        <button type="button" className="linkbtn" onClick={onForget}>remove it</button>.
      </span>
    );
  }
  if (cred.source === 'form') {
    return (
      <span className="note">
        Saved encrypted{cred.updatedAt ? ` on ${ddmmyyyy(cred.updatedAt)}` : ''}; type a new one to replace it.{' '}
        <button type="button" className="linkbtn" onClick={onForget}>Remove</button>
      </span>
    );
  }
  if (cred.source === 'server') {
    return <span className="note">Using the one held on the server. One saved here takes its place.</span>;
  }
  return <span className="note">Stored encrypted. It is never shown again after you save.</span>;
}

/** Lists the provider's models with its saved key: the connection check. */
function ConnectionCheck({ p }: { p: IntelligenceProvider }) {
  const check = useCheckIntelligenceProvider();
  const [result, setResult] = useState('');
  const run = async () => {
    setResult('');
    try {
      const r = (await check.mutateAsync({ provider: p.id })).web.checkIntelligenceProvider;
      setResult(r?.ok ? `Connected. ${plural(r.count, 'model')} available.` : r?.message || 'The check was refused.');
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'The check did not run.');
    }
  };
  const ready = usable(p.key);
  return (
    <div className="row tight" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="btn sm" disabled={!ready || check.isPending} onClick={() => void run()}>
        {check.isPending ? 'Checking…' : 'Check connection'}
      </button>
      <span className="note" role="status">
        {result || (!ready ? 'Save an API key first, then check it.'
          : p.modelsCheckedAt ? `Model list from ${ddmmyyyy(p.modelsCheckedAt)}.`
            : 'Lists every model this key can use. Sends no document.')}
      </span>
    </div>
  );
}

interface ProviderDraft { model: string; apiKey: string; forgetKey: boolean }
interface OcrDraft { enabled: boolean; processor: string; serviceAccount: string; forgetServiceAccount: boolean }

/** One provider's settings. Gemini also carries its Document AI step. */
function ProviderDrawer({ s, p, onClose }: { s: IntelligenceSettings; p: IntelligenceProvider; onClose: () => void }) {
  const saveProvider = useSaveIntelligenceProvider();
  const saveOcr = useSaveIntelligenceOcr();
  const toast = useToast();
  const store = s.canStoreCredentials;
  const hasOcr = p.id === 'gemini';
  const baseP: ProviderDraft = { model: p.model, apiKey: '', forgetKey: false };
  const baseO: OcrDraft = { enabled: s.ocr.enabled, processor: s.ocr.processor, serviceAccount: '', forgetServiceAccount: false };
  const [dp, setDp] = useState(baseP);
  const [dO, setDO] = useState(baseO);
  const pDirty = JSON.stringify(dp) !== JSON.stringify(baseP);
  const oDirty = hasOcr && JSON.stringify(dO) !== JSON.stringify(baseO);
  const busy = saveProvider.isPending || saveOcr.isPending;
  const st = status(p, s.activeReader);

  const why = (() => {
    if (dp.apiKey.trim() && !API_KEY.test(dp.apiKey.trim())) return `That ${p.name} API key does not look right.`;
    if (dO.serviceAccount.trim() && !isServiceAccount(dO.serviceAccount.trim())) {
      return 'The service-account key must be the JSON file Google Cloud gave you.';
    }
    if (dO.processor.trim() && !PROCESSOR.test(dO.processor.trim())) {
      return 'The processor must look like projects/…/locations/us/processors/….';
    }
    if (!pDirty && !oDirty) return 'Change something to save it.';
    return '';
  })();

  const submit = async () => {
    try {
      if (pDirty) {
        const r = (await saveProvider.mutateAsync({ provider: p.id, ...dp, apiKey: dp.apiKey.trim() })).web.saveIntelligenceProvider;
        if (!r) {
          toast.bad(p.id === s.reader && dp.forgetKey
            ? `${p.name} is reading documents, so its key stays. Switch the reader first.`
            : 'The server refused these settings. Nothing has changed.');
          return;
        }
      }
      if (oDirty) {
        const r = (await saveOcr.mutateAsync({ ...dO, processor: dO.processor.trim(), serviceAccount: dO.serviceAccount.trim() }))
          .web.saveIntelligenceOcr;
        if (!r) {
          toast.bad(s.reader === 'gemini'
            ? 'Gemini is reading documents, so Document AI must stay complete. Switch the reader first.'
            : 'The server refused the Document AI settings.');
          return;
        }
      }
      toast.ok(`${p.name} saved`);
      onClose();
    } catch {
      // The hook has already said why.
    }
  };

  return (
    <Drawer
      eyebrow={`${p.vendor} · ${st.word}`}
      title={p.name}
      sub={p.needs || (p.id === s.activeReader ? 'Active: reading new documents now.'
        : 'Ready. Use Make active in the list to switch to it.')}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      dirty={pDirty || oDirty}
      primary={<DrawerAction label="Save" working="Saving…" pending={busy} disabled={!!why}
                             describedBy={why ? 'intel-why' : undefined} />}
      primaryWhy={why ? { id: 'intel-why', text: why } : undefined}
    >
      <div className="stack">
        <div className="field">
          <label htmlFor="intel-key">API key</label>
          <input id="intel-key" type="password" autoComplete="off" spellCheck={false} value={dp.apiKey}
                 disabled={!store}
                 placeholder={p.key.source === 'form' ? '•••••••• (saved)' : `Paste the ${p.name} API key`}
                 onChange={(e) => setDp({ ...dp, apiKey: e.target.value })} />
          <KeyNote cred={p.key} store={store} forgotten={dp.forgetKey}
                   onForget={() => setDp({ ...dp, apiKey: '', forgetKey: true })}
                   onKeep={() => setDp({ ...dp, forgetKey: false })} />
        </div>
        <div className="field">
          <label htmlFor="intel-model">Model</label>
          <select id="intel-model" value={dp.model} onChange={(e) => setDp({ ...dp, model: e.target.value })}>
            {p.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <ConnectionCheck p={p} />
        </div>

        {hasOcr && (
          <section className="stack" aria-labelledby="intel-ocr">
            <p className="eyebrow" id="intel-ocr" style={{ margin: 0 }}>Document AI OCR</p>
            <label className="check">
              <input type="checkbox" checked={dO.enabled} onChange={(e) => setDO({ ...dO, enabled: e.target.checked })} />
              Read the text with Document AI first (best for Telugu scans)
            </label>
            {dO.enabled ? (
              <>
                <div className="field">
                  <label htmlFor="intel-processor">Processor</label>
                  <input id="intel-processor" type="text" className="mono" autoComplete="off" spellCheck={false}
                         value={dO.processor}
                         placeholder="projects/PROJECT/locations/asia-south1/processors/PROCESSOR"
                         onChange={(e) => setDO({ ...dO, processor: e.target.value })} />
                  <span className="note">From Google Cloud. Region us, eu or asia-south1. About 15 pages per document.</span>
                </div>
                <div className="field">
                  <label htmlFor="intel-account">Service-account key (JSON)</label>
                  <textarea id="intel-account" rows={4} className="mono" autoComplete="off" spellCheck={false}
                            value={dO.serviceAccount} disabled={!store}
                            placeholder={s.ocr.account.source === 'form' ? '•••••••• (saved)' : 'Paste the whole JSON key file'}
                            onChange={(e) => setDO({ ...dO, serviceAccount: e.target.value })} />
                  <KeyNote cred={s.ocr.account} store={store} forgotten={dO.forgetServiceAccount}
                           onForget={() => setDO({ ...dO, serviceAccount: '', forgetServiceAccount: true })}
                           onKeep={() => setDO({ ...dO, forgetServiceAccount: false })} />
                </div>
              </>
            ) : <span className="note">Off: Gemini reads the scan itself, and only the API key is needed.</span>}
          </section>
        )}
      </div>
    </Drawer>
  );
}

const COLS = [
  { head: 'Provider', w: '8rem' }, { head: 'Model', w: '7rem' }, { head: 'Key', w: '4rem' },
  { head: 'Status', w: '4.5rem' }, { head: '', w: '0' },
] as const;

export function IntelligenceAdmin() {
  const portfolio = usePortfolio();
  const allowed = portfolio.data?.isSuperAdmin === true;
  const settings = useIntelligenceSettings(allowed);
  const [open, setOpen] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const setReader = useSetIntelligenceReader();
  const toast = useToast();

  // Every state draws the same head (design.md § Page head), ⓘ included.
  const head = <PageHead title="Intelligence" info={INFO} />;
  const pending = <PageHead title="Intelligence" info={INFO} summary={<Sk w="18rem" h="1rem" r="var(--radius-xs)" />} />;
  // The provider table's own shape while access, then the settings, are read.
  const table = (label: string) => (
    <main>{pending}<SkTable label={label} cols={COLS} rows={4} select={false} foot={false} minWidth="auto" /></main>
  );
  if (portfolio.isLoading) return table('Checking your administration access');
  if (!allowed) {
    return (
      <main>
        {head}
        <Empty boxed h="24rem" icon="lock" title="Intelligence settings are restricted">
          Only a super-admin can choose which AI reads documents or change its keys.
        </Empty>
      </main>
    );
  }
  if (settings.isLoading) return table('Loading the Intelligence settings');
  const s = settings.data;
  if (settings.error || !s) {
    return <main>{head}<Failed what="The Intelligence settings" error={settings.error} boxed h="24rem" /></main>;
  }

  const active = s.providers.find((p) => p.id === s.activeReader) ?? s.providers[0];
  const ready = s.providers.filter((p) => !p.needs).length;
  const opened = s.providers.find((p) => p.id === open);
  const target = s.providers.find((p) => p.id === activating);
  const activate = async () => {
    if (!target) return;
    try {
      const r = (await setReader.mutateAsync({ provider: target.id })).web.setIntelligenceReader;
      if (r) toast.ok(`${target.name} reads new documents now.`);
      else toast.bad(`${target.name} is not ready. Nothing has changed.`);
    } catch {
      // The hook has already said why.
    } finally {
      setActivating(null);
    }
  };
  // Claude is the fallback: making it active is the rollback and never refused.
  const action = (p: IntelligenceProvider): ReactNode => {
    const isActive = p.id === s.activeReader && p.id === s.reader;
    if (p.needs && (p.id !== FALLBACK || isActive)) {
      return <button type="button" className="btn sm" onClick={() => setOpen(p.id)}>Set up</button>;
    }
    if (isActive) return null;
    return <button type="button" className="btn sm" onClick={() => setActivating(p.id)}>Make active</button>;
  };
  const row = (p: IntelligenceProvider): ReactNode => {
    const st = status(p, s.activeReader);
    return (
      <tr key={p.id} onClick={() => setOpen(p.id)} style={{ cursor: 'pointer' }}>
        <td><strong>{p.name}</strong><span className="note" style={{ display: 'block' }}>{p.vendor}</span></td>
        <td>{modelName(p)}</td>
        <td>{p.key.source === 'form' ? 'Saved here' : p.key.source === 'server' ? 'Server' : p.key.source === 'unreadable' ? 'Unreadable' : 'None'}</td>
        <td><StatusChip state={st.state}>{st.word}</StatusChip></td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
          <span className="row tight" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
            {action(p)}
            <button className="iconbtn" type="button" title={`${p.name} settings`} aria-label={`${p.name} settings`}
                    onClick={() => setOpen(p.id)}>
              <ChevronRightOutlined sx={{ fontSize: 18 }} />
            </button>
          </span>
        </td>
      </tr>
    );
  };

  return (
    <main>
      {/* No eyebrow: "Administration" is the rail group (design.md § Page head, V2). */}
      <PageHead
        title="Intelligence"
        info={INFO}
        summary={`Active: ${active ? `${active.name} · ${modelName(active)}` : 'none'} · `
          + `${ready} of ${plural(s.providers.length, 'provider')} ready`
          + `${s.updatedAt ? ` · changed ${ddmmyyyy(s.updatedAt)}` : ''}`}
      />
      {!s.canStoreCredentials && <p className="note" role="status">{NO_STORE}</p>}
      {s.reader !== s.activeReader && (
        <p className="note" role="alert">
          {s.providers.find((p) => p.id === s.reader)?.name} was made active but can no longer run, so Claude is reading.
        </p>
      )}
      <Card flush className="scroll-x">
        <table className="rectable">
          <thead><tr>
            {COLS.slice(0, -1).map((c) => <th key={c.head}>{c.head}</th>)}<th aria-label="Actions" />
          </tr></thead>
          <tbody>{s.providers.map(row)}</tbody>
        </table>
      </Card>
      {opened && <ProviderDrawer key={opened.id} s={s} p={opened} onClose={() => setOpen(null)} />}
      {target && (
        <ConfirmDialog
          title={`Make ${target.name} active?`}
          body={`New passbooks, registered documents and property documents will be read by ${target.name} · `
            + `${modelName(target)} instead of ${active ? `${active.name} · ${modelName(active)}` : 'the current reader'}. `
            + 'Readings already filed stay as they are. Aadhaar cards and photo checks stay on Claude.'}
          actionLabel="Make active" busyLabel="Switching…" busy={setReader.isPending}
          onConfirm={() => void activate()} onClose={() => setActivating(null)}
        />
      )}
    </main>
  );
}
