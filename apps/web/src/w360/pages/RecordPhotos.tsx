/** W05 + W14 — photos as dated evidence, not decoration.
 *
 *  One screen, two right-hand panels. Scoped to the record it is the gallery:
 *  metadata, caption, tags, cover choice and file actions. Scoped to a
 *  feature (`?feature=`) it becomes the provenance panel: why this photo is of
 *  THAT bore, and what a forwarded picture can and cannot be used for.
 *
 *  The delete copy is not a generic confirm. It names what the photo is doing
 *  elsewhere, because W14's point is that one file is referenced three times
 *  and removing it from one place does not remove it from the others. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import FullscreenOutlined from '@mui/icons-material/FullscreenOutlined';
import FullscreenExitOutlined from '@mui/icons-material/FullscreenExitOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import FingerprintOutlined from '@mui/icons-material/FingerprintOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import CompareArrowsOutlined from '@mui/icons-material/CompareArrowsOutlined';
import SwapHorizOutlined from '@mui/icons-material/SwapHorizOutlined';

import { checkPhotoOnRecord, formatDistance } from '@pattadar/core';

import {
  useDeletePhoto, usePhotos, useSetCoverPhoto, useSetTag, useUpdateCaption,
} from '../api';
import type { Photo, RecordDetail } from '../api';
import { useExif } from '../photoExif';
import type { ExifData } from '../exifGeo';
import {
  Card, Empty, Failed, Icon, KV, Loading, Menu, PhotoImg, VideoThumb, Tag, ddmmyyyy, plural,
  useFullscreen, useNarrow,
} from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useToast } from '../Toast';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { ConfirmDialog } from './PropertyActions';
import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, limitFor, mediaKindOf, mb, useFilePhotos } from '../filePhotos';
import { downloadBlob, fetchFileBlob, isStorageRef } from '../../pages/documents/storage';
import { uniqueNames, zipStore } from '../../lib/zip';

/** '2026-08-12 07:41 IST' → '12/08/2026 07:41 IST'. A capture stamp is
 *  evidence and is read in the same order as every other date here. */
const stamp = (s: string) => {
  if (!s) return '';
  const tail = s.slice(10).replace(/^T/, ' ').replace(/Z$/, ' UTC');
  return `${ddmmyyyy(s.slice(0, 10))}${tail}`;
};

const MAX_MEDIA_ARCHIVE_BYTES = 1024 * 1024 * 1024;

function mediaArchiveName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `pattadar-media-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
}

/** Is this row a video? By its stored media_kind OR its filename extension.
 *  The extension fallback matters for clips filed before the upload learned to
 *  tag them — a transferred .mp4 with an empty MIME landed as 'photo' and drew
 *  as a frozen frame with no player. This makes those play too. */
const isVideoRow = (p: { mediaKind: string; fileName: string }): boolean =>
  p.mediaKind === 'video' || /\.(mp4|mov|webm|m4v|3gp)$/i.test(p.fileName || '');
const isAudioRow = (p: { mediaKind: string; fileName: string }): boolean =>
  p.mediaKind === 'audio' || /\.(mp3|m4a|aac|wav|ogg|oga|opus)$/i.test(p.fileName || '');
const mediaKindOfRow = (p: { mediaKind: string; fileName: string }): 'photo' | 'video' | 'audio' =>
  isVideoRow(p) ? 'video' : isAudioRow(p) ? 'audio' : 'photo';

/** One word per kind, everywhere on this tab: photo, video, recording. Audio
 *  had four (Recordings, Recording, Audio, Audio recording). */
const kindWord = (p: { mediaKind: string; fileName: string }): string => (
  { photo: 'photo', video: 'video', audio: 'recording' }[mediaKindOfRow(p)]);
const KindWord = (p: { mediaKind: string; fileName: string }): string => {
  const w = kindWord(p);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/** Where a photo says it was taken: the file's own GPS, or — when the file
 *  carries none — the point saved with the row. The Location check and the
 *  provenance drawing read the same point, so the two can never disagree. */
function photoPoint(p: Photo, exif: ExifData | null): { latitude: number; longitude: number; from: 'file' | 'row' } | null {
  if (exif?.gps) return { ...exif.gps, from: 'file' };
  if (p.lat || p.lon) return { latitude: p.lat, longitude: p.lon, from: 'row' };
  return null;
}

/** The record's own point for the check: its pin, when it has one. */
const recordPoint = (rec: RecordDetail) => ((rec.lat || rec.lon)
  ? { latitude: rec.lat, longitude: rec.lon } : null);

/** `subject` arrives already defaulted, so nothing here re-implements the
 *  fallback. `named` says whether the feature actually carries a label: a
 *  headline reading "Why this is this feature" is worse than none, so an
 *  unlabelled feature gets the generic headline instead. */
/** The record's location as core's LatLng, from its pin or the average of its
 *  ring. Null when the record has neither — then nothing can be checked. */
function ringPairs(ring: number[]): { latitude: number; longitude: number }[] {
  const out = [];
  for (let i = 0; i + 1 < ring.length; i += 2) out.push({ latitude: ring[i], longitude: ring[i + 1] });
  return out;
}

/** The LIVE location fact-check: parse the photo's own GPS from the file
 *  (exif), compare it to the record's ring/pin, and state the verdict. Nothing
 *  is stored — the check is computed here each time from the file and the
 *  record's current location, so a corrected pin makes it right with no
 *  backfill. `exif` is the parsed metadata (or null while loading / when the
 *  file carries none). */
/** The words for a check's verdict, shared by the Location check below and
 *  the provenance drawing, so "inside" is decided in one place. With a saved
 *  ring the photo is tested for containment; with only a pin, for distance
 *  from it (core's checkPhotoOnRecord). */
function verdictWord(status: string, hasRing: boolean): string {
  if (status === 'unknown') return 'Not checked';
  if (hasRing) {
    return status === 'inside' ? 'Inside the boundary'
      : status === 'near' ? 'Just outside the boundary'
      : 'Outside the boundary';
  }
  return status === 'inside' ? 'Near the saved pin' : 'Far from the saved pin';
}

function PhotoGeoCheckBlock({ rec, p, exif, loading }: {
  rec: RecordDetail; p: Photo; exif: ExifData | null; loading: boolean;
}) {
  const recPoint = recordPoint(rec);
  const hasRing = rec.ring.length >= 6;
  // The file's own GPS, or the row's saved point when the file has none — a
  // photo whose coordinates are printed on its stamp used to read "Photo GPS
  // N/A" here because only the file was asked.
  const at = photoPoint(p, exif);
  const check = checkPhotoOnRecord(at, recPoint, ringPairs(rec.ring));
  const km = check.distanceM / 1000;

  // "Not checked" for a check that could not run, "not set" for a value the
  // record does not hold — never "N/A", which stood for both and for "does
  // not apply" besides.
  const status = loading && !at ? 'Checking…'
    : check.status === 'unknown' ? 'Not checked'
    : check.suspect ? 'Failed'
    : 'Passed';
  const content = (
    <KV rows={[
      { k: 'Status', v: status },
      { k: 'Photo location', v: at
          ? `${at.latitude.toFixed(5)}, ${at.longitude.toFixed(5)}`
            + (at.from === 'file' ? ' · from the file' : ' · saved with the photo')
          : 'not set' },
      { k: 'Checked against', v: hasRing ? 'Saved boundary' : recPoint ? 'Saved pin' : 'not set' },
      { k: 'Distance', v: check.status === 'unknown' ? 'Not checked'
          : `${formatDistance(km)} from ${recPoint ? 'the saved pin' : 'the middle of the boundary'}` },
      { k: 'Result', v: verdictWord(check.status, hasRing) },
    ]} />
  );
  return (
    <>
      <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Location check</p>
      {check.suspect ? <div className="card alert">{content}</div> : content}
    </>
  );
}

/** What the camera recorded, read live off the file. A curated set of the
 *  fields worth reading on a land photo — the real shutter time, the camera,
 *  altitude and which way it faced, and the software (an edit signal) — with
 *  every other tag under an expandable "All metadata". Nothing here is stored;
 *  it is the file's own claim, shown so a person can judge it. */
function PhotoMetadata({ exif, loading, unsupported }: { exif: ExifData | null; loading: boolean; unsupported?: boolean }) {
  const [open, setOpen] = useState(false);
  if (loading) {
    return (
      <>
        <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Metadata</p>
        <p className="note" style={{ marginTop: 'var(--space-xs)', color: 'var(--w-ink-3)' }}>
          Reading the file…
        </p>
      </>
    );
  }
  if (unsupported) {
    return (
      <>
        <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Metadata</p>
        <p className="note" style={{ marginTop: 'var(--space-xs)', color: 'var(--w-ink-3)' }}>
          Metadata cannot be read for this format.
        </p>
      </>
    );
  }
  if (!exif) return null;
  const rawKeys = Object.keys(exif.raw);
  const rows: { k: string; v: string }[] = [];
  if (exif.capturedAt) rows.push({ k: 'Taken', v: exif.capturedAt });
  if (exif.make || exif.model) rows.push({ k: 'Camera', v: [exif.make, exif.model].filter(Boolean).join(' ') });
  if (exif.lens) rows.push({ k: 'Lens', v: exif.lens });
  if (exif.gps) rows.push({ k: 'GPS', v: `${exif.gps.latitude.toFixed(5)}, ${exif.gps.longitude.toFixed(5)}` });
  if (exif.altitudeM !== null) rows.push({ k: 'Altitude', v: `${Math.round(exif.altitudeM)} m` });
  if (exif.imgDirection !== null) rows.push({ k: 'Facing', v: `${Math.round(exif.imgDirection)}°` });
  if (exif.width && exif.height) rows.push({ k: 'Pixels', v: `${exif.width} × ${exif.height}` });
  if (exif.software) rows.push({ k: 'Software', v: exif.software });

  const edited = /photoshop|lightroom|gimp|snapseed|pixlr|affinity/i.test(exif.software);

  return (
    <>
      <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Metadata</p>
      {rows.length === 0 ? (
        <p className="note" style={{ marginTop: 'var(--space-xs)', color: 'var(--w-ink-3)' }}>
          No readable metadata.
        </p>
      ) : (
        <>
          {edited && (
            <p className="note" style={{ marginTop: 'var(--space-xs)', color: 'var(--w-warn)' }}>
              Edited with {exif.software}.
            </p>
          )}
          <KV rows={rows} />
          {rawKeys.length > rows.length && (
            <>
              <button type="button" className="linkbtn" style={{ marginTop: 'var(--space-xs)' }}
                      onClick={() => setOpen((v) => !v)}>
                {open ? 'Hide' : `All metadata (${rawKeys.length} fields)`}
              </button>
              {open && (
                <div className="card" style={{ padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}>
                  {rawKeys.map((k) => (
                    <div key={k} className="row" style={{ gap: 'var(--space-sm)', fontSize: '0.6875rem' }}>
                      <span className="mono note" style={{ flex: '0 0 40%', minWidth: 0, wordBreak: 'break-word' }}>{k}</span>
                      <span className="mono" style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{String(exif.raw[k])}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

/** This parcel's saved ring, its pin and the photo's point, drawn to scale.
 *
 *  It used to be one fixed polygon and two fixed dots that were not this
 *  parcel, captioned "inside the boundary" for every verified photo whatever
 *  the distance. Now it draws only what the record and the photo actually say
 *  (nothing is drawn when neither has a point), and the caption is the same
 *  verdict the Location check gives. */
function WhereDrawing({ rec, at, verdict, km }: {
  rec: RecordDetail;
  at: { latitude: number; longitude: number };
  verdict: string;
  km: number | null;
}) {
  const ring = ringPairs(rec.ring);
  const pin = recordPoint(rec);
  const pts = [...ring, at, ...(pin ? [pin] : [])];
  // Equirectangular with the longitude squeezed by cos(latitude): at this
  // scale (a parcel, a few hundred metres) that is the shape as walked.
  const lat0 = pts.reduce((s, q) => s + q.latitude, 0) / pts.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((q) => q.longitude * kx);
  const ys = pts.map((q) => q.latitude);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 0.0005;
  const W = 100; const H = 46; const pad = 6;
  const scale = Math.min((W - 2 * pad) / span, (H - 2 * pad - 6) / span);
  const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
  const x = (q: { longitude: number }) => W / 2 + (q.longitude * kx - cx) * scale;
  const y = (q: { latitude: number }) => (H - 6) / 2 - (q.latitude - cy) * scale;
  const where = [verdict, km !== null ? `${formatDistance(km)} from ${pin ? 'the saved pin' : 'the middle of the boundary'}` : '']
    .filter(Boolean).join(' · ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', background: 'var(--w-surface-2)' }}
         role="img" aria-label={`Where the photo was taken: ${where}`}>
      {ring.length >= 3 && (
        <polygon points={ring.map((q) => `${x(q)},${y(q)}`).join(' ')}
                 fill="none" stroke="var(--w-ink-3)" strokeWidth="0.5" />
      )}
      {pin && <circle cx={x(pin)} cy={y(pin)} r="1.7" fill="var(--w-info)" />}
      <circle cx={x(at)} cy={y(at)} r="1.7" fill="var(--w-accent)" />
      <text x={W / 2} y={H - 2} fontSize="2.4" textAnchor="middle" fill="var(--w-ink-2)">{where}</text>
    </svg>
  );
}

function Provenance({ p, rec, exif, subject, named }: {
  p: Photo; rec: RecordDetail; exif: ExifData | null; subject: string; named: boolean;
}) {
  // Only the claims that hold are printed, each in words; a photo with no
  // order no longer reads "Came in on order , a paid site visit". Two claims
  // are gone because nothing behind them is recorded: an uploader's role and
  // an "ID verified" (the row carries a name and nothing else), and "paid"
  // (no payment moves while the provider is a stub — design.md § App
  // vocabulary). A file hash proves the file is unchanged since it was
  // filed, which is what it now says.
  const claims = ([
    [PhotoCameraOutlined, 'Shot in the Pattadar app, not picked from a gallery', p.source === 'app'],
    [AccessTimeOutlined, "The device clock matched Pattadar's server", p.deviceClockOk],
    [FingerprintOutlined, `Unchanged since it was filed · sha256 ${p.sha256.slice(0, 4)}…${p.sha256.slice(-4)}`, !!p.sha256],
    [PersonOutlined, `Taken by ${p.capturedBy}`, !!p.capturedBy],
    [ReceiptLongOutlined, `Came in on service order ${p.orderRef}`, !!p.orderRef],
  ] as const).filter(([, , holds]) => holds);

  const at = photoPoint(p, exif);
  const check = at ? checkPhotoOnRecord(at, recordPoint(rec), ringPairs(rec.ring)) : null;

  return (
    <>
      <p className="eyebrow">Source of truth</p>
      <h2 style={{ fontSize: '1.375rem', marginBottom: 'var(--space-md)' }}>
        Why this is {named ? subject : 'evidence'}
      </h2>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--space-md)' }}>
        {!p.verified ? (
          /* This used to read "carries no location of its own", which the frame
             beside it contradicts: a forwarded photo can still carry a lat/lon
             and the stage prints it. What is actually missing is the check —
             nothing compared those coordinates against the saved pin. */
          <p className="note" style={{ padding: 'var(--space-md)', color: 'var(--w-ink-2)' }}>
            {/* Where it came from only when the row says so: a photo shot in
                the app can still be unchecked (no location, or a pin to
                check it against), and "not shot in the app" would be false. */}
            {p.source === 'forwarded' ? 'Forwarded, not shot here. '
              : p.source === 'app' ? '' : 'Not shot in the app. '}
            Not checked against the saved pin.
          </p>
        ) : at && check && check.status !== 'unknown' ? (
          <WhereDrawing rec={rec} at={at}
                        verdict={verdictWord(check.status, rec.ring.length >= 6)}
                        km={check.distanceM / 1000} />
        ) : (
          <p className="note" style={{ padding: 'var(--space-md)', color: 'var(--w-ink-2)' }}>
            {at ? 'This property has no saved boundary or pin to check the photo against.'
              : 'The photo carries no location to check.'}
          </p>
        )}
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 'var(--space-md)' }}>
        {claims.length === 0 ? (
          <p className="note" style={{ padding: 'var(--space-md)', color: 'var(--w-ink-2)' }}>
            Nothing about how this was taken has been recorded.
          </p>
        ) : (
          <div className="checks">
            {claims.map(([I, label]) => (
              <div key={label}>
                <span style={{ display: 'flex', color: 'var(--w-ok)' }}>
                  <I sx={{ fontSize: 16 }} aria-hidden />
                </span>
                <span className="mono" style={{ fontSize: '0.75rem' }}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Adding photographs, in the drawer every hanger now uses.
 *
 * As with Papers, there was no panel here: the header's "Add photos or video"
 * clicked a hidden file input and whatever came back was uploaded and filed
 * immediately, with `caption: ''` hard-coded — so every photograph filed from
 * the web arrived unlabelled, and captioning a visit meant paging the gallery
 * and typing into each one afterwards.
 *
 * So the drawer asks the one question worth asking before the bytes go: what
 * these show. It is written onto every file in the pick, because a pick is
 * almost always one visit.
 *
 * The panel also says what a photograph added this way IS. The gallery's
 * provenance panel is emphatic that a file which did not come through the app's
 * own camera is the sender's word and not evidence, and the moment to say that
 * is while somebody is choosing files from a folder — not afterwards, on the
 * card, under a heading they may never open.
 */
function PhotoDrawer({
  recordTitle, seed, busy, err, onFile, onClose, clearError, returnFocus,
}: {
  recordTitle: string;
  /** Files already chosen — a drop onto one of the empty state's tiles opens
   *  this panel with them in hand rather than throwing the drop away. */
  seed: File[];
  busy: boolean;
  err: string;
  onFile: (files: File[], caption: string) => Promise<void>;
  onClose: () => void;
  clearError: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const [picked, setPicked] = useState<File[]>(seed);
  const [caption, setCaption] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const sent = useRef(false);

  const tooBig = picked.filter((f) => f.size > limitFor(f));
  const ready = picked.length > 0 && tooBig.length === 0 && !busy;
  const videos = picked.filter((f) => mediaKindOf(f) === 'video').length;
  const recordings = picked.filter((f) => mediaKindOf(f) === 'audio').length;

  /** Added to what is already here, and de-duplicated on name and size: a
   *  second pick that silently replaced the first is how half a site visit goes
   *  missing when the photographs are in two folders. */
  const take = (files: File[]) => {
    if (!files.length) return;
    clearError();
    setPicked((have) => [
      ...have,
      ...files.filter((f) => !have.some((h) => h.name === f.name && h.size === f.size)),
    ]);
  };

  /** The upload reports failure through `err`, which belongs to the hook in the
   *  parent — it owns `lastAdded`, which is what walks the gallery to the new
   *  photograph. So this waits for the write to finish and then closes only if
   *  nothing was said about it. */
  const file = async () => {
    if (!ready) return;
    sent.current = true;
    await onFile(picked, caption.trim());
  };

  // `err` arrives after the await above has already returned, so the close has
  // to be decided here rather than inline.
  useEffect(() => {
    if (sent.current && !busy) {
      if (!err) onClose();
      else sent.current = false;
    }
  }, [busy, err, onClose]);

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Media')}
      title={picked.length > 1 ? `Add ${picked.length} files` : 'Add photos, video or audio'}
      onClose={onClose}
      onSubmit={() => void file()}
      busy={busy}
      dirty={picked.length > 0}
      discardCopy={{
        title: 'Discard this pick?',
        body: 'The files you picked will not be uploaded.',
      }}
      initialFocus=".scanbox button"
      returnFocus={returnFocus}
      primary={(
        <DrawerAction
          label={picked.length > 1 ? `Add ${picked.length} files` : 'Add it'}
          working="Uploading…"
          pending={busy}
          disabled={!ready}
        />
      )}
    >
      <input
        ref={input}
        type="file" hidden multiple accept="image/*,video/*,audio/*"
        aria-label="Upload media"
        onChange={(e) => {
          // Copy before clearing: resetting value empties the live FileList this
          // would otherwise still point at, and the reset is what lets the same
          // file be picked twice in a row.
          const next = Array.from(e.target.files ?? []);
          e.target.value = '';
          take(next);
        }}
      />

      <div
        className="scanbox"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
        onDragLeave={(e) => e.currentTarget.classList.remove('over')}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('over');
          take(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        <p className="scanhead">
          <PhotoCameraOutlined sx={{ fontSize: 18 }} aria-hidden />
          Drop the media files here
        </p>
        <p className="dropline">
          Photos up to {mb(MAX_UPLOAD_BYTES)}; videos and audio up to {mb(MAX_VIDEO_BYTES)}.
        </p>
        <div className="row tight">
          <button type="button" className="btn" onClick={() => input.current?.click()}>
            Browse files
          </button>
        </div>
      </div>

      {picked.length > 0 && (
        <div className="field">
          <label>
            What you picked
            {videos > 0 && ` · ${videos} ${videos === 1 ? 'video' : 'videos'}`}
            {recordings > 0 && ` · ${recordings} ${recordings === 1 ? 'recording' : 'recordings'}`}
          </label>
          <div className="card" style={{ padding: 0 }}>
            <div className="rows boxed">
              {picked.map((f) => {
                const over = f.size > limitFor(f);
                return (
                  <div key={`${f.name}-${f.size}`}>
                    <span style={{ display: 'flex', color: over ? 'var(--w-danger)' : 'var(--w-ink-3)' }}>
                      <Icon name={f.type.startsWith('video/') ? 'video' : 'photos'} size={17} />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.875rem', overflowWrap: 'anywhere' }}>
                        {f.name}
                      </span>
                      <span className="note mono" style={{ display: 'block', fontSize: '0.6875rem' }}>
                        {mb(f.size)}{over && ` · over the ${mb(limitFor(f))} limit`}
                      </span>
                    </span>
                    <button type="button" className="iconbtn" aria-label={`Take ${f.name} out`}
                            disabled={busy}
                            onClick={() => setPicked((have) => have.filter((h) => h !== f))}>
                      <CloseOutlined sx={{ fontSize: 16 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {/* The whole pick is refused rather than part-filed. Picking five with
              an oversize third used to file the first two and then say "nothing
              was uploaded", so the owner picked all five again and filed two of
              them twice. */}
          {tooBig.length > 0 && (
            <span className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
              Remove {tooBig.length > 1 ? 'those' : 'that one'} to upload the rest.
            </span>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="ph-cap">What these show</label>
        <input id="ph-cap" type="text" value={caption}
               placeholder="North bund after the rain"
               onChange={(e) => setCaption(e.target.value)} />
      </div>

      <p className="note" style={{ margin: 0 }}>
        Files added from a folder are not verified against the pin.
      </p>

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
  );
}

/** Two filed items side by side. The rail chooses the RIGHT side; Swap makes
 * the comparison direction explicit. Photos, videos and audio all use their
 * normal renderer, so Compare never invents a second playback path. */
function CompareMedia({ items, left, right, onRight, onSwap }: {
  items: Photo[]; left: Photo; right: Photo;
  onRight: (item: Photo) => void; onSwap: () => void;
}) {
  const pane = (item: Photo, side: 'Left' | 'Right') => (
    <section className="compare-pane">
      <p className="eyebrow">{side} · {ddmmyyyy(item.capturedAt.slice(0, 10))}</p>
      <h3>{item.caption || 'Untitled'}</h3>
      <div className="compare-frame">
        <PhotoImg fileRef={item.fileRef} kind={mediaKindOfRow(item)} alt={item.caption}
          thumb={1024} fallback={<Icon name={mediaKindOfRow(item)} size={30} />} />
      </div>
    </section>
  );
  return (
    <div className="media-compare">
      <aside className="compare-rail" aria-label="Choose the right comparison item">
        <p className="eyebrow">Choose right side</p>
        {items.map((item) => (
          <button key={item.id} type="button" className="compare-choice"
                  aria-pressed={item.id === right.id} disabled={item.id === left.id}
                  onClick={() => onRight(item)}>
            <span>{item.caption || 'Untitled'}</span>
            <small>{item.fileName || 'not set'} · {ddmmyyyy(item.capturedAt.slice(0, 10)) || 'not set'}</small>
          </button>
        ))}
      </aside>
      <div className="compare-main">
        <div className="row tight compare-head">
          <strong>Comparing two items</strong>
          <button type="button" className="btn sm" onClick={onSwap}>
            <SwapHorizOutlined sx={{ fontSize: 15 }} /> Swap sides
          </button>
        </div>
        <div className="compare-grid">{pane(left, 'Left')}{pane(right, 'Right')}</div>
      </div>
    </div>
  );
}

export function RecordPhotos() {
  const { id } = useParams();
  const rec = useRecordCtx();
  const [params] = useSearchParams();
  const featureId = params.get('feature') ?? undefined;
  const { data, isLoading, error } = usePhotos(id, featureId);
  const save = useUpdateCaption();
  const delPhoto = useDeletePhoto();
  const cover = useSetCoverPhoto();
  const setTag = useSetTag();
  const toast = useToast();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** The single delete's own answer, printed inside its confirmation. */
  const [delErr, setDelErr] = useState('');
  /** On a phone the head keeps one filled action; Select, Compare and the
   *  search move into its menu, and the search opens under the chips. */
  const narrow = useNarrow(640);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDownload, setBulkDownload] = useState<{ done: number; total: number } | null>(null);
  const [i, setI] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const [caption, setCaption] = useState('');
  const [q, setQ] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'photo' | 'video' | 'audio'>('all');
  // A download of a multi-megabyte original is a fetch that can refuse — an
  // expired token, a 404, a gateway that is down — and it used to refuse into
  // the console. Both halves of that are visible now.
  const [dlErr, setDlErr] = useState('');
  const [dling, setDling] = useState(false);
  // The advisory about unproven photos is an alert the owner can acknowledge,
  // not a setting, so it clears for this visit to the screen and comes back on
  // the next one — nothing is written to say "I have read this".
  const [dismissedUnproven, setDismissedUnproven] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagText, setTagText] = useState('');
  const tagCancelled = useRef(false);
  const tagTrigger = useRef<HTMLButtonElement>(null);
  const captionSent = useRef('');
  const [actionErr, setActionErr] = useState('');
  // Not add.isPending: the bytes go up before the mutation starts, and that
  // POST is the slow half. A flag spanning both is what the progress line needs.
  const {
    file: onPick, busy, err, lastAdded, clearLastAdded, clearError,
  } = useFilePhotos(id);
  const currentThumb = useRef<HTMLButtonElement>(null);
  // Theater view: the stage goes edge-to-edge through the browser's own
  // Fullscreen API, so it is truly full-window (past the app chrome) and Esc
  // exits it the way people already expect a full-screen photo to. `theater`
  // tracks the browser's state rather than our intent, so pressing Esc or the
  // OS control keeps the button's label honest. The shared hook (ui.tsx) also
  // serves the combined map's stage; the stage carries a class while it is the
  // fullscreen element so it can paint itself as a theater, not a padded panel.
  const {
    ref: stageRef, on: theater, toggle: toggleTheater, supported: canTheater,
  } = useFullscreen<HTMLDivElement>();
  // Null while closed; an array — usually empty, or the files a drop arrived
  // with — while the drawer is open. The hidden input and the pick itself live
  // in PhotoDrawer now; what stays here is the hook, because it owns `lastAdded`
  // and that is what walks the gallery to the photograph that just landed.
  const [adding, setAdding] = useState<File[] | null>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  // The caption the user is typing, tagged with the photo it belongs to. The
  // index can move out from under a focused caption box — an upload lands, the
  // strip jumps — and the blur that followed compared the draft against the
  // NEW photo, found them different from nothing, and saved nothing. Holding
  // the id with the text is what lets the flush below save it to the right row.
  const draft = useRef<{ id: string; caption: string } | null>(null);

  const photos = data?.photos ?? [];
  const photoCount = photos.filter((item) => mediaKindOfRow(item) === 'photo').length;
  const videoCount = photos.filter(isVideoRow).length;
  const audioCount = photos.filter(isAudioRow).length;
  const selectedItems = photos.filter((item) => selected.has(item.id));
  // Filter into a second list rather than in place: `i` indexes whatever the
  // strip and stage show. Type and text filters compose; neither changes data.
  //
  // A kind with nothing in it has no chip (as on Site features), so a filter
  // left on one — the last video deleted — stops filtering rather than
  // emptying the stage with no chip on screen to release it.
  const kindCount = { all: photos.length, photo: photoCount, video: videoCount, audio: audioCount };
  const kindFilter = kindCount[mediaFilter] > 0 ? mediaFilter : 'all';
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return photos.filter((item) => {
      if (kindFilter !== 'all' && mediaKindOfRow(item) !== kindFilter) return false;
      if (!needle) return true;
      return [
        item.caption, item.category, item.fileName, item.tags.join(' '),
        ddmmyyyy(item.capturedAt.slice(0, 10)), item.capturedAt.slice(0, 10),
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [photos, q, kindFilter]);
  const p = shown[Math.min(i, shown.length - 1)];
  const compareLeft = shown.find((item) => item.id === compareIds?.[0]);
  const compareRight = shown.find((item) => item.id === compareIds?.[1]);
  useEffect(() => {
    if (!comparing) return;
    if (shown.length < 2) { setComparing(false); setCompareIds(null); return; }
    if (!compareLeft || !compareRight || compareLeft.id === compareRight.id) {
      setCompareIds([shown[0].id, shown[1].id]);
    }
  }, [comparing, shown, compareLeft?.id, compareRight?.id]);
  // The metadata + location check are read LIVE off the open photo's bytes —
  // only for a real image ref, and only the one on screen.
  const exif = useExif(
    p && mediaKindOfRow(p) !== 'photo' ? undefined : p?.fileRef,
    true,
    p?.fileName,
  );

  useEffect(() => {
    // Save the draft against the photo it was typed on before adopting the
    // next one's caption, or moving the gallery throws the edit away.
    const d = draft.current;
    if (d && p && d.id !== p.id) {
      const prev = photos.find((x) => x.id === d.id);
      if (prev && d.caption !== prev.caption) {
        save.mutate({ photoId: d.id, caption: d.caption },
          // The caption box is no longer on screen, so nothing else would tell
          // the user their correction landed.
          { onSuccess: () => toast.ok('Caption saved.') });
      }
    }
    draft.current = null;
    if (p) setCaption(p.caption);
    // A download that failed on this photo must not keep accusing the next one.
    setDlErr('');
    setActionErr('');
    setConfirmDeleteId(null);
    clearError();
    captionSent.current = '';
    setAddingTag(false);
    setTagText('');
  }, [p?.id]);

  // Arrow keys and the chevrons can walk past the visible end of the strip;
  // without this the active thumb silently scrolls out of the track.
  useEffect(() => {
    currentThumb.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [i]);

  // A new query renumbers the strip, so the old position and any selection
  // mean nothing. Clearing the selection also prevents a filtered-out item
  // from remaining armed for bulk deletion.
  useEffect(() => {
    setI(0);
    setComparing(false);
    setSelected(new Set());
    setBulkDeleteIds(null);
  }, [q, mediaFilter]);

  // The invalidation refetches; jump to the new photo once it actually arrives.
  useEffect(() => {
    if (!lastAdded) return;
    const n = shown.findIndex((x) => x.id === lastAdded);
    if (n >= 0) { setI(n); clearLastAdded(); return; }
    // The upload arrived but the live search hides it, which reads as an
    // upload that did nothing. Drop the query; the next pass finds it.
    if (photos.some((x) => x.id === lastAdded)) setQ('');
  }, [lastAdded, shown, photos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      // Inside a field the arrow keys belong to the caret. Claiming them there
      // paged the gallery mid-sentence, which replaced the caption box with
      // another photo's caption and lost everything typed into it.
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable || (t?.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
      else setI((v) => Math.min(shown.length - 1, v + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown.length]);

  if (isLoading) return <Loading h="24rem" />;
  if (!data) return <Failed what="These photos" error={error} boxed h="20rem" />;

  // The server returns "" for a feature whose row is gone, and an unguarded
  // interpolation of that left a display heading trailing off into nothing.
  const subject = data.subject || 'this feature';
  const unprovenPhotos = photos.filter((x) => mediaKindOfRow(x) === 'photo' && !x.verified);
  const unproven = unprovenPhotos.length;
  // What the alert card may honestly say about these rows, read off the rows
  // themselves rather than off the comp this screen was drawn from.
  const allForwarded = unproven > 0 && unprovenPhotos.every((x) => x.source === 'forwarded');
  // A photo shot in the app can still be unchecked (no location, or nothing
  // to check it against), so "from outside the app" is said only when none
  // of them was — the same rule as the Provenance line (API default 'app').
  const noneFromApp = unproven > 0 && unprovenPhotos.every((x) => x.source !== 'app');
  const unprovenDays = [...new Set(unprovenPhotos.map((x) => x.capturedAt.slice(0, 10)))].sort();
  const unprovenWhen = unprovenDays.length === 1
    ? ddmmyyyy(unprovenDays[0])
    : unprovenDays.length > 1
      ? `${ddmmyyyy(unprovenDays[0])} – ${ddmmyyyy(unprovenDays[unprovenDays.length - 1])}`
      : '';
  const unprovenOrigin = allForwarded
    ? `Forwarded, not shot here${unprovenWhen ? `, dated ${unprovenWhen}` : ''}.`
    : noneFromApp
      ? `Filed from outside the app${unprovenWhen ? `, dated ${unprovenWhen}` : ''}.`
      : unprovenWhen ? `Dated ${unprovenWhen}.` : '';

  /** Files the typed tag against this photo. `entityType` must be the exact
   *  string the read path groups on ('photo'), or the row is written and never
   *  shown again. */
  const commitTag = (restoreFocus = false) => {
    if (tagCancelled.current || !p) {
      tagCancelled.current = false;
      return;
    }
    const t = tagText.trim();
    if (restoreFocus) tagCancelled.current = true;
    setAddingTag(false);
    setTagText('');
    if (restoreFocus) requestAnimationFrame(() => tagTrigger.current?.focus());
    // A tag already on the photo would write the same row twice: the server
    // derives the row id from the text, so it looks like nothing happened.
    if (!t || p.tags.includes(t)) return;
    setTag.mutate({ entityType: 'photo', entityId: p.id, tag: t, on: true });
  };

  const commitCaption = () => {
    if (!p) return;
    draft.current = null;
    if (caption === p.caption || captionSent.current === caption) return;
    captionSent.current = caption;
    save.mutate({ photoId: p.id, caption }, {
      onError: () => { captionSent.current = ''; },
    });
  };

  const downloadSelection = async () => {
    const targets = [...selectedItems];
    if (bulkDownload || targets.length === 0) return;

    setActionErr('');
    setBulkDownload({ done: 0, total: targets.length });
    const fetched: { name: string; bytes: Uint8Array }[] = [];
    const failed: string[] = [];
    let totalBytes = 0;
    let tooLarge = false;

    try {
      for (let index = 0; index < targets.length; index += 1) {
        const item = targets[index];
        const name = item.fileName || `${mediaKindOfRow(item)}-${index + 1}`;
        try {
          if (!isStorageRef(item.fileRef)) throw new Error('original-unavailable');
          const blob = await fetchFileBlob(item.fileRef);
          totalBytes += blob.size;
          if (totalBytes > MAX_MEDIA_ARCHIVE_BYTES) {
            tooLarge = true;
            break;
          }
          fetched.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
        } catch {
          failed.push(name);
        }
        setBulkDownload({ done: index + 1, total: targets.length });
      }
    } finally {
      setBulkDownload(null);
    }

    if (tooLarge) {
      setActionErr('That selection is over 1 GB. Select fewer items and download again.');
      return;
    }
    if (!fetched.length) {
      setActionErr('None of the selected originals could be downloaded.');
      return;
    }

    try {
      const names = uniqueNames(fetched.map((item) => item.name));
      downloadBlob(
        zipStore(fetched.map((item, index) => ({ name: names[index], bytes: item.bytes }))),
        mediaArchiveName(),
      );
    } catch (error) {
      setActionErr(error instanceof Error ? error.message : 'The ZIP file could not be built.');
      return;
    }

    if (failed.length === 0) {
      toast.ok(`${fetched.length} ${fetched.length === 1 ? 'item' : 'items'} downloaded as a ZIP.`);
    } else {
      setActionErr(
        `${fetched.length} ${fetched.length === 1 ? 'item was' : 'items were'} downloaded. `
        + `${failed.length} ${failed.length === 1 ? 'original was' : 'originals were'} unavailable: `
        + `${failed.slice(0, 3).join(', ')}${failed.length > 3 ? `, +${failed.length - 3} more` : ''}.`,
      );
    }
  };

  const deleteSelection = async () => {
    const ids = bulkDeleteIds ?? [];
    if (bulkDeleting || ids.length === 0) return;

    setActionErr('');
    setBulkDeleting(true);
    let deleted = 0;
    try {
      for (const photoId of ids) {
        try {
          const response = await delPhoto.mutateAsync({ photoId });
          if (!response.web.deletePhoto) throw new Error('rejected');
          deleted += 1;
          setSelected((current) => {
            const next = new Set(current);
            next.delete(photoId);
            return next;
          });
        } catch {
          const remaining = ids.length - deleted;
          setActionErr(
            deleted > 0
              ? `${deleted} ${deleted === 1 ? 'item was' : 'items were'} deleted. ${remaining} could not be deleted and ${remaining === 1 ? 'remains' : 'remain'} selected.`
              : 'The selected items could not be deleted. Reload the gallery and try again.',
          );
          setBulkDeleteIds(null);
          return;
        }
      }
      setSelected(new Set());
      setBulkDeleteIds(null);
      setSelecting(false);
      setI(0);
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelecting = () => {
    setSelecting((value) => !value);
    setComparing(false);
    setConfirmDeleteId(null);
    setSelected(new Set());
    setBulkDeleteIds(null);
    setActionErr('');
  };
  const toggleComparing = () => {
    if (!comparing) setCompareIds([shown[Math.max(0, i - 1)]?.id || shown[0].id, p?.id === shown[0].id ? shown[1].id : p?.id || shown[1].id]);
    setComparing((value) => !value);
  };
  const canSelect = !featureId && photos.length > 0;
  const canCompare = !selecting && shown.length >= 2;

  /** The search box. "Search by tag or date" fits its box at 1512, where
   *  "Search photos by tag or date" was cut off; the label is unchanged. */
  const searchBox = (
    <span className={`search${narrow ? ' media-search' : ''}`}
          style={narrow ? undefined : { flex: '1 1 10rem', maxWidth: '14rem', minWidth: 0 }}>
      <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
      <input ref={searchInput} placeholder="Search by tag or date" aria-label="Search photos"
             value={q} onChange={(e) => setQ(e.target.value)} />
      {q && (
        <button type="button" className="iconbtn" aria-label="Clear the search"
                onClick={() => setQ('')}
                style={{ flex: 'none', width: '1.25rem', height: '1.25rem' }}>
          <CloseOutlined sx={{ fontSize: 15 }} />
        </button>
      )}
    </span>
  );

  const mediaActions = (
    <>
      {featureId ? (
        <Link className="btn"
              to={`/app/records/${rec.id}/order?service=site_visit&step=pick&a.check=General+condition&why=photos`}>
          <PhotoCameraOutlined sx={{ fontSize: 15 }} /> Ask for a fresh photo
        </Link>
      ) : !narrow && searchBox}
      {!narrow && canSelect && (
        <button type="button" className={`btn${selecting ? ' soft' : ''}`}
                aria-pressed={selecting}
                onClick={toggleSelecting}>
          {selecting ? 'Done' : 'Select'}
        </button>
      )}
      {!narrow && canCompare && (
        <button type="button" className={`btn${comparing ? ' soft' : ''}`}
                aria-pressed={comparing}
                onClick={toggleComparing}>
          <CompareArrowsOutlined sx={{ fontSize: 16 }} /> {comparing ? 'Exit compare' : 'Compare'}
        </button>
      )}
      {/* On a phone the head is the one filled action and this menu, so the
          stage starts in the first viewport instead of under two rows of
          controls. */}
      {narrow && (!featureId || canCompare) && (
        <Menu label="More for this media" items={[
          ...(!featureId ? [{
            label: 'Search',
            onClick: () => {
              setSearchOpen(true);
              requestAnimationFrame(() => searchInput.current?.focus());
            },
          }] : []),
          ...(canSelect ? [{ label: selecting ? 'Done selecting' : 'Select', onClick: toggleSelecting }] : []),
          ...(canCompare ? [{ label: comparing ? 'Exit compare' : 'Compare', onClick: toggleComparing }] : []),
        ]} />
      )}
      {/* Opens the drawer, like every other "add a thing" on this record. It
          used to click a hidden file input, so the pick was the whole
          interaction and every photograph arrived with no caption. */}
      <button ref={addTrigger} type="button" className="btn primary"
              aria-haspopup="dialog" aria-expanded={!!adding} disabled={busy}
              onClick={() => setAdding([])}>
        <AddOutlined sx={{ fontSize: 16 }} aria-hidden />
        Add photos, video or audio
      </button>
    </>
  );

  /** The empty state's dropzone: one target you can drop files onto, or click
   *  to browse.
   *
   *  This used to be six near-identical tiles — five saying "Drop a photo" and
   *  one "Drop a video" — laid out in a grid. They looked like a set of choices
   *  but were not: every one opened the SAME drawer and filed to the SAME
   *  place, so five of them were byte-for-byte repetition and the sixth differed
   *  only in a label the drawer does not act on (it accepts stills and video
   *  either way). Six copies of one action is noise pretending to be structure.
   *  One zone is the whole invitation, and the shortest path there is from a
   *  phone's camera roll to a filed, dated photograph.
   *
   *  Both paths land in the drawer rather than filing straight away, and a DROP
   *  carries its files in with it — the point of dragging onto the zone is that
   *  the choosing is already done, so being asked to choose again would undo the
   *  whole gesture. */
  const DropZone = () => (
    <button
      type="button"
      className="droptile"
      aria-haspopup="dialog"
      disabled={busy}
      onClick={() => setAdding([])}
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
      onDragLeave={(e) => e.currentTarget.classList.remove('over')}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('over');
        setAdding(Array.from(e.dataTransfer.files ?? []));
      }}
    >
      <Icon name="photos" size={26} />
      <span style={{ display: 'block', marginTop: '0.5rem', fontWeight: 700 }}>
        Drop photos, video or audio here
      </span>
      <span className="note">or <u>browse files</u></span>
    </button>
  );

  return (
    <>
      {/* The record's name, its extent and the way back are the frame's now
          (RecordHead.tsx). What is left here is the hanger's own question, its
          counts, and the two controls that belong to it. */}
      {/* The tab's own noun. */}
      <SectionHead
        title={featureId ? `Media of ${data.subject || 'this feature'}` : 'Media'}
        sub={featureId
          ? `${photos.length} ${photos.length === 1 ? 'item' : 'items'}`
          : undefined}
        actions={mediaActions}
      />

      {/* Washed when pressed: a filter is not an action, and the one amber
          fill here is "Add photos, video or audio". A kind with nothing in it
          has no chip — "Recordings 0" was a filter that led nowhere. */}
      {!featureId && photos.length > 0 && (
        <div className="media-filters" role="group" aria-label="Filter media type">
          {([
            ['all', 'All', photos.length],
            ['photo', 'Photos', photoCount],
            ['video', 'Videos', videoCount],
            ['audio', 'Recordings', audioCount],
          ] as const).filter(([key, , count]) => key === 'all' || count > 0).map(([key, label, count]) => (
            <button key={key} type="button" className="chip wash"
                    aria-pressed={kindFilter === key}
                    onClick={() => setMediaFilter(key)}>
              {label} <span className="num">{count}</span>
            </button>
          ))}
        </div>
      )}
      {/* On a phone the search lives here, opened from the head's menu. */}
      {narrow && !featureId && (searchOpen || q) && searchBox}

      {adding && (
        <PhotoDrawer
          recordTitle={rec.title}
          seed={adding}
          busy={busy}
          err={err}
          onFile={onPick}
          clearError={clearError}
          returnFocus={addTrigger}
          onClose={() => setAdding(null)}
        />
      )}

      {/* While the drawer is open the failure is printed inside it, beside the
          files it is about. This is the same message for an upload started
          before the drawer existed on screen — a drop, or a retry. */}
      {err && !adding && (
        <p className="note" role="alert"
           style={{ color: 'var(--w-danger)', padding: 'var(--space-sm) var(--space-lg) 0' }}>
          {err}
        </p>
      )}

      {/* The header carries Upload, so it renders on an empty record too —
          behind an early return there was no way to add the first photo. */}
      {comparing && compareLeft && compareRight ? (
        <CompareMedia
          items={shown}
          left={compareLeft}
          right={compareRight}
          onRight={(item) => setCompareIds([compareLeft.id, item.id])}
          onSwap={() => setCompareIds([compareRight.id, compareLeft.id])}
        />
      ) : p ? (
        <div className="lightbox">
          <div ref={stageRef} className={theater ? 'stage theater' : 'stage'}
               style={{ display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto',
                        placeItems: 'stretch', gap: 'var(--space-md)' }}>
            <div className="row tight" style={{ alignItems: 'center' }}>
              <span className="eyebrow" style={{ margin: 0 }}>
                {KindWord(p)} {i + 1} of {shown.length}
              </span>
              {/* Theater view: the stage fills the window so a photograph of a
                  boundary stone or a bore can be read closely, then Esc brings
                  the record back. Pushed to the right so it reads as "more
                  room for this", not another fact about the photo. */}
              {/* Not drawn where the page cannot ask for full screen (Safari on
                  an iPhone allows it for video only): there it did nothing. */}
              {canTheater && (
                <button type="button" className="iconbtn" onClick={toggleTheater}
                        style={{ marginLeft: 'auto', border: '1px solid var(--w-line)', flex: 'none' }}
                        aria-pressed={theater}
                        aria-label={theater ? 'Exit full screen' : 'View full screen'}>
                  {theater
                    ? <FullscreenExitOutlined sx={{ fontSize: 18 }} />
                    : <FullscreenOutlined sx={{ fontSize: 18 }} />}
                </button>
              )}
            </div>

            {/* minWidth:0 + overflow:hidden is what actually clamps the frame: an
                aspect-ratio box sized from its height will happily exceed its
                flex track and paint over the panel beside it. */}
            <div className="row"
                 style={{ flexWrap: 'nowrap', gap: 'var(--space-md)', alignItems: 'stretch',
                          justifyContent: 'center', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
              {/* Hidden, not disabled, at the ends — a greyed arrow on the
                  first photo is a control that points at nothing. `visibility`
                  rather than removing it, so the frame does not shift a pixel
                  when the arrow comes and goes as you page. */}
              {/* Named for what it leads to — "Previous video" — not always
                  "photo". 44px on touch through the shared .iconbtn floor. */}
              <button type="button" className="iconbtn" onClick={() => setI(Math.max(0, i - 1))}
                      aria-label={`Previous ${kindWord(shown[Math.max(0, i - 1)] ?? p)}`}
                      style={{ border: '1px solid var(--w-line)', alignSelf: 'center', flex: 'none',
                               visibility: i === 0 ? 'hidden' : 'visible' }}>
                <ChevronLeftOutlined sx={{ fontSize: 18 }} />
              </button>
              {/* The frame borrows the photo's own aspect ratio when we know it,
                  so a portrait screenshot fills the stage instead of sitting in
                  a thin strip inside a 4:3 box. Falls back to the 4:3 of the
                  placeholder when there are no dimensions to borrow. */}
              <div className="frame"
                   style={{ width: 'auto', height: '100%', maxWidth: '100%',
                            minWidth: 0, flex: '0 1 auto',
                            ...(p.fileRef && p.width > 0 && p.height > 0
                              ? { aspectRatio: `${p.width} / ${p.height}` }
                              : {}) }}>
                <PhotoImg
                  fileRef={p.fileRef}
                  kind={mediaKindOfRow(p)}
                  alt={p.caption}
                  thumb={1024}
                  fallback={
                    <span style={{ display: 'grid', justifyItems: 'center', gap: '0.5rem' }}>
                      <Icon name={mediaKindOfRow(p) === 'photo' ? p.category.toLowerCase() : mediaKindOfRow(p)} size={40} />
                      <span className="mono note">
                        photo placeholder · {p.fileName}
                        {p.width > 0 && ` · ${p.width} × ${p.height}`}
                      </span>
                    </span>
                  }
                />
                {mediaKindOfRow(p) === 'photo' && p.verified && (
                  <span style={{ position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)' }}>
                    <span className="pill owned"><GppGoodOutlined sx={{ fontSize: 13 }} /> Verified on site</span>
                  </span>
                )}
                {mediaKindOfRow(p) === 'photo' && p.lat > 0 && (
                  <span className="stamp">
                    {p.lat.toFixed(4)}° N {p.lon.toFixed(4)}° E ±{Math.round(p.accuracyM)} m<br />
                    {stamp(p.capturedAt)}
                  </span>
                )}
              </div>
              <button type="button" className="iconbtn" onClick={() => setI(Math.min(shown.length - 1, i + 1))}
                      aria-label={`Next ${kindWord(shown[Math.min(shown.length - 1, i + 1)] ?? p)}`}
                      style={{ border: '1px solid var(--w-line)', alignSelf: 'center', flex: 'none',
                               visibility: i >= shown.length - 1 ? 'hidden' : 'visible' }}>
                <ChevronRightOutlined sx={{ fontSize: 18 }} />
              </button>
            </div>

            <div className="thumbs" style={{ border: 0, padding: 0 }}>
              {/* Every photo, not the first five behind a "+13": the strip is
                  how you move through the record, and a counter you cannot
                  click is a dead end. It scrolls in its own track so the
                  summary beside it stays pinned. */}
              <span className="photostrip">
                {shown.map((t, n) => (
                  <button key={t.id} type="button" className={`thumb${selected.has(t.id) ? ' selected' : ''}`}
                          aria-current={!selecting && n === i}
                          aria-pressed={selecting ? selected.has(t.id) : undefined}
                          ref={n === i ? currentThumb : undefined}
                          onClick={() => {
                            if (!selecting) { setI(n); return; }
                            setBulkDeleteIds(null);
                            setActionErr('');
                            setSelected((current) => {
                              const next = new Set(current);
                              if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                              return next;
                            });
                          }}
                          /* Every photo filed through the app carries an empty
                             caption, and an empty aria-label is no name at all
                             — a strip of unnamed buttons over an alt="" image.
                             The fallback is built from what the row always
                             carries, so the names differ from each other. */
                          /* …and the verified state is in the name too, in
                             words: the dot below was colour and nothing else,
                             and aria-hidden. */
                          aria-label={(t.caption.trim()
                            || `${KindWord(t)} ${n + 1}`
                               + (t.category ? ` — ${t.category}` : '')
                               + (t.capturedAt ? `, ${ddmmyyyy(t.capturedAt.slice(0, 10))}` : ''))
                            + (t.verified ? ', verified on site' : ', not verified')}>
                    {mediaKindOfRow(t) === 'video' ? (
                      <VideoThumb fileRef={t.fileRef} fallback={<Icon name="video" size={18} />} />
                    ) : mediaKindOfRow(t) === 'audio' ? (
                      <Icon name="audio" size={18} />
                    ) : (
                      <PhotoImg fileRef={t.fileRef} alt="" thumb={128}
                                fallback={<Icon name={t.category.toLowerCase()} size={18} />} />
                    )}
                    {selecting && <span className="thumb-select" aria-hidden>{selected.has(t.id) ? '✓' : ''}</span>}
                    {/* A tick in a filled dot, or a hollow ring: a shape, not
                        only a colour (the words are in the name above). */}
                    <span className={t.verified ? 'src' : 'src no'} aria-hidden>{t.verified ? '✓' : ''}</span>
                  </button>
                ))}
              </span>
            </div>
          </div>

          <aside className="side">
            {selecting ? (
              <div className="selection-panel">
                <p className="eyebrow">Selection</p>
                <h2 style={{ fontSize: '1.375rem' }} aria-live="polite">
                  {selectedItems.length ? `${selectedItems.length} ${selectedItems.length === 1 ? 'item' : 'items'} selected` : 'Nothing selected'}
                </h2>
                <KV rows={[
                  { k: 'Photos', v: String(selectedItems.filter((item) => mediaKindOfRow(item) === 'photo').length) },
                  { k: 'Videos', v: String(selectedItems.filter(isVideoRow).length) },
                  { k: 'Recordings', v: String(selectedItems.filter(isAudioRow).length) },
                ]} />
                {selectedItems.length > 0 && (
                  <div className="selection-previews" aria-label="Selected media">
                    {selectedItems.map((item) => (
                      <span key={item.id} className="selection-preview" role="img"
                            aria-label={item.caption || item.fileName || 'Untitled'}>
                        {mediaKindOfRow(item) === 'video' ? (
                          <VideoThumb fileRef={item.fileRef} fallback={<Icon name="video" size={18} />} />
                        ) : mediaKindOfRow(item) === 'audio' ? (
                          <Icon name="audio" size={18} />
                        ) : (
                          <PhotoImg fileRef={item.fileRef} alt="" thumb={128}
                                    fallback={<Icon name={item.category.toLowerCase()} size={18} />} />
                        )}
                        <span className="thumb-select" aria-hidden>✓</span>
                      </span>
                    ))}
                  </div>
                )}
                {selectedItems.length > 0 && !bulkDeleteIds && (
                  <div className="stack sm selection-actions">
                    <button type="button" className="btn"
                            disabled={!!bulkDownload || bulkDeleting}
                            onClick={() => void downloadSelection()}>
                      <FileDownloadOutlined sx={{ fontSize: 16 }} aria-hidden />
                      {bulkDownload
                        ? `Preparing ${bulkDownload.done} of ${bulkDownload.total}…`
                        : 'Download as .zip'}
                    </button>
                  </div>
                )}
                {actionErr && <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{actionErr}</p>}
                {/* The same confirmation as a single delete, and the same
                    30-day sentence. A partial failure closes it and says, in
                    the panel, which items were not deleted and stay selected. */}
                {bulkDeleteIds && (
                  <ConfirmDialog
                    title={`Delete ${bulkDeleteIds.length} selected ${bulkDeleteIds.length === 1 ? 'item' : 'items'}?`}
                    body={`${bulkDeleteIds.length === 1 ? 'It archives' : 'They archive'} for 30 days before permanent deletion.`}
                    actionLabel="Delete"
                    danger
                    busy={bulkDeleting}
                    onConfirm={() => void deleteSelection()}
                    onClose={() => setBulkDeleteIds(null)}
                  />
                )}
                <div className="row tight selection-footer">
                  <button type="button" className="linkbtn"
                          disabled={!selectedItems.length || bulkDeleting || !!bulkDownload}
                          onClick={() => {
                            setSelected(new Set());
                            setBulkDeleteIds(null);
                            setActionErr('');
                          }}>Clear selection</button>
                  <span className="grow" />
                  {!bulkDeleteIds && (
                    <button type="button" className="linkbtn danger"
                            disabled={!selectedItems.length || bulkDeleting || !!bulkDownload}
                            onClick={() => setBulkDeleteIds(selectedItems.map((item) => item.id))}>
                      <DeleteOutlineOutlined sx={{ fontSize: 15 }} aria-hidden /> Delete selected
                    </button>
                  )}
                </div>
              </div>
            ) : featureId ? (
              <>
                {mediaKindOfRow(p) === 'photo' ? (
                  <>
                    <Provenance p={p} rec={rec} exif={exif.data} subject={subject} named={!!data.subject} />
                    <PhotoGeoCheckBlock rec={rec} p={p} exif={exif.data}
                      loading={exif.status === 'loading'} />
                    <PhotoMetadata exif={exif.data} loading={exif.status === 'loading'}
                      unsupported={exif.status === 'unsupported'} />
                  </>
                ) : (
                  <Card title={KindWord(p)}>
                    <p className="note" style={{ color: 'var(--w-ink-2)' }}>
                      Location and metadata checks do not apply.
                    </p>
                  </Card>
                )}
                {mediaKindOfRow(p) === 'photo' && unproven > 0 && !dismissedUnproven && (
                  <div className="card alert" style={{ marginBottom: 'var(--space-md)' }}>
                    <h3 className="down row tight">
                      <LinkOffOutlined sx={{ fontSize: 16 }} />
                      {' '}{plural(unproven, 'photo')} here {unproven === 1 ? 'proves' : 'prove'} nothing
                    </h3>
                    <p className="note" style={{ margin: '0.5rem 0', color: 'var(--w-ink-2)' }}>
                      {unprovenOrigin && `${unprovenOrigin} `}Not checked against the saved pin.
                    </p>
                    {/* "Set their place by hand" stood here, disabled and with no
                        reason: it is a control for something the app cannot do
                        yet, so it is not drawn until it can. */}
                    <div className="row tight">
                      <button type="button" className="btn sm" onClick={() => setDismissedUnproven(true)}>
                        Leave as is
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="eyebrow">
                  {(p.category || KindWord(p)).replace(/_/g, ' ')}
                </p>
                <input
                  aria-label="Title"
                  placeholder="Untitled"
                  value={caption}
                  onChange={(e) => {
                    // The id travels with the text: if the gallery moves while
                    // this box has focus, the flush above still knows which
                    // photo the words belong to.
                    draft.current = { id: p.id, caption: e.target.value };
                    setCaption(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    // Enter is what a person presses when they have finished a
                    // caption; without it the only way to save was to click away.
                    if (e.key === 'Enter') { e.preventDefault(); commitCaption(); }
                  }}
                  onBlur={commitCaption}
                  style={{
                    fontWeight: 700, fontSize: '1.375rem',
                    border: 0, background: 'none', padding: 0, marginBottom: '0.5rem',
                    width: '100%',
                  }}
                />

                <p className="eyebrow" style={{ marginTop: 'var(--space-md)' }}>Details</p>
                {/* The app's words for what is missing: "not set" for a value
                    the record does not hold, "Not checked" for a check that has
                    not run. "N/A" stood for both, and for "does not apply". */}
                <KV
                  rows={[
                    { k: 'Taken', v: stamp(p.capturedAt) || 'not set' },
                    { k: 'Visit', v: p.orderRef ? `Order ${p.orderRef}` : 'not set' },
                    { k: 'Where', v: (p.lat || p.lon)
                        ? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}${p.accuracyM > 0 ? ` ±${Math.round(p.accuracyM)} m` : ''}`
                        : exif.data?.gps
                          ? `${exif.data.gps.latitude.toFixed(4)}, ${exif.data.gps.longitude.toFixed(4)}`
                          : 'not set' },
                    { k: 'Uploaded by', v: p.capturedBy || 'not set' },
                    { k: 'Device', v: exif.status === 'loading' ? 'Reading the file…'
                        : [exif.data?.make, exif.data?.model].filter(Boolean).join(' ') || 'not set' },
                    { k: 'File', v: [p.fileName || 'not set',
                        p.width > 0 && p.height > 0 ? `${p.width} × ${p.height}` : '']
                        .filter(Boolean).join(' · ') },
                  ]}
                />

                <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Audit</p>
                <KV rows={[
                  { k: 'Source', v: p.source || 'not set' },
                  { k: 'On-site check', v: p.verified ? 'Verified on site' : 'Not checked' },
                  { k: 'Device clock', v: p.deviceClockOk ? 'Matched server' : 'Not checked' },
                  { k: 'File hash', v: p.sha256 || 'not set' },
                  { k: 'Service order', v: p.orderRef
                      ? <Link className="accent" to={`/app/records/${id}/services`}>{p.orderRef} ›</Link>
                      : 'not set' },
                ]} />

                {/* Is this photo actually OF this land? The record-scoped panel
                    is where most photos are looked at, so the location check
                    lives here too, not only on the feature provenance panel. */}
                {mediaKindOfRow(p) === 'photo' && (
                  <PhotoGeoCheckBlock rec={rec} p={p} exif={exif.data}
                    loading={exif.status === 'loading'} />
                )}

                <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Tags</p>
                {/* Only the owner's own tags. Three automatic ones used to lead
                    the row — the kind, the property's title and the visit date —
                    each a fact already on screen (the eyebrow, the <h1>, the
                    stamp). */}
                <div className="row tight">
                  {p.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
                  {/* This was a <span>: it looked like the way to add a tag, it
                      did nothing, and Tab walked straight past it. A text
                      button, not a chip: adding a tag is an action, and a
                      dashed chip read as one more tag. */}
                  {addingTag ? (
                    <input
                      autoFocus
                      aria-label="New tag"
                      placeholder="tag, then Enter"
                      value={tagText}
                      onChange={(e) => setTagText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitTag(true); }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          tagCancelled.current = true;
                          setAddingTag(false);
                          setTagText('');
                          requestAnimationFrame(() => tagTrigger.current?.focus());
                        }
                      }}
                      onBlur={() => commitTag()}
                      style={{
                        font: 'inherit', fontSize: '0.75rem', padding: '0.25rem 0.625rem',
                        borderRadius: 'var(--radius-pill)', border: '1px dashed var(--w-accent)',
                        background: 'none', color: 'var(--w-ink)', width: '9rem', minWidth: 0,
                      }}
                    />
                  ) : (
                    <button ref={tagTrigger} type="button" className="linkbtn"
                            onClick={() => {
                              tagCancelled.current = false;
                              setTagText('');
                              setAddingTag(true);
                            }}>
                      <AddOutlined sx={{ fontSize: 15 }} aria-hidden /> Add a tag
                    </button>
                  )}
                </div>

                <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Do</p>
                <div className="grid4" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'var(--space-xs)' }}>
                  {mediaKindOfRow(p) === 'photo' && (
                    <button type="button" className="btn" style={{ justifyContent: 'center' }}
                            disabled={p.isCover || cover.isPending}
                            onClick={() => {
                              setActionErr('');
                              cover.mutate({ photoId: p.id }, {
                                onSuccess: (res) => {
                                  if (!res.web.setCoverPhoto) {
                                    setActionErr('That photo could not be made the cover. It may no longer be filed here.');
                                  }
                                },
                              });
                            }}>
                      <ImageOutlined sx={{ fontSize: 15 }} /> {p.isCover ? 'Cover' : 'Make cover'}
                    </button>
                  )}
                  <button type="button" className="btn" style={{ justifyContent: 'center' }}
                          disabled={!isStorageRef(p.fileRef) || dling}
                          onClick={async () => {
                            // fetchFileBlob throws on a refusal, and an
                            // uncaught throw here left the button looking dead
                            // and the reason in the console. Say it on screen.
                            setDlErr('');
                            setDling(true);
                            try {
                              const blob = await fetchFileBlob(p.fileRef);
                              downloadBlob(blob, p.fileName || (mediaKindOfRow(p) === 'audio' ? 'recording' : mediaKindOfRow(p) === 'video' ? 'video' : 'photo.jpg'));
                            } catch {
                              setDlErr('That file could not be downloaded. Storage could not be reached.');
                            } finally {
                              setDling(false);
                            }
                          }}>
                    <FileDownloadOutlined sx={{ fontSize: 15 }} /> {dling ? 'Preparing…' : 'Download'}
                  </button>
                </div>
                {dlErr && (
                  <p className="note" role="alert"
                     style={{ color: 'var(--w-danger)', marginTop: 'var(--space-xs)' }}>
                    {dlErr}
                  </p>
                )}
                {actionErr && (
                  <p className="note" role="alert"
                     style={{ color: 'var(--w-danger)', marginTop: 'var(--space-xs)' }}>
                    {actionErr}
                  </p>
                )}

                {/* The shared confirmation, not an inline card at the foot of
                    a scrolling panel (it opened below the fold at 1512). It
                    holds open until the server answers, with the answer in it. */}
                {confirmDeleteId === p.id && (
                  <ConfirmDialog
                    title={`Delete this ${kindWord(p)}?`}
                    body="It archives for 30 days before permanent deletion."
                    actionLabel="Delete"
                    danger
                    busy={delPhoto.isPending}
                    error={delErr}
                    onConfirm={() => {
                      const photoId = confirmDeleteId;
                      setDelErr('');
                      delPhoto.mutate({ photoId }, {
                        onSuccess: (res) => {
                          if (!res.web.deletePhoto) {
                            setDelErr('This item could not be deleted. Reload the gallery and try again.');
                            return;
                          }
                          setConfirmDeleteId(null);
                          setI((v) => Math.max(0, v - 1));
                        },
                        onError: () => setDelErr('This item could not be deleted. It is still here.'),
                      });
                    }}
                    onClose={() => { setDelErr(''); setConfirmDeleteId(null); }}
                  />
                )}
                <button type="button" className="btn danger media-delete" aria-haspopup="dialog"
                        aria-label={`Delete ${p.caption || `this ${kindWord(p)}`}`}
                        onClick={() => { setDelErr(''); setConfirmDeleteId(p.id); }}>
                  <DeleteOutlineOutlined sx={{ fontSize: 18 }} aria-hidden /> Delete
                </button>
              </>
            )}
          </aside>
        </div>
      ) : q.trim() ? (
        // main is flush, so the dashed rule needs the padding the page does
        // not carry, or it runs into the window edge.
        <div style={{ padding: 'var(--space-lg)' }}>
          <Empty icon="photos" boxed h="18rem"
                 title={<>No photo matches &ldquo;{q.trim()}&rdquo;</>}
                 action={
                   <button type="button" className="btn sm" onClick={() => setQ('')}>
                     <CloseOutlined sx={{ fontSize: 15 }} /> Clear the search
                   </button>
                 } />
        </div>
      ) : featureId ? (
        /* One branch used to cover both scopes and it was written for the
           record, so a feature with no photos of its own told the owner the
           whole record was empty while the header counted dozens. */
        <div style={{ padding: 'var(--space-lg)' }}>
          <Empty icon="photos" boxed h="18rem"
                 title={`No photos of ${subject} yet`}
                 action={
                   <Link to={`/app/records/${id}/photos`} className="btn sm">
                     <ImageOutlined sx={{ fontSize: 15 }} /> All photos on this property
                   </Link>
                 } />
        </div>
      ) : (
        <div className="split">
          <div>
            <DropZone />
          </div>

          <aside className="stack">
            <Card title="Limits" className="railcard">
              <p className="note" style={{ margin: 0 }}>
                Photos up to {mb(MAX_UPLOAD_BYTES)}; videos and audio up to {mb(MAX_VIDEO_BYTES)}.
              </p>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
