/** The document-first half of "Add a record".
 *
 *  Reading the paper is the point; typing is the fallback — and a fallback is
 *  only a fallback if it stays out of the way until it is needed.
 *
 *  The drawer used to open on twelve empty boxes with one small "Read a deed
 *  or passbook" button above them, which quietly made hand-entry the main road
 *  and the reader a curiosity nobody pressed. The whole reason this product
 *  holds an extraction model is that a pattadar has the deed in their hand and
 *  should not have to retype it.
 *
 *  So the drawer now opens here, in one of three states — the same three every
 *  scan-first flow converges on (cheque deposit, Stripe Identity, passport
 *  readers):
 *
 *    idle    — the scan IS the screen. Hand entry and the map are two quiet
 *              links.
 *    reading — an honest clock, and permission to look away.
 *    failed  — the scan collapses to a single retry, the reason is stated in
 *              plain words, and the form opens by itself. When the automatic
 *              path breaks, the manual one must already be in front of you,
 *              not behind another click.
 *
 *  On success what was read is shown IN WORDS before any field is checked, so
 *  the question is "is this the right document?" rather than "are these
 *  twenty-six boxes right?".
 *
 *  Nothing here writes anything. The reader proposes; only Add record files.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import DocumentScannerOutlined from '@mui/icons-material/DocumentScannerOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import TextSnippetOutlined from '@mui/icons-material/TextSnippetOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

import { readDocument } from '../pages/documents/upload';
import type { Reading, ReadingUsage } from '../pages/documents/upload';
import { MAX_UPLOAD_BYTES, mb } from './filePhotos';
import { markJobRead, rememberFile, unwatchJob, watchJob } from './inbox';
import { fetchFileBlob } from '../pages/documents/storage';
import type { Paper } from './api';

/** What the reader made of the file, and the file itself.
 *
 *  The file travels with the reading on purpose. A record created from a
 *  scanned deed that then threw the deed away was the bug on the phone too:
 *  the holding reported "No documents attached yet" about the very document it
 *  had been made from, and the summary that had just been shown was gone. The
 *  caller keeps this so it can FILE the paper against the record it creates. */
export interface DeedRead {
  /** Absent when the reading was reopened from a notice after a reload: the
   *  server does not keep the bytes once a reading is done, so there is
   *  nothing to file and the drawer says so. */
  file?: File;
  /** The file's name, which survives even when the file does not. */
  name: string;
  reading: Reading;
  /** Existing vault row: file it by linking after the new property saves. */
  paperId?: string;
}

const ACCEPT = 'image/*,application/pdf';

/** Only worth offering where there is a camera behind the file picker. On a
 *  desktop the `capture` attribute is ignored and the button would be a second
 *  door to the same file dialog. */
const hasCamera = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches;

export function ScanFirst({ manualOpen, onManualOpenChange, onRead, onPickFromMap, initial, sourcePaper }: {
  /** Whether the caller is currently showing the hand-entry form. */
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  /** Hands the caller the reading to fill its form from. Returns the plain
   *  words for what it actually filled, so this card can say so. */
  onRead: (read: DeedRead) => string[];
  /** The third way in: leave the drawer for Cadastral maps, where the plot is
   *  found by its shape rather than read or typed. */
  onPickFromMap: () => void;
  /** A reading that finished after the drawer was closed, reopened from its
   *  notice. Shown exactly as a live one would be. */
  initial?: DeedRead | null;
  /** A document already uploaded to the private vault. Read its stored bytes
   *  for field extraction, then preserve the existing row when filing it. */
  sourcePaper?: Paper | null;
}) {
  const [reading, setReading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  // Anchor for the cost breakdown popover — the info icon beside "What this
  // document says". Null when the panel is closed.
  const [costAnchor, setCostAnchor] = useState<HTMLElement | null>(null);
  const [got, setGot] = useState<
    { name: string; found: string[]; summary: string; caveats: string[]; usage?: ReadingUsage } | null
  >(null);
  const pick = useRef<HTMLInputElement>(null);
  const shoot = useRef<HTMLInputElement>(null);
  const [camera] = useState(hasCamera);
  const qc = useQueryClient();
  /** The job being waited on, and the way to stop waiting on it. */
  const job = useRef('');
  const stop = useRef<AbortController | null>(null);

  // Closing the drawer mid-read stops THIS wait, not the reading: the server
  // finishes it and the inbox announces it (w360/inbox.ts).
  useEffect(() => () => {
    if (job.current) unwatchJob(job.current, qc);
    stop.current?.abort();
  }, [qc]);

  const show = (read: DeedRead) => {
    const f = read.reading.fields as Record<string, unknown>;
    const found = onRead(read);
    setGot({
      name: read.name,
      found,
      summary: String(f.summary ?? '').trim(),
      caveats: Array.isArray(f.caveats)
        ? (f.caveats as unknown[]).map((c) => String(c).trim()).filter(Boolean)
        : [],
      usage: read.reading.usage,
    });
    onManualOpenChange(true);   // the filled form is the next thing to check
  };

  // Once, on mount: the reopened reading fills the form like a fresh one.
  const shown = useRef(false);
  useEffect(() => {
    if (!initial || shown.current) return;
    shown.current = true;
    show(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    if (!sourcePaper || shown.current || !sourcePaper.fileRef) return;
    shown.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await fetchFileBlob(sourcePaper.fileRef);
        if (cancelled) return;
        const file = new File([blob], sourcePaper.title || 'Document', {
          type: sourcePaper.mimeType || blob.type || 'application/octet-stream',
        });
        await run(file, sourcePaper.id);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not open that document.');
          onManualOpenChange(true);
        }
      }
    })();
    return () => { cancelled = true; };
    // This is a one-time entry point for this drawer instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePaper]);

  // An honest counter, not a fake progress narrative on a timer. There is no
  // byte-level upload percentage here as there is on the phone: readDocument
  // is the vault's one reader and posts through the shared apiFetch, and the
  // model read is the long half of the wait in any case.
  useEffect(() => {
    if (!reading) { setElapsed(0); return; }
    const started = Date.now();
    const tick = window.setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(tick);
  }, [reading]);

  async function run(file: File | undefined, paperId = '') {
    if (!file || reading) return;
    setError('');
    setGot(null);
    setCostAnchor(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      // Said before the wait, not after it.
      setError(`${file.name} is ${mb(file.size)}. The limit is ${mb(MAX_UPLOAD_BYTES)}.`);
      onManualOpenChange(true);
      return;
    }
    setReading(true);
    const ctl = new AbortController();
    stop.current = ctl;
    try {
      const r = await readDocument(file, file.name, {
        purpose: 'add-property',
        signal: ctl.signal,
        onReceipt: (id) => { job.current = id; watchJob(id); rememberFile(id, file); },
      });
      // Seen here, so the notice the server also wrote is already read.
      if (job.current) {
        unwatchJob(job.current);
        void markJobRead(job.current, qc);
        job.current = '';
      }
      show({ file, name: file.name, reading: r, ...(paperId ? { paperId } : {}) });
    } catch (e) {
      // The drawer closed: nothing to say here, the inbox has it.
      if (ctl.signal.aborted) return;
      if (job.current) { unwatchJob(job.current, qc); job.current = ''; }
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(`That file could not be read: ${msg}. Fill the form in by hand.`);
      // The automatic path just failed, so the manual one stops being optional.
      onManualOpenChange(true);
    } finally {
      setReading(false);
    }
  }

  /** After a failure the scan shrinks to one retry. It has just proved it does
   *  not work for this document; offering three big buttons again would be
   *  arguing with the person. */
  const collapsed = !!error && !reading;

  const chosen = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';                 // so the same file can be picked twice
    void run(file);
  };

  return (
    <>
      <input ref={pick} type="file" hidden accept={ACCEPT} disabled={reading}
             aria-label="Read a deed or passbook"
             onChange={(e) => chosen(e.currentTarget)} />
      {/* Rendered only where a camera is actually behind it. A dead second
          file input on a laptop is one more thing for a screen reader to
          announce and one more thing for a test to have to disambiguate. */}
      {camera && (
        <input ref={shoot} type="file" hidden accept="image/*" capture="environment"
               aria-label="Photograph a deed or passbook"
               disabled={reading} onChange={(e) => chosen(e.currentTarget)} />
      )}

      <div
        className={`scanbox${over ? ' over' : ''}${collapsed ? ' bad' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!reading) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void run(e.dataTransfer.files?.[0]);
        }}
      >
        {collapsed ? (
          <>
            <p className="scanhead bad">
              <ErrorOutlineOutlined sx={{ fontSize: 17 }} aria-hidden />
              The deed couldn&rsquo;t be read
            </p>
            <p className="note" style={{ margin: 0 }}>{error}</p>
            <button type="button" className="btn sm"
                    onClick={() => { setError(''); pick.current?.click(); }}>
              <RefreshOutlined sx={{ fontSize: 15 }} aria-hidden /> Try another file
            </button>
          </>
        ) : (
          <>
            <p className="scanhead">
              <DocumentScannerOutlined sx={{ fontSize: 17 }} aria-hidden />
              Start from the paper
            </p>
            <div className="row tight">
              <button type="button" className="btn primary sm" disabled={reading}
                      onClick={() => pick.current?.click()}>
                <UploadFileOutlined sx={{ fontSize: 15 }} aria-hidden />
                {reading ? 'Reading…' : 'Choose a file'}
              </button>
              {camera && (
                <button type="button" className="btn sm" disabled={reading}
                        onClick={() => shoot.current?.click()}>
                  <PhotoCameraOutlined sx={{ fontSize: 15 }} aria-hidden /> Take a photo
                </button>
              )}
              <span className="note">PDF or photo, up to {mb(MAX_UPLOAD_BYTES)}</span>
            </div>
            {reading ? (
              <p className="scanwait" role="status">
                <span className="spin" aria-hidden />
                <span>Reading the deed… {elapsed}s</span>
                <span className="note" style={{ display: 'block' }}>
                  You can close this. The bell will tell you when it&rsquo;s read.
                </span>
              </p>
            ) : (
              <p className="note dropline" aria-hidden>or drop it here</p>
            )}
          </>
        )}
      </div>

      {/* What was read, in words, before a single box is checked. */}
      {got && (got.summary || got.found.length > 0) && (
        <div className="readout">
          <p className="scanhead" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TextSnippetOutlined sx={{ fontSize: 17 }} aria-hidden />
            <span>What this document says</span>
            {/* The reader is a paid service; this is the one place an owner can
                see what THIS read cost, in tokens and dollars, without leaving
                the flow. Absent when the server did not report a cost (an older
                reading, or the Aadhaar path, which never surfaces it). */}
            {got.usage && (
              <IconButton
                size="small"
                aria-label="What this reading cost"
                aria-haspopup="dialog"
                onClick={(e) => setCostAnchor(e.currentTarget)}
                sx={{ ml: 'auto', p: 0.25 }}
              >
                <InfoOutlined sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </p>
          {got.summary && (
            <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.55 }}>{got.summary}</p>
          )}
          {got.caveats.length > 0 && (
            <div className="caveats">
              <p className="eyebrow" style={{ margin: 0 }}>Worth checking yourself</p>
              <ul>{got.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
          <p className="note" style={{ margin: 0 }}>
            {got.found.length > 0
              ? `Filled from ${got.name}: ${got.found.join(', ')}. Read by AI; check before saving.`
              : 'Nothing new found in that file.'}
          </p>
          {got.usage && (
            <Popover
              open={!!costAnchor}
              anchorEl={costAnchor}
              onClose={() => setCostAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <CostBreakdown usage={got.usage} />
            </Popover>
          )}
        </div>
      )}

      {manualOpen ? (
        <p className="orrule">
          <span>{got ? 'check and correct' : 'enter by hand'}</span>
        </p>
      ) : (
        // Two quiet links, not a second primary action competing with the
        // scan: typing it in, or finding the plot's shape on Cadastral maps.
        <div className="row tight">
          <button type="button" className="linkbtn" onClick={() => onManualOpenChange(true)}>
            Enter the details by hand instead
          </button>
          <span className="note" aria-hidden>·</span>
          <button type="button" className="linkbtn" onClick={onPickFromMap}>
            Pick it from the map instead
          </button>
        </div>
      )}
    </>
  );
}

/** The cost of one reading, shown on demand from the info icon.
 *
 *  Two truths sit side by side here, which is what the owner asked to see:
 *  the tokens (what the model actually processed) and the dollars (what that
 *  costs at list price). The dollar figure is deliberately labelled as an
 *  estimate at list price — it is the provider's published rate before any
 *  margin, not a bill — so the number never reads as more precise than it is.
 *
 *  Cache lines only appear when there is a cache figure to show. A first read
 *  of a document type writes the cache (cache_write > 0); a second read of the
 *  same type reads it back (cache_read > 0) and costs a fraction — showing the
 *  breakdown is how an owner can see that saving happen. */
function CostBreakdown({ usage }: { usage: ReadingUsage }) {
  const n = (v: number) => v.toLocaleString('en-IN');
  // Four decimals matches the server's rounding; a fraction of a cent still
  // reads honestly as "less than a cent" rather than "$0.00".
  const usd = usage.usd > 0
    ? (usage.usd < 0.01 ? '< $0.01' : `$${usage.usd.toFixed(4)}`)
    : null;
  const rows: Array<[string, string]> = [
    ['Read in', `${n(usage.inputTokens)} tokens`],
    ['Written out', `${n(usage.outputTokens)} tokens`],
  ];
  if (usage.cacheReadTokens > 0) rows.push(['Reused from cache', `${n(usage.cacheReadTokens)} tokens`]);
  if (usage.cacheWriteTokens > 0) rows.push(['Cached for next time', `${n(usage.cacheWriteTokens)} tokens`]);

  return (
    <div style={{ padding: '12px 14px', maxWidth: 300, fontSize: '0.8125rem', lineHeight: 1.5 }}>
      <p className="eyebrow" style={{ margin: '0 0 6px' }}>What this reading cost</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              {/* `var(--muted, …)` named a token that has never existed, so this
                  always rendered its fallback: a cool #6b7280 in a warm system,
                  identical in all three schemes — mid grey where High Contrast
                  owes secondary text #171717. `--w-ink-2` is this surface's
                  secondary ink and follows the scheme. */}
              <td style={{ paddingRight: 12, color: 'var(--w-ink-2)', whiteSpace: 'nowrap' }}>{label}</td>
              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</td>
            </tr>
          ))}
          {usd && (
            <tr>
              <td style={{ paddingRight: 12, paddingTop: 6, fontWeight: 700 }}>Estimated cost</td>
              <td style={{ textAlign: 'right', paddingTop: 6, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{usd}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="note" style={{ margin: '8px 0 0' }}>
        {usd
          ? `Estimate at ${usage.model} list price.`
          : `No list price on file for ${usage.model}.`}
      </p>
    </div>
  );
}
