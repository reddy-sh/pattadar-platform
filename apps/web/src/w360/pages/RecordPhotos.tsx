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
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';
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

import {
  useDeletePhoto, usePhotos, useSetCoverPhoto, useSetTag, useUpdateCaption,
} from '../api';
import type { Photo } from '../api';
import { Card, Empty, Failed, Icon, KV, Loading, PhotoImg, Tag, ddmmyyyy, plural } from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useToast } from '../Toast';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { MAX_UPLOAD_BYTES, mb, useFilePhotos } from '../filePhotos';
import { downloadBlob, fetchFileBlob, isStorageRef } from '../../pages/documents/storage';

/** '2026-08-12 07:41 IST' → '12/08/2026 07:41 IST'. A capture stamp is
 *  evidence and is read in the same order as every other date here. */
const stamp = (s: string) => (s ? `${ddmmyyyy(s.slice(0, 10))}${s.slice(10)}` : '');

/** `subject` arrives already defaulted, so nothing here re-implements the
 *  fallback. `named` says whether the feature actually carries a label: a
 *  headline reading "Why this is this feature" is worse than none, so an
 *  unlabelled feature gets the generic headline instead. */
function Provenance({ p, subject, named }: { p: Photo; subject: string; named: boolean }) {
  // Every line below is a fact about THIS photo; an unverified one asserts none.
  const checks = [
    [PhotoCameraOutlined, 'Shot inside Pattadar, not picked from a gallery', p.source === 'app'],
    [AccessTimeOutlined, 'Device clock matched our server to the second', p.deviceClockOk],
    [FingerprintOutlined, `Unedited since capture  sha256 ${p.sha256.slice(0, 4)}…${p.sha256.slice(-4)}`, !!p.sha256],
    [PersonOutlined, `${p.capturedBy} · Pattadar caretaker, ID verified`, !!p.capturedBy],
    [ReceiptLongOutlined, `Came in on order ${p.orderRef}, a paid site visit`, !!p.orderRef],
  ] as const;

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
            {p.source === 'forwarded'
              ? 'This photo was forwarded in rather than shot here'
              : 'This photo came in from outside the app'}, so nothing has checked it against
            the saved pin. Any coordinates on it are the sender&rsquo;s word, not ours. That is
            what makes it a picture rather than evidence.
          </p>
        ) : (
        <>
        <svg viewBox="0 0 100 46" style={{ display: 'block', width: '100%', background: 'var(--w-surface-2)' }}
             role="img" aria-label="Where the photo was taken against the saved pin">
          <polygon points="8,38 10,10 88,7 92,36" fill="none" stroke="var(--w-ink-3)" strokeWidth="0.5" />
          <circle cx="48" cy="22" r="9" fill="var(--w-ok)" fillOpacity="0.14" />
          <circle cx="45" cy="22" r="1.7" fill="var(--w-info)" />
          <circle cx="51" cy="21" r="1.7" fill="var(--w-accent)" />
          <text x="24" y="26" fontSize="2.6" fill="var(--w-info)" fontFamily="var(--font-mono)">saved pin</text>
          <text x="55" y="19" fontSize="2.6" fill="var(--w-accent)" fontFamily="var(--font-mono)">photo taken</text>
          <text x="50" y="43" fontSize="2.2" textAnchor="middle" fill="var(--w-ink-3)"
                fontFamily="var(--font-mono)">
            {Math.round(p.pinDistanceM)} m apart · inside the boundary
          </text>
        </svg>
        <p className="note" style={{ padding: 'var(--space-md)', color: 'var(--w-ink-2)' }}>
          The photo&rsquo;s own coordinates land <strong>{Math.round(p.pinDistanceM)} m</strong> from
          where {subject.toLowerCase()} is pinned, and both sit inside
          the boundary. Anything beyond 50 m is flagged for you to look at.
        </p>
        </>
        )}
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 'var(--space-md)' }}>
        <div className="checks">
          {checks.map(([I, label, ok]) => (
            <div key={label as string}>
              <span style={{ display: 'flex', color: ok ? 'var(--w-ok)' : 'var(--w-ink-3)' }}>
                <I sx={{ fontSize: 16 }} />
              </span>
              <span className="mono" style={{ fontSize: '0.75rem' }}>{label}</span>
            </div>
          ))}
        </div>
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

  const tooBig = picked.filter((f) => f.size > MAX_UPLOAD_BYTES);
  const ready = picked.length > 0 && tooBig.length === 0 && !busy;
  const videos = picked.filter((f) => f.type.startsWith('video/')).length;

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
      title={picked.length > 1 ? `Add ${picked.length} files` : 'Add photos or video'}
      sub="Dated evidence of what is on this land — a bore that is running, a fence that is down, the crop this season."
      onClose={onClose}
      onSubmit={() => void file()}
      busy={busy}
      dirty={picked.length > 0}
      discardCopy={{
        title: 'Discard this pick?',
        body: 'Nothing has been uploaded yet. Closing this panel drops the files you picked — the files themselves are untouched.',
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
        type="file" hidden multiple accept="image/*,video/*"
        aria-label="Upload a photo or video to this record"
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
          Drop the photographs here
        </p>
        <p className="dropline">
          Photos or video, up to {mb(MAX_UPLOAD_BYTES)} each.
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
          </label>
          <div className="card" style={{ padding: 0 }}>
            <div className="rows boxed">
              {picked.map((f) => {
                const over = f.size > MAX_UPLOAD_BYTES;
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
                        {mb(f.size)}{over && ` · over the ${mb(MAX_UPLOAD_BYTES)} limit`}
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
              Take {tooBig.length > 1 ? 'those' : 'that one'} out to upload the rest — nothing is
              sent while anything in the list is over the limit.
            </span>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="ph-cap">What these show</label>
        <input id="ph-cap" type="text" value={caption}
               placeholder="North bund after the rain"
               onChange={(e) => setCaption(e.target.value)} />
        <span className="note">
          {picked.length > 1
            ? 'Kept on every file in this pick. Each one can be corrected afterwards from the gallery.'
            : 'Optional. It can be corrected afterwards from the gallery.'}
        </span>
      </div>

      {/* Said here, where the choosing happens. A file picked out of a folder
          carries nobody's word but the owner's — which is exactly what the
          gallery's provenance panel says about it once it is filed, and by then
          it is too late to be useful. */}
      <p className="note" style={{ margin: 0 }}>
        A photograph added from a folder is your own record of what you saw. Nothing checks it
        against this land&rsquo;s pin, so it is not treated as evidence — that takes a site
        visit, which is ordered from the Services tab.
      </p>

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
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
  const [confirmDel, setConfirmDel] = useState(false);
  const [i, setI] = useState(0);
  const [caption, setCaption] = useState('');
  const [q, setQ] = useState('');
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
  // OS control keeps the button's label honest.
  const stageRef = useRef<HTMLDivElement>(null);
  const [theater, setTheater] = useState(false);
  const toggleTheater = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  };
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
  // Filter into a second list rather than in place: `i` indexes whatever the
  // strip and the stage are showing, and if that were `photos` while the strip
  // showed a subset, the frame would sit on a photo nobody can see.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return photos;
    return photos.filter((x) => [
      x.caption, x.category, x.fileName, x.tags.join(' '),
      // Dates are read dd/mm/yyyy everywhere on this screen, so that is the
      // form a search for one has to match; the ISO form is kept too because
      // it is what a pasted value looks like.
      ddmmyyyy(x.capturedAt.slice(0, 10)), x.capturedAt.slice(0, 10),
    ].join(' ').toLowerCase().includes(needle));
  }, [photos, q]);
  const p = shown[Math.min(i, shown.length - 1)];

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

  // A new query renumbers the strip, so the old position means nothing.
  useEffect(() => { setI(0); }, [q]);

  // The invalidation refetches; jump to the new photo once it actually arrives.
  useEffect(() => {
    if (!lastAdded) return;
    const n = shown.findIndex((x) => x.id === lastAdded);
    if (n >= 0) { setI(n); clearLastAdded(); return; }
    // The upload arrived but the live search hides it, which reads as an
    // upload that did nothing. Drop the query; the next pass finds it.
    if (photos.some((x) => x.id === lastAdded)) setQ('');
  }, [lastAdded, shown, photos]);

  // The browser owns the fullscreen state; mirror it so Esc/OS exit updates
  // the toggle. The stage carries a class while it is the fullscreen element
  // so it can paint itself as a theater rather than a padded panel.
  useEffect(() => {
    const sync = () => setTheater(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

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
  const unprovenPhotos = photos.filter((x) => !x.verified);
  const unproven = unprovenPhotos.length;
  // What the alert card may honestly say about these rows, read off the rows
  // themselves rather than off the comp this screen was drawn from.
  const allForwarded = unproven > 0 && unprovenPhotos.every((x) => x.source === 'forwarded');
  const unprovenDays = [...new Set(unprovenPhotos.map((x) => x.capturedAt.slice(0, 10)))].sort();
  const unprovenWhen = unprovenDays.length === 1
    ? ddmmyyyy(unprovenDays[0])
    : unprovenDays.length > 1
      ? `${ddmmyyyy(unprovenDays[0])} – ${ddmmyyyy(unprovenDays[unprovenDays.length - 1])}`
      : '';

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

  // The footer used to report the NEWEST visit no matter which photo was open,
  // so paging back to an older visit left it contradicting the date beside it.
  const visit = p ? p.capturedAt.slice(0, 10) : '';
  const visitCount = (q.trim() ? shown : photos)
    .filter((x) => x.capturedAt.slice(0, 10) === visit).length;

  const mediaActions = (
    <>
      {featureId ? (
        <Link className="btn"
              to={`/app/records/${rec.id}/order?service=site_visit&step=pick&a.check=General+condition&why=photos`}>
          <PhotoCameraOutlined sx={{ fontSize: 15 }} /> Ask for a fresh photo
        </Link>
      ) : (
        <span className="search" style={{ flex: '1 1 10rem', maxWidth: '14rem', minWidth: 0 }}>
          <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
          <input placeholder="Search photos by tag or date" aria-label="Search photos"
                 value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" className="iconbtn" aria-label="Clear the search"
                    onClick={() => setQ('')}
                    style={{ flex: 'none', width: '1.25rem', height: '1.25rem' }}>
              <CloseOutlined sx={{ fontSize: 15 }} />
            </button>
          )}
        </span>
      )}
      {/* Opens the drawer, like every other "add a thing" on this record. It
          used to click a hidden file input, so the pick was the whole
          interaction and every photograph arrived with no caption. */}
      <button ref={addTrigger} type="button" className="btn primary"
              aria-haspopup="dialog" aria-expanded={!!adding} disabled={busy}
              onClick={() => setAdding([])}>
        <AddOutlined sx={{ fontSize: 16 }} aria-hidden />
        Add photos or video
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
      <span style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600 }}>
        Drop photos or video here
      </span>
      <span className="note">or <u>browse files</u></span>
    </button>
  );

  return (
    <>
      {/* The record's name, its extent and the way back are the frame's now
          (RecordHead.tsx). What is left here is the hanger's own question, its
          counts, and the two controls that belong to it. */}
      <SectionHead
        title={featureId ? `Photos of ${data.subject || 'this feature'}` : 'Photos and video'}
        sub={featureId
          ? `${plural(photos.length, 'photo')} across ${plural(data.visitCount, 'visit')}`
          : q.trim()
            // A count that never moved while the strip filtered was the clearest
            // sign the search box was not connected to anything.
            ? `${shown.length} of ${plural(data.total, 'photo')}`
            : [plural(data.total, 'photo'),
               `${data.videoCount} ${data.videoCount === 1 ? 'video' : 'videos'}`,
               data.visitCount > 0
                 ? plural(data.visitCount, 'site visit')
                 : 'nothing filmed here yet'].join(' · ')}
        actions={mediaActions}
      />

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
      {p ? (
        <div className="lightbox">
          <div ref={stageRef} className={theater ? 'stage theater' : 'stage'}
               style={{ display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto',
                        placeItems: 'stretch', gap: 'var(--space-md)' }}>
            <div className="row tight" style={{ alignItems: 'center' }}>
              {!featureId && (
                <>
                  <span className="chip static">
                    <PlaceOutlined sx={{ fontSize: 13 }} /> geo-stamped
                  </span>
                  <span className="chip static">
                    <GppGoodOutlined sx={{ fontSize: 13 }} /> from a Pattadar visit
                  </span>
                </>
              )}
              {/* Theater view: the stage fills the window so a photograph of a
                  boundary stone or a bore can be read closely, then Esc brings
                  the record back. Pushed to the right so it reads as "more
                  room for this", not another fact about the photo. */}
              <button type="button" className="iconbtn" onClick={toggleTheater}
                      style={{ marginLeft: 'auto', border: '1px solid var(--w-line)', flex: 'none' }}
                      aria-pressed={theater}
                      aria-label={theater ? 'Exit full screen' : 'View full screen'}>
                {theater
                  ? <FullscreenExitOutlined sx={{ fontSize: 18 }} />
                  : <FullscreenOutlined sx={{ fontSize: 18 }} />}
              </button>
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
              <button type="button" className="iconbtn" onClick={() => setI(Math.max(0, i - 1))}
                      aria-label="Previous photo"
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
                  kind={p.mediaKind === 'video' ? 'video' : 'photo'}
                  alt={p.caption}
                  thumb={1024}
                  fallback={
                    <span style={{ display: 'grid', justifyItems: 'center', gap: '0.5rem' }}>
                      <Icon name={p.mediaKind === 'video' ? 'video' : p.category.toLowerCase()} size={40} />
                      <span className="mono note">
                        photo placeholder · {p.fileName}
                        {p.width > 0 && ` · ${p.width} × ${p.height}`}
                      </span>
                    </span>
                  }
                />
                {p.verified && (
                  <span style={{ position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)' }}>
                    <span className="pill owned"><GppGoodOutlined sx={{ fontSize: 13 }} /> Verified on site</span>
                  </span>
                )}
                {p.lat > 0 && (
                  <span className="stamp">
                    {p.lat.toFixed(4)}° N {p.lon.toFixed(4)}° E ±{Math.round(p.accuracyM)} m<br />
                    {stamp(p.capturedAt)}
                  </span>
                )}
              </div>
              <button type="button" className="iconbtn" onClick={() => setI(Math.min(shown.length - 1, i + 1))}
                      aria-label="Next photo"
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
                  <button key={t.id} type="button" className="thumb" aria-current={n === i}
                          ref={n === i ? currentThumb : undefined}
                          onClick={() => setI(n)}
                          /* Every photo filed through the app carries an empty
                             caption, and an empty aria-label is no name at all
                             — a strip of unnamed buttons over an alt="" image.
                             The fallback is built from what the row always
                             carries, so the names differ from each other. */
                          aria-label={t.caption.trim()
                            || `${t.mediaKind === 'video' ? 'Video' : 'Photo'} ${n + 1}`
                               + (t.category ? ` — ${t.category}` : '')
                               + (t.capturedAt ? `, ${ddmmyyyy(t.capturedAt.slice(0, 10))}` : '')}>
                    <PhotoImg
                      fileRef={t.mediaKind === 'video' ? '' : t.fileRef}
                      alt=""
                      thumb={128}
                      fallback={<Icon name={t.mediaKind === 'video' ? 'video' : t.category.toLowerCase()} size={18} />}
                    />
                    <span className={t.verified ? 'src' : 'src no'} aria-hidden />
                  </button>
                ))}
              </span>
              {/* Shrinkable, not pinned: at phone width this row is ~154px and the
                  summary wants 253, so refusing to shrink pushed the page
                  sideways. It wraps instead. */}
              <span className="note" style={{ alignSelf: 'center', flex: '0 1 auto', minWidth: 0, marginLeft: 'auto' }}>
                {featureId
                  ? <>● taken here, in the app &nbsp; ● uploaded, location unproven</>
                  : <>Grouped by visit · <span className="num">{ddmmyyyy(visit)}</span> · {plural(visitCount, 'photo')}</>}
              </span>
            </div>
          </div>

          <aside className="side">
            {featureId ? (
              <>
                <Provenance p={p} subject={subject} named={!!data.subject} />
                {unproven > 0 && !dismissedUnproven && (
                  <div className="card alert" style={{ marginBottom: 'var(--space-md)' }}>
                    <h3 className="down row tight">
                      <LinkOffOutlined sx={{ fontSize: 16 }} />
                      {' '}{plural(unproven, 'photo')} here {unproven === 1 ? 'proves' : 'prove'} nothing
                    </h3>
                    {/* This card used to tell every owner their photos were a
                        neighbour's WhatsApp forward from 2023, whoever had
                        filed them and whenever. Everything below is read off
                        the rows themselves: source, capture date, and the fact
                        that nothing verified them against the pin. */}
                    <p className="note" style={{ margin: '0.5rem 0', color: 'var(--w-ink-2)' }}>
                      {allForwarded
                        ? `Forwarded in rather than shot here${unprovenWhen ? `, dated ${unprovenWhen}` : ''}`
                        : `Filed from outside the app${unprovenWhen ? `, dated ${unprovenWhen}` : ''}`}
                      , so nothing has checked {unproven === 1 ? 'it' : 'them'} against the saved
                      pin. {unproven === 1 ? 'It is kept as a picture' : 'They are kept as pictures'}
                      {' '}but never used as evidence — not in a dispute, not in a listing, not for
                      a bank.
                    </p>
                    <div className="row tight">
                      {/* The pin editor this wants does not exist: it needs a
                          map picker plus a mutation that writes lat/lon onto a
                          photo row, and there is neither. The record-scoped
                          half of this screen dropped its "Pin on map" button
                          for the same reason; this one stays disabled because
                          the note below it is the answer to "then what do I do
                          about these", said in text a browser actually draws
                          rather than in a title attribute. */}
                      <button type="button" className="btn sm" disabled>
                        <MyLocationOutlined sx={{ fontSize: 15 }} /> Set their place by hand
                      </button>
                      <button type="button" className="btn sm" onClick={() => setDismissedUnproven(true)}>
                        Leave as is
                      </button>
                    </div>
                    <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
                      Placing a photo by hand is not built yet. Until it is, a photo&rsquo;s place
                      comes from the app that took it.
                    </p>
                  </div>
                )}
                <Card title="This photo is doing three jobs">
                  <p className="note" style={{ color: 'var(--w-ink-2)' }}>
                    It is {subject}&rsquo;s current condition on the Features
                    tab{p.orderRef && <>, the evidence on order {p.orderRef}</>}, and one of this
                    record&rsquo;s photos. One file, filed once, referenced from several places —
                    deleting it from one does not remove it from the others.
                  </p>
                </Card>
              </>
            ) : (
              <>
                <p className="eyebrow">Photo {i + 1} of {shown.length}</p>
                <input
                  aria-label="Caption"
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
                    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.375rem',
                    border: 0, background: 'none', padding: 0, marginBottom: '0.5rem',
                    width: '100%',
                  }}
                />
                <p className="note" style={{ marginBottom: 'var(--space-md)' }}>
                  Caption and tags are editable. Everything else here records what the camera
                  captured or controls how this photo is filed.
                </p>

                <KV
                  rows={[
                    { k: 'Taken', v: stamp(p.capturedAt) },
                    ...(p.localTime ? [{ k: 'Your time', v: p.localTime }] : []),
                    ...(p.capturedBy ? [{ k: 'By', v: p.capturedBy }] : []),
                    ...(p.lat > 0
                      ? [{ k: 'Where', v: `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` }]
                      : []),
                    // The chevron promised a destination the row did not have.
                    // `orderRef` is the human reference on the job, not the
                    // ticket's id, so the honest destination is the record's
                    // own list of orders, where that reference is printed.
                    ...(p.orderRef
                      ? [{ k: 'Order',
                           v: <Link className="accent" to={`/app/records/${id}/services`}>
                                {p.orderRef} ›
                              </Link> }]
                      : []),
                  ]}
                />

                <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Tags</p>
                <div className="row tight">
                  <Tag>Photos</Tag>
                  <Tag>{rec.title}</Tag>
                  <Tag>visit {ddmmyyyy(p.capturedAt.slice(0, 10))}</Tag>
                  {p.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
                  {/* This was a <span>: it looked like the way to add a tag, it
                      did nothing, and Tab walked straight past it. A real
                      button, not the Chip primitive — Chip announces
                      aria-pressed, and adding a tag is not a toggle. */}
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
                    <button ref={tagTrigger} type="button" className="chip"
                            onClick={() => {
                              tagCancelled.current = false;
                              setTagText('');
                              setAddingTag(true);
                            }}
                            style={{ borderStyle: 'dashed', color: 'var(--w-accent)', borderColor: 'var(--w-accent)' }}>
                      + tag
                    </button>
                  )}
                </div>

                <p className="eyebrow" style={{ marginTop: 'var(--space-lg)' }}>Do</p>
                <div className="grid4" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 'var(--space-xs)' }}>
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
                              downloadBlob(blob, p.fileName || 'photo.jpg');
                            } catch {
                              setDlErr('That photo could not be downloaded — the file storage could not be reached. The photo itself is untouched.');
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

                {/* "Pin on map" and "Share" stood in the grid above as disabled
                    buttons whose only explanation was a title attribute, which
                    no browser shows on a disabled control — two actions that
                    looked real and answered nothing. Neither has anything
                    behind it: no mutation writes a lat/lon onto a photo row,
                    and createShareLink takes a recordId, never a file. So the
                    grid holds the two that work and this says where the other
                    two live. The feature-scoped half of this screen states the
                    pin half of it again in its unproven-photos card, because
                    the two branches never render together. */}
                <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
                  Where a photo was taken comes from the app that took it — placing one by
                  hand is not built yet. Sharing is by record rather than by photo: Share
                  securely on this record&rsquo;s{' '}
                  <Link className="accent" to={`/app/records/${id}`}>Papers tab</Link> makes a
                  link to its papers for one named person.
                </p>

                <div className="card alert" style={{ marginTop: 'var(--space-lg)' }}>
                  <h3 className="down row tight">
                    <DeleteOutlineOutlined sx={{ fontSize: 16 }} /> Delete this photo
                  </h3>
                  <p className="note" style={{ marginTop: '0.5rem', color: 'var(--w-ink-2)' }}>
                    {p.tags.includes('boundary dispute')
                      ? <>It is evidence in a live boundary dispute and is attached to order {p.orderRef}, so it archives for 30 days first. Nothing about the order changes.</>
                      : <>It archives for 30 days before it is destroyed. Anything referencing it keeps working until then.</>}
                  </p>
                  <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                    {confirmDel ? (
                      <>
                        <button type="button" className="btn sm danger"
                                disabled={delPhoto.isPending}
                                onClick={() => {
                                  setActionErr('');
                                  delPhoto.mutate({ photoId: p.id }, {
                                    onSuccess: (res) => {
                                      if (!res.web.deletePhoto) {
                                        setActionErr('That photo could not be deleted. It may already be gone — reload the gallery.');
                                        return;
                                      }
                                      setConfirmDel(false);
                                      setI((v) => Math.max(0, v - 1));
                                    },
                                  });
                                }}>
                          {delPhoto.isPending ? 'Deleting…' : 'Yes, delete it'}
                        </button>
                        <button type="button" className="btn sm" onClick={() => setConfirmDel(false)}>
                          Keep it
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn sm danger"
                              aria-label={`Delete ${p.caption || 'this photo'}`}
                              onClick={() => setConfirmDel(true)}>
                        <DeleteOutlineOutlined sx={{ fontSize: 15 }} /> Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* This used to advertise bulk select, next to a Select button
                    that did nothing; both are gone. Tagging, download and
                    delete are per-photo, and there is no server call that
                    takes a set of photo ids, so nothing here can do a visit at
                    once until one exists. */}
                <p className="note" style={{ marginTop: 'var(--space-md)' }}>
                  Tags, download and delete apply to the photo you are looking at. Use the search
                  above to bring one visit&rsquo;s photos into the strip.
                </p>
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
                 }>
            The search reads captions, tags, file names and capture dates.
          </Empty>
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
                     <ImageOutlined sx={{ fontSize: 15 }} /> All photos on this record
                   </Link>
                 }>
            The record&rsquo;s other photos are filed against the record itself or another
            feature. Ask for a fresh photo above to put one on this feature.
          </Empty>
        </div>
      ) : (
        <div className="split">
          <div>
            <DropZone />
            <p className="note" style={{ marginTop: 'var(--space-md)' }}>
              Drag files straight onto the box, or browse for them. A photo taken on the land
              carries its date and its coordinates — that is what makes the condition on the{' '}
              <Link className="accent" to={`/app/records/${id}/features`}>Features</Link>
              {' '}hanger checkable by somebody who was not there.
            </p>
          </div>

          <aside className="stack">
            <Card title="What to photograph" className="railcard">
              <ul className="railnotes">
                <li>Each boundary stone</li>
                <li>The bore head and the pump</li>
                <li>The approach road and the gate</li>
                <li>One wide shot from each corner</li>
              </ul>
            </Card>

            <Card title="Limits" className="railcard">
              <p className="note" style={{ margin: 0 }}>
                Photo or video, up to {mb(MAX_UPLOAD_BYTES)} each.
                Stored against this record only.
                Visible to you until you share.
              </p>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
