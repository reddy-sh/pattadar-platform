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
import DocumentScannerOutlined from '@mui/icons-material/DocumentScannerOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import TextSnippetOutlined from '@mui/icons-material/TextSnippetOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

import { readDocument } from '../pages/documents/upload';
import type { Reading } from '../pages/documents/upload';
import { MAX_UPLOAD_BYTES, mb } from './filePhotos';

/** What the reader made of the file, and the file itself.
 *
 *  The file travels with the reading on purpose. A record created from a
 *  scanned deed that then threw the deed away was the bug on the phone too:
 *  the holding reported "No documents attached yet" about the very document it
 *  had been made from, and the summary that had just been shown was gone. The
 *  caller keeps this so it can FILE the paper against the record it creates. */
export interface DeedRead {
  file: File;
  reading: Reading;
}

const ACCEPT = 'image/*,application/pdf';

/** Only worth offering where there is a camera behind the file picker. On a
 *  desktop the `capture` attribute is ignored and the button would be a second
 *  door to the same file dialog. */
const hasCamera = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches;

export function ScanFirst({ manualOpen, onManualOpenChange, onRead, onPickFromMap }: {
  /** Whether the caller is currently showing the hand-entry form. */
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  /** Hands the caller the reading to fill its form from. Returns the plain
   *  words for what it actually filled, so this card can say so. */
  onRead: (read: DeedRead) => string[];
  /** The third way in: leave the drawer for Village Maps, where the plot is
   *  found by its shape rather than read or typed. */
  onPickFromMap: () => void;
}) {
  const [reading, setReading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [got, setGot] = useState<
    { name: string; found: string[]; summary: string; caveats: string[] } | null
  >(null);
  const pick = useRef<HTMLInputElement>(null);
  const shoot = useRef<HTMLInputElement>(null);
  const [camera] = useState(hasCamera);

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

  async function run(file: File | undefined) {
    if (!file || reading) return;
    setError('');
    setGot(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      // Said before the wait, not after it.
      setError(`${file.name} is ${mb(file.size)}. The limit is ${mb(MAX_UPLOAD_BYTES)}.`);
      onManualOpenChange(true);
      return;
    }
    setReading(true);
    try {
      const r = await readDocument(file, file.name);
      const f = r.fields as Record<string, unknown>;
      const found = onRead({ file, reading: r });
      setGot({
        name: file.name,
        found,
        summary: String(f.summary ?? '').trim(),
        caveats: Array.isArray(f.caveats)
          ? (f.caveats as unknown[]).map((c) => String(c).trim()).filter(Boolean)
          : [],
      });
      onManualOpenChange(true);   // the filled form is the next thing to check
    } catch {
      setError('That file could not be read. Fill the form in by hand.');
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
            <p className="note" style={{ margin: 0 }}>
              Upload the sale deed or the passbook — the survey number, khata,
              owner, village and extent are read from it and filled in below for
              you to check.
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
                <span>
                  Reading the deed… {elapsed}s
                  {elapsed > 8 && (
                    <span className="note" style={{ display: 'block' }}>
                      This usually takes under a minute. Leave it open — the
                      boxes fill themselves in when it is done.
                    </span>
                  )}
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
          <p className="scanhead">
            <TextSnippetOutlined sx={{ fontSize: 17 }} aria-hidden />
            What this document says
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
              ? `From ${got.name}: filled the ${got.found.join(', ')}. Read by AI — check each one against the paper before you save.`
              : 'Nothing new was found in that file — the boxes already hold what it says.'}
          </p>
        </div>
      )}

      {manualOpen ? (
        <p className="orrule">
          <span>{got ? 'check and correct' : 'enter by hand'}</span>
        </p>
      ) : (
        // Two quiet links, not a second primary action competing with the
        // scan: typing it in, or finding the plot's shape on Village Maps.
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
