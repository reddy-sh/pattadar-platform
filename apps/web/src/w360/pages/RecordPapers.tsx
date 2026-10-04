/** W03 — the record's default hanger, because that is what a piece of land IS
 *  in the Indian system: a stack of paper that agrees with itself.
 *
 *  The record's own identity — its name, extent, place, the actions against it
 *  and how much of it is filled in — is the shell's (RecordHead.tsx), so this
 *  screen is now only the papers and what is missing from them. The four-stat
 *  strip that used to head it is gone: the extent is a chip in the header, and
 *  the worth, the rate and the year are the Money hanger's subject, which is
 *  the point of Money being a hanger. */
import { useId, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import DocumentScannerOutlined from '@mui/icons-material/DocumentScannerOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import ShoppingCartCheckoutOutlined from '@mui/icons-material/ShoppingCartCheckoutOutlined';

import {
  useAddPaper, useDeletePaper, useDocument, useOrderServiceBatch, useOrders,
  usePapers, useServicesOffered, useUpdatePaper,
} from '../api';
import type { Order, ServiceBatchReceipt } from '../api';
import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, limitFor, mediaKindOf, mb } from '../filePhotos';
import { describeReading, displayDetail, unreadRow } from '../paperFiling';
import { STORAGE_OFFLINE_MSG, uploadToDrive } from '../../pages/documents/storage';
import { UNREACHABLE_NOTE } from '../../data/useLiveOrSample';
import {
  Card, Chip, FacetFilter, Failed, Icon, KV, State, Tag,
  SHELF_WORD, ddmmyyyy, inr, nounFor, plural,
} from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { SkRowItems } from '../skeletons';
import { readDocument } from '../../pages/documents/upload';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { ConfirmDialog } from './PropertyActions';
import { PaperPreview } from '../paper/PaperPreview';
import { ServiceVisual } from '../ServiceVisual';

/** What a record of each kind is asked to produce, and why the asker wants it.
 *
 *  Keyed by shelf, so "has it" is a question the filed papers can answer
 *  themselves. The wording is the sentence a buyer, a bank or a court would
 *  use — the shelf name alone ("Revenue record") does not tell an owner that
 *  its absence is what stops a loan.
 */
const EXPECTED_SHELVES: Record<'parcel' | 'built', { shelf: string; say: string }[]> = {
  parcel: [
    { shelf: 'title', say: 'No sale deed or title document on file' },
    { shelf: 'revenue', say: 'No patta or 1-B on file' },
    { shelf: 'search', say: 'No encumbrance certificate or tax receipt' },
    { shelf: 'map', say: 'No survey map or FMB sheet on file' },
  ],
  built: [
    { shelf: 'title', say: 'No sale deed or title document on file' },
    { shelf: 'search', say: 'No encumbrance certificate or tax receipt' },
    { shelf: 'identity', say: 'No approval or occupancy document on file' },
  ],
};

/** Which shelf a paper goes on. "Let Pattadar decide" is first and is the
 *  default, because the reader is right most of the time and the owner should
 *  not have to classify a document they have just photographed. The override is
 *  here for when it is wrong — which, before this drawer, meant filing the paper
 *  and then renaming it from its row. */
const SHELVES = ['title', 'revenue', 'map', 'search', 'identity', 'old', 'photos'];
const READ_IT = '';

/**
 * Filing a paper, in the drawer every hanger now uses.
 *
 * There was no panel here at all: the header's "Add a paper" clicked a hidden
 * file input, and picking a file uploaded it, read it, shelved it and filed it
 * with nothing shown in between. When it worked that was fast; when it did not,
 * the only trace was a red sentence under the section head, and there was never
 * a moment at which the owner could see what they had picked, or say where it
 * should go.
 *
 * The drawer is that moment. It holds the pick, prints every file with its size
 * against the limit, lets a wrong one be taken out before a byte is sent, and
 * offers the shelf as an override rather than a correction after the fact.
 *
 * Filing is still per-file and still best-effort in the same order it always
 * was — upload, read, file — because a reader that is down must leave the paper
 * filed under its own name in Unsorted, which is exactly where it can be found
 * and sorted by hand.
 */
export function PaperDrawer({ recordId, recordTitle, onClose, returnFocus, folderId = '' }: {
  recordId: string;
  recordTitle: string;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
  /** Documents' open folder, so an upload lands where the owner is looking. */
  folderId?: string;
}) {
  const addPaper = useAddPaper(false);
  const whyId = useId();
  const [picked, setPicked] = useState<File[]>([]);
  const [shelf, setShelf] = useState(READ_IT);
  const [filing, setFiling] = useState(false);
  const [err, setErr] = useState('');
  /** Everything went in, and there is something about it the owner has to be
   *  told — a paper the reader could not make sense of is sitting in Unsorted
   *  waiting to be shelved by hand.
   *
   *  Kept apart from `err` because it is not a failure and must not close the
   *  panel by itself: setting the message and then closing on the same tick,
   *  which is what this did, made the sentence unreachable. The owner got a
   *  green toast and nothing saying a paper needed sorting. There is no toast
   *  now at all: the filed rows appearing in the list is the answer, and
   *  design.md keeps success silent. */
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const tooBig = picked.filter((f) => f.size > limitFor(f));
  const invalidPhotos = shelf === 'photos'
    ? picked.filter((f) => mediaKindOf(f) !== 'photo' && mediaKindOf(f) !== 'video') : [];
  const ready = picked.length > 0 && tooBig.length === 0 && invalidPhotos.length === 0 && !filing;
  // Why the primary is greyed, beside it, rather than a dead button to work
  // out. Nothing while it is filing: the label already says "Filing…".
  const why = filing || notice ? ''
    : picked.length === 0 ? 'Choose a scan or photograph to file.'
      : invalidPhotos.length > 0 ? 'Choose image or video files when filing these under Photos & video.'
        : tooBig.length > 0 ? `Take out ${tooBig.length > 1 ? 'the files' : 'the file'} over its size limit first.`
        : '';

  /** Added to what is already here, not swapped for it. Somebody filing a deed
   *  and its two annexures picks them from three different folders, and a second
   *  pick that silently replaced the first is how the annexures go missing.
   *  De-duplicated on name and size, because picking the same folder twice is
   *  the other half of that. */
  const take = (files: File[]) => {
    if (!files.length) return;
    setErr('');
    setPicked((have) => [
      ...have,
      ...files.filter((f) => !have.some((h) => h.name === f.name && h.size === f.size)),
    ]);
  };

  async function file() {
    if (!ready) return;
    setFiling(true);
    setErr('');
    setNotice('');
    let done = 0;
    const unread: string[] = [];
    try {
      for (const f of picked) {
        /** `uploadToDrive` THROWS on every failure — it is typed
         *  `Promise<StoredNode>` and its own catch re-raises as a
         *  StorageUploadError (storage.ts). So the `if (!node)` this code used
         *  to carry was dead, and a gateway that was down fell through to the
         *  filing catch below and told the owner their paper "was uploaded but
         *  could not be filed" — the one thing that had definitely not
         *  happened. The reason storage gives is the reason worth printing. */
        let node;
        try {
          node = await uploadToDrive(f);
        } catch {
          /** One message for the batch: the gateway is there for all of these
           *  files or for none of them. And it is this composed sentence rather
           *  than the thrown one — a StorageUploadError often carries the
           *  gateway's own words ("storage is not running"), which this file's
           *  own rule puts in a toast's mono detail line and never in the
           *  sentence a person is asked to act on. */
          setErr(STORAGE_OFFLINE_MSG);
          break;
        }

        // Read it before filing it. A reader that is down, or a file it cannot
        // make sense of, must still leave the paper filed — under its own name,
        // in Unsorted, which is exactly where it can be found and sorted by hand.
        const isVideo = mediaKindOf(f) === 'video';
        let row = shelf === 'photos' || isVideo
          ? { name: node.name, subtitle: '', shelf: 'photos', pageCount: 0 }
          : unreadRow(node.name, f.type);
        let couldNotRead = false;
        if (shelf !== 'photos' && !isVideo) {
          try {
            row = describeReading(await readDocument(f, f.name), f);
          } catch {
            couldNotRead = true;
          }
        }
        // The owner's answer beats the reader's. It is only ever an override —
        // left on "Let Pattadar decide", the shelf the document was read into
        // is the one it lands on.
        if (shelf && !isVideo) row = { ...row, shelf };

        try {
          const res = await addPaper.mutateAsync({
            recordId, fileRef: node.id, name: row.name, subtitle: row.subtitle,
            shelf: row.shelf, pageCount: row.pageCount,
            mimeType: node.mimeType, sizeBytes: node.sizeBytes,
            // Only from inside a Documents folder; a record's own upload
            // sends exactly what it always did.
            ...(folderId ? { folderId } : {}),
          });
          if (!res.web.addPaper) {
            setErr(`${f.name} was uploaded but could not be filed.`
              + ` ${done} of ${picked.length} were filed.`);
            break;
          }
          done += 1;
          // Only worth saying when the reader was the one deciding the shelf.
          // Under an override the paper went exactly where it was told to.
          if (couldNotRead && !shelf) unread.push(f.name);
        } catch {
          setErr(`${f.name} was uploaded but could not be filed.`
            + ` ${done} of ${picked.length} were filed.`);
          break;
        }
      }
    } finally {
      setFiling(false);
      // Whatever went in is in, so it comes off the list either way — a second
      // press must not file the same scan twice. The panel stays open when
      // something was left behind, with the message and the remaining files.
      if (done) {
        setPicked((have) => have.slice(done));
        if (done === picked.length) {
          // A paper nothing could be read from is filed under its own filename
          // in Unsorted, and needs shelving by hand. That is worth a sentence
          // the owner can actually read, so the panel HOLDS rather than closing
          // over it — it closes on Done. Nothing left to file, so nothing here
          // can be filed twice.
          if (unread.length) {
            setNotice(unread.length === 1
              ? `${unread[0]} could not be read. Filed in Unsorted.`
              : `${unread.length} could not be read. Filed in Unsorted: ${unread.join(', ')}.`);
          } else {
            onClose();
          }
        }
      }
    }
  }

  return (
    <Drawer
      eyebrow={recordId ? drawerEyebrow(recordTitle, 'Documents') : 'Your documents'}
      title={picked.length > 1 ? `${recordId ? 'File' : 'Add'} ${picked.length} documents` : recordId ? 'File a document' : 'Add a document'}
      onClose={onClose}
      onSubmit={() => (notice ? onClose() : void file())}
      busy={filing}
      dirty={picked.length > 0}
      discardCopy={{
        title: 'Discard this pick?',
        body: 'The files you picked will not be uploaded.',
      }}
      initialFocus=".scanbox button"
      returnFocus={returnFocus}
      // Once everything is filed the panel is only holding a notice, so the
      // primary is the way out of it rather than a second filing. The
      // secondary keeps its one word: it used to become "Go to Documents",
      // which closed a drawer that was already on Documents.
      primaryWhy={why ? { id: whyId, text: why } : undefined}
      primary={notice ? (
        <DrawerAction label="Done" working="Done" />
      ) : (
        <DrawerAction
          label={picked.length > 1 ? `File ${picked.length} documents` : 'File the document'}
          working="Filing…"
          pending={filing}
          disabled={!ready}
          describedBy={why ? whyId : undefined}
        />
      )}
    >
      <input
        ref={input}
        type="file" hidden multiple
        accept="image/*,video/*,application/pdf"
        // Unchanged wording on purpose: it is how every suite that files a paper
        // reaches the picker, and the picker moving into the drawer is not a
        // reason for its name to move with it.
        aria-label={recordId ? 'Add a document to this property' : 'Add a document to your vault'}
        onChange={(e) => {
          // Copy before clearing: resetting value empties the live FileList this
          // would otherwise still point at, and the reset is what lets the same
          // file be picked twice in a row.
          const next = Array.from(e.target.files ?? []);
          e.target.value = '';
          take(next);
        }}
      />

      {/* A real button over the hidden input, never a <label> wrapping one: a
          label takes no focus and `hidden` puts the input out of the tab order,
          so that shape makes filing a paper impossible with a keyboard. */}
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
          <DocumentScannerOutlined sx={{ fontSize: 18 }} aria-hidden />
          Drop a scan, photograph or video here
        </p>
        <p className="dropline">
          Up to {mb(MAX_UPLOAD_BYTES)} for scans and photos; {mb(MAX_VIDEO_BYTES)} for videos.
        </p>
        <div className="row tight">
          <button type="button" className="btn" onClick={() => input.current?.click()}>
            Browse files
          </button>
        </div>
      </div>

      {picked.length > 0 && (
        <div className="field">
          <label>What you picked</label>
          <div className="card" style={{ padding: 0 }}>
            <div className="rows boxed">
              {picked.map((f) => {
                const cap = limitFor(f);
                const over = f.size > cap;
                return (
                  <div key={`${f.name}-${f.size}`}>
                    <span style={{ display: 'flex', color: over ? 'var(--w-danger)' : 'var(--w-ink-3)' }}>
                      <Icon name="papers" size={17} />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.875rem', overflowWrap: 'anywhere' }}>
                        {f.name}
                      </span>
                      <span className="note mono" style={{ display: 'block', fontSize: '0.6875rem' }}>
                        {mb(f.size)}{over && ` · over the ${mb(cap)} limit`}
                      </span>
                    </span>
                    <button type="button" className="iconbtn" aria-label={`Take ${f.name} out`}
                            disabled={filing}
                            onClick={() => setPicked((have) => have.filter((h) => h !== f))}>
                      <CloseOutlined sx={{ fontSize: 16 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Said before anything is sent, and it names the files. The whole pick
              is refused rather than part-filed: picking five scans with an
              oversize third one used to file the first two and then say "nothing
              was uploaded", so the owner picked all five again and filed two of
              them twice. */}
          {tooBig.length > 0 && (
            <span className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
              Remove {tooBig.length > 1 ? 'those' : 'that one'} to file the rest.
            </span>
          )}
          {invalidPhotos.length > 0 && (
            <span className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
              Remove files other than images or videos to file this selection under Photos & video.
            </span>
          )}
        </div>
      )}

      <div className="field">
        <label>Which shelf</label>
        {/* Washed when chosen: a choice is not an action, and the drawer's
            one amber fill is the button that files. */}
        <div className="row tight">
          <Chip wash active={shelf === READ_IT} onClick={() => setShelf(READ_IT)}>
            Let Pattadar decide
          </Chip>
          {SHELVES.map((s) => (
            <Chip key={s} wash active={shelf === s} onClick={() => setShelf(s)}>
              {SHELF_WORD[s] ?? s}
            </Chip>
          ))}
        </div>
      </div>

      {/* `status`, not `alert`: the papers ARE filed, and a red warning about a
          successful filing is the screen telling the owner something went wrong
          when nothing did. It is a thing to do next, not a failure. */}
      {notice && (
        <p className="note" role="status" style={{ margin: 0, color: 'var(--w-ink-2)' }}>
          {notice}
        </p>
      )}

      {err && (
        <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
      )}
    </Drawer>
  );
}

export function RecordPapers() {
  const rec = useRecordCtx();
  const delPaper = useDeletePaper(false);
  const editPaper = useUpdatePaper(false);
  const [editId, setEditId] = useState('');
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [paperErr, setPaperErr] = useState('');
  const [confirmId, setConfirmId] = useState('');
  // The title opens the preview drawer on a plain click; a modified click and
  // the deep link still route to the full Reader. Focus returns to the papers
  // list when the drawer closes.
  const [preview, setPreview] = useState('');
  const openPreview = (e: MouseEvent, id: string) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setPreview(id);
  };
  // The share panel, the edit drawer and the archive/delete confirmations all
  // hang off the record header, which is the shell's now — RecordHead.tsx. So
  // is `?share=1`, which the Properties kebab deep-links with.
  //
  // The map and the photographs left with them, in the other direction: they
  // are what the Location and Media hangers are FOR, and a thumbnail of each
  // in this rail was the same ground and the same gallery said twice. The rail
  // here is about the papers — what is missing from them, and what the deed
  // says.
  //
  // Picking and filing left too, into PaperDrawer above: the header button used
  // to click a hidden input and file whatever came back with nothing shown in
  // between, so `pickPaper`, `filing` and `filePapers` all belong to the panel
  // that now holds the pick.
  const addTrigger = useRef<HTMLButtonElement>(null);
  const paperList = useRef<HTMLDivElement>(null);
  const renameTriggers = useRef(new Map<string, HTMLButtonElement>());
  const removeTriggers = useRef(new Map<string, HTMLButtonElement>());

  const restoreRowFocus = (
    triggers: React.MutableRefObject<Map<string, HTMLButtonElement>>,
    id: string,
  ) => requestAnimationFrame(() => triggers.current.get(id)?.focus());

  const noun = nounFor(rec.kind, rec.classification);
  const { data: papers, isLoading, error: papersErr, refetch: refetchPapers } = usePapers(rec.id);
  const [shelfSel, setShelfSel] = useState<string[]>([]);
  const [q, setQ] = useState('');

  const shelves = useMemo(() => {
    const counts = new Map<string, number>();
    (papers ?? []).forEach((p) => counts.set(p.shelf, (counts.get(p.shelf) ?? 0) + 1));
    return [...counts.entries()];
  }, [papers]);
  // The shelves as the one filter surface list pages share (FacetFilter), not
  // a page-local chip row whose pressed chip filled amber beside the header's
  // two buttons. Counted from the papers themselves, so an option can never
  // promise a shelf that holds nothing.
  const shelfGroup = useMemo(() => [{
    key: 'shelf', label: 'Shelf',
    options: shelves.map(([k, n]) => ({ key: k, label: SHELF_WORD[k] ?? k, count: n })),
  }], [shelves]);
  // A shelf the papers no longer fill is not a filter. Unfile the last paper
  // on the shelf being filtered on and the option goes, so the selection goes
  // with it — the Site features tab's rule — rather than hiding every paper
  // left behind a filter on a shelf that is not there.
  const activeShelves = shelfSel.filter((k) => shelves.some(([s]) => s === k));
  // Toggled from what is actually on, so a shelf dropped above cannot come
  // back on by itself the next time a paper lands on it.
  const toggleShelf = (_group: string, key: string) =>
    setShelfSel(activeShelves.includes(key)
      ? activeShelves.filter((k) => k !== key)
      : [...activeShelves, key]);

  const shown = (papers ?? []).filter((p) =>
    (activeShelves.length === 0 || activeShelves.includes(p.shelf))
    && (!q.trim() || `${p.title} ${p.detail}`.toLowerCase().includes(q.trim().toLowerCase())));

  // "5 documents · showing 1" — the count, and what the filter is doing to
  // it. The shelf breakdown is the filter's own business (each option carries
  // its count), so it is not printed a second time here. Nothing about expiry:
  // no paper in this system carries an expiry date, so "nothing expiring"
  // would be an assertion rather than a reading.
  const papersSub = [
    plural(papers?.length ?? rec.paperCount, 'document'),
    (activeShelves.length > 0 || q.trim()) && `showing ${shown.length}`,
  ].filter(Boolean).join(' · ');

  // Removing a paper unfiles evidence, so it asks in the shared dialog, naming
  // the document, rather than in a two-button pair squeezed into the row.
  const confirmPaper = (papers ?? []).find((p) => p.id === confirmId);
  const [removeErr, setRemoveErr] = useState('');
  const closeRemove = () => {
    const id = confirmId;
    setRemoveErr('');
    setConfirmId('');
    restoreRowFocus(removeTriggers, id);
  };
  const removePaper = () => {
    if (!confirmPaper) return;
    const { id, title } = confirmPaper;
    setRemoveErr('');
    delPaper.mutate({ paperId: id, recordId: rec.id }, {
      onSuccess: (res) => {
        if (res.web.deletePaper) {
          setConfirmId('');
          requestAnimationFrame(() => paperList.current?.focus());
        } else {
          setRemoveErr(`${title} could not be removed. Reload the page.`);
        }
      },
      onError: () => setRemoveErr(`${title} was not removed. It is still filed here.`),
    });
  };

  // The shelves a record of this kind is asked for, against the ones it can
  // actually produce. This is the question a buyer or a bank opens with, and
  // the record had no way of putting it: the owner had to know for themselves
  // which of the eight shelves should not be empty.
  const missing = papers
    ? EXPECTED_SHELVES[rec.kind === 'parcel' ? 'parcel' : 'built']
      .filter((s) => !papers.some((p) => p.shelf === s.shelf))
    : [];
  // Keep the paper-service catalogue available even after every shelf is
  // filled: an active request still belongs on this page until it closes.
  const offers = useServicesOffered('', '', true, rec.id);
  const openOrders = useOrders(rec.id);
  const placeBatch = useOrderServiceBatch(false);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [reviewingBatch, setReviewingBatch] = useState(false);
  const [batchConfirmed, setBatchConfirmed] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [batchReceipt, setBatchReceipt] = useState<ServiceBatchReceipt | null>(null);
  const batchIntent = useRef({ fingerprint: '', key: '' });

  const missingShelves = new Set(missing.map((m) => m.shelf));
  const suggestedOffers = (offers.data ?? [])
    .filter((o) => o.shelves.some((s) => missingShelves.has(s)));
  const openByKind = new Map((openOrders.data ?? []).map((o) => [o.kind, o]));
  const alreadyOpen = new Set(openByKind.keys());
  const availableOffers = suggestedOffers.filter((o) => !alreadyOpen.has(o.key));
  const selectedOffers = availableOffers.filter((o) => selectedServices.includes(o.key));
  const selectedTotal = selectedOffers.reduce((sum, o) => sum + o.price, 0);
  const paperOfferByKind = new Map(
    (offers.data ?? []).filter((offer) => offer.shelves.length > 0)
      .map((offer) => [offer.key, offer]),
  );
  const requestedPaperOrders = (openOrders.data ?? [])
    .filter((order) => paperOfferByKind.has(order.kind));
  // A missing shelf disappears from the rail when every service that can fill
  // it is already active. If another unraised option remains (EC is active but
  // the tax receipt is not), the shelf stays and shows only that option.
  const missingGroups = missing.map((item) => {
    const known = suggestedOffers.filter((offer) => offer.shelves.includes(item.shelf));
    return {
      ...item,
      choices: known.filter((offer) => !alreadyOpen.has(offer.key)),
      allRequested: known.length > 0 && known.every((offer) => alreadyOpen.has(offer.key)),
    };
  }).filter((group) => !group.allRequested);

  const toggleService = (key: string) => {
    setBatchError('');
    setBatchReceipt(null);
    setBatchConfirmed(false);
    setReviewingBatch(false);
    setSelectedServices((current) => current.includes(key)
      ? current.filter((value) => value !== key)
      : [...current, key]);
  };

  const submitBatch = async () => {
    if (!batchConfirmed || selectedServices.length === 0) return;
    setBatchError('');
    const items = selectedServices.slice().sort().map((kind) => ({ kind, params: {} }));
    const fingerprint = JSON.stringify([rec.id, items]);
    if (batchIntent.current.fingerprint !== fingerprint) {
      batchIntent.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      const result = await placeBatch.mutateAsync({
        recordId: rec.id,
        items: JSON.stringify(items),
        note: 'From missing documents',
        idempotencyKey: batchIntent.current.key,
      });
      if (!result.web.orderServiceBatch) {
        setBatchError('Those service orders were not placed. Check the selection and try again.');
        return;
      }
      setBatchReceipt(result.web.orderServiceBatch);
      setSelectedServices([]);
      setReviewingBatch(false);
      setBatchConfirmed(false);
    } catch {
      setBatchError('That did not reach Pattadar. No service order was placed. Try again.');
    }
  };

  // The title deed itself, for the rail. Read from the document rather than
  // parsed out of the row's display line — "Registered 2019-10-13 · Podili"
  // is a sentence composed for a human, and picking it apart again would break
  // the first time that sentence is reworded.
  const titlePaper = (papers ?? []).find((p) => p.shelf === 'title');
  const { data: deed } = useDocument(titlePaper?.id);
  const hasRailContent = missingGroups.length > 0
    || Boolean(deed && (deed.registeredOn || deed.office || deed.consideration > 0))
    || Boolean(rec.khataNo || rec.ownerName);

  return (
    <>
      {/* The tab's own noun. The placeholder only ever says what the box is
          for: the empty state below is the one place that says there is
          nothing filed yet. */}
      <SectionHead
        title="Documents"
        sub={papersSub}
        actions={(
          <>
            <span className="search" style={{ width: '16rem' }}>
              <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search documents"
                aria-label="Search this property's documents"
              />
            </span>
            <button ref={addTrigger} type="button" className="btn primary"
                    aria-haspopup="dialog" aria-expanded={adding}
                    onClick={() => setAdding(true)}>
              <AddOutlined sx={{ fontSize: 15 }} aria-hidden /> Add a document
            </button>
          </>
        )}
      />

      <div className={`split${hasRailContent ? '' : ' no-rail'}`}>
        <div>
          {adding && (
            <PaperDrawer
              recordId={rec.id}
              recordTitle={rec.title}
              returnFocus={addTrigger}
              onClose={() => setAdding(false)}
            />
          )}

          {preview && (
            <PaperPreview
              paperId={preview}
              onClose={() => setPreview('')}
              returnFocus={paperList}
            />
          )}

          {/* The shelves this record's own papers fall in, as filters — and only
              when there are any. This row used to carry the upload size limit
              and the "filing…" progress line as well, both of which now belong
              to the drawer that does the filing: the limit is printed against
              each picked file, beside the file it is about. */}
          {shelves.length > 0 && (
            <FacetFilter
              groups={shelfGroup}
              selected={{ shelf: activeShelves }}
              onToggle={toggleShelf}
              onClear={() => setShelfSel([])}
              ariaLabel="Filter documents"
            />
          )}

          {/* The rename's own line. Filing reports inside its drawer and
              removing inside its dialog, so this is only ever about a rename —
              which clears it before it starts. `alert` because it is the only
              notice that a paper kept its old name. */}
          {paperErr && (
            <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{paperErr}</p>
          )}

          {confirmPaper && (
            <ConfirmDialog
              title={`Remove ${confirmPaper.title}?`}
              // What delete_paper actually does (web360.py): the paper is
              // unfiled and its share links are deleted; the stored bytes stay.
              body={`It comes off this ${noun}'s documents and any share link to it stops working. The stored file itself is kept.`}
              actionLabel="Remove"
              danger
              busy={delPaper.isPending}
              error={removeErr}
              onConfirm={removePaper}
              onClose={closeRemove}
            />
          )}

          {requestedPaperOrders.length > 0 && (
            <section className="paper-requests" aria-labelledby="paper-requests-title">
              <div className="paper-requests-head">
                <div>
                  <p className="eyebrow">Being requested</p>
                  <h2 id="paper-requests-title">Requested documents</h2>
                </div>
                <span className="mono note">{plural(requestedPaperOrders.length, 'request')}</span>
              </div>
              <div className="paper-request-grid">
                {requestedPaperOrders.map((order: Order) => {
                  const offer = paperOfferByKind.get(order.kind);
                  return (
                    <article key={order.id} className="paper-request-tile">
                      <ServiceVisual serviceKey={order.kind} label={order.title}
                                     visual={offer?.visual} variant="thumb" />
                      <span className="grow">
                        <span className="row tight">
                          <strong>{order.title}</strong>
                          <span className="mono note">{order.ref}</span>
                          <State state={order.statusState}>{order.statusLabel}</State>
                        </span>
                        <span className="note paper-request-purpose">
                          {offer?.shelves.map((shelfKey) => SHELF_WORD[shelfKey] ?? shelfKey).join(' · ')}
                          {order.dueDate && ` · due ${ddmmyyyy(order.dueDate)}`}
                        </span>
                      </span>
                      <span className="num">{inr(order.cost)}</span>
                      {/* "Cancel request", not "Cancel": this opens the order's
                          own cancel step, and on this tab a bare Cancel already
                          means closing a drawer or stopping a rename. */}
                      <span className="row tight paper-request-actions">
                        <Link className="btn sm" to={`/app/services/${order.id}`}>Open request</Link>
                        <Link className="btn sm" to={`/app/services/${order.id}?action=cancel`}>Cancel request</Link>
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* The placeholder rows go INSIDE the list's own card, not above it.
              A grey slab stacked on an empty bordered box is two containers
              where the answer will be one, and the card jumped up the page the
              moment the papers landed. */}
          <div className="card" style={{ padding: 0 }}>
            <div
              ref={paperList}
              className="rows boxed"
              tabIndex={-1}
              role={isLoading ? 'status' : undefined}
              aria-busy={isLoading || undefined}
              aria-label={isLoading ? `Loading the papers on this ${noun}` : undefined}
            >
              {isLoading && <SkRowItems rows={3} />}
              {shown.map((p) => (
                <div key={p.id}>
                  <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem' }}>
                    <Icon name={p.shelf === 'unsorted' ? 'paper' : p.shelf} size={18} />
                  </span>
                  <span className="grow">
                    <Link to={`/app/papers/${p.id}`}
                          onClick={(e) => openPreview(e, p.id)}
                          style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700, fontSize: '0.9375rem' }}>
                      {p.title}
                    </Link>
                    <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>{displayDetail(p.detail)}</span>
                  </span>
                  {/* Wraps below 640px (`.paper-row-actions`, w360.css): on a
                      phone the chip, the tags and the two icons were one
                      non-wrapping line wider than the screen. */}
                  <span className="row tight paper-row-actions">
                    <Chip>{SHELF_WORD[p.shelf] ?? p.shelf}</Chip>
                    {p.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
                    {p.shared && (
                      <span className="note row tight" style={{ color: 'var(--w-info)' }}>
                        <LinkOutlined sx={{ fontSize: 13 }} aria-hidden /> shared
                      </span>
                    )}
                    {/* Removing asks in the shared dialog, naming the paper: a
                        paper is evidence, and one stray click on a row should
                        not unfile it. */}
                    {editId === p.id ? (
                      <form className="row tight paper-rename" onSubmit={(e) => {
                        e.preventDefault();
                        // The row used to close on the press and fire the
                        // rename into the void, so a refusal left the old title
                        // on screen with nothing said anywhere. It now stays
                        // open until the answer comes back — and the answer
                        // includes `false` on an otherwise perfect 200, which
                        // is the server declining to touch that row.
                        const name = draft.trim();
                        if (!name) {
                          setPaperErr('A document needs a name.');
                          return;
                        }
                        setPaperErr('');
                        editPaper.mutate({ paperId: p.id, name, shelf: '' }, {
                          onSuccess: (res) => {
                            if (res.web.updatePaper) {
                              setEditId('');
                              restoreRowFocus(renameTriggers, p.id);
                            }
                            else setPaperErr(`${p.title} could not be renamed. It is still filed under its old name.`);
                          },
                          onError: () => setPaperErr(`${p.title} was not renamed. Try again.`),
                        });
                      }}>
                        <span className="search" style={{ flex: '1 1 9rem', minWidth: 0 }}>
                          <input value={draft} autoFocus aria-label={`Rename ${p.title}`}
                                 onChange={(e) => setDraft(e.target.value)} />
                        </span>
                        <button type="submit" className="btn sm" disabled={editPaper.isPending}>
                          {editPaper.isPending ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="btn sm"
                                onClick={() => {
                                  setPaperErr('');
                                  setEditId('');
                                  restoreRowFocus(renameTriggers, p.id);
                                }}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <button ref={(node) => {
                                  if (node) renameTriggers.current.set(p.id, node);
                                }} type="button" className="iconbtn" aria-label={`Rename ${p.title}`}
                                onClick={() => { setPaperErr(''); setEditId(p.id); setDraft(p.title); }}>
                          <EditOutlined sx={{ fontSize: 16 }} />
                        </button>
                        {/* The dialog holds until the server says the paper is
                            gone, so a refusal — or an offline browser — never
                            reads as a Remove that worked. */}
                        <button ref={(node) => {
                                  if (node) removeTriggers.current.set(p.id, node);
                                }} type="button" className="iconbtn" aria-label={`Remove ${p.title}`}
                                aria-haspopup="dialog"
                                onClick={() => { setRemoveErr(''); setConfirmId(p.id); }}>
                          <DeleteOutlineOutlined sx={{ fontSize: 17 }} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              ))}
              {/* A read that never came back is not an empty shelf. With the
                  error dropped, a 502 landed on "No paper here matches that."
                  — with no filter typed, beside a box offering to search the
                  12 papers the header still counted. Gated on `!papers` rather
                  than on the error alone: a background refetch that fails
                  after a good load leaves data AND error set, and an error
                  slab there would hide papers the owner can still read. */}
              {!isLoading && !papers && papersErr && (
                <div>
                  <Failed what="These documents" error={papersErr} onRetry={() => void refetchPapers()} />
                </div>
              )}
              {!isLoading && !papers && !papersErr && (
                <div>
                  {/* The app's one unreachable sentence, not a private one. */}
                  <p className="note" role="status">{UNREACHABLE_NOTE}</p>
                </div>
              )}
              {/* Two different emptinesses: nothing filed at all, versus a
                  filter that happened to miss. Both need the papers to have
                  actually arrived before either can be claimed. */}
              {!isLoading && papers && shown.length === 0 && (
                <div>
                  <p className="note">
                    {papers.length === 0
                      ? `No documents on this ${noun} yet.`
                      : 'No document here matches that.'}
                  </p>
                  {/* No second "Add a document" here: the header already opens
                      the same drawer, and one flow belongs on the screen once. */}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="stack">
          {/* Only while it has something to say. A record that can produce
              every shelf it is asked for (EXPECTED_SHELVES: four for land,
              three for a building) should not carry an empty box headed "what
              is missing" — the absence IS the answer, and the papers list
              beside it already shows what is there. */}
          {missingGroups.length > 0 && (
            <Card title="Missing documents" className="railcard">
              {offers.isLoading && <p className="note" role="status">Checking available services…</p>}
              {!offers.isLoading && offers.error && (
                <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>
                  Prices and services could not be loaded, so ordering is unavailable.
                </p>
              )}

              <div className="missing-services">
                {missingGroups.map((m) => {
                  const { choices } = m;
                  return (
                    <section key={m.shelf} className="missing-group">
                      <strong>{SHELF_WORD[m.shelf] ?? m.shelf}</strong>
                      <span className="note">{m.say}</span>
                      {choices.map((offer) => (
                          <label key={offer.key} className="service-choice">
                            <input
                              type="checkbox"
                              checked={selectedServices.includes(offer.key)}
                              disabled={placeBatch.isPending}
                              onChange={() => toggleService(offer.key)}
                            />
                            <ServiceVisual serviceKey={offer.key} label={offer.label}
                                           visual={offer.visual} variant="thumb" />
                            <span className="grow">
                              <span className="row between tight">
                                <span>{offer.label}</span>
                                <span className="num">{inr(offer.price)}</span>
                              </span>
                              <span className="note">{offer.visual.caption}</span>
                              <span className="note">Usually within {offer.days} days</span>
                            </span>
                          </label>
                        ))}
                      {offers.data && choices.length === 0 && (
                        <span className="note">No office-fetch service is available for this yet.</span>
                      )}
                    </section>
                  );
                })}
              </div>

              {availableOffers.length > 1 && !reviewingBatch && (
                <button type="button" className="link" onClick={() => {
                  setSelectedServices(availableOffers.map((o) => o.key));
                  setBatchReceipt(null);
                }}>
                  Add all available
                </button>
              )}

              {/* Outlined: reviewing commits nothing, and the page's one fill
                  is the header's "Add a document". The fill belongs to the
                  step that places the orders, and only once it is shown. One
                  noun throughout — a service order — where this used to say
                  request, batch request, service and "the papers I want". */}
              {selectedServices.length > 0 && !reviewingBatch && (
                <button type="button" className="btn batch-review"
                        onClick={() => setReviewingBatch(true)}>
                  <ShoppingCartCheckoutOutlined sx={{ fontSize: 16 }} aria-hidden />
                  Review {plural(selectedServices.length, 'service order')}
                  <span className="num">{inr(selectedTotal)}</span>
                </button>
              )}

              {reviewingBatch && (
                <div className="batch-review-panel">
                  <div className="row between">
                    <strong>{plural(selectedServices.length, 'service order')}</strong>
                    <strong className="num">{inr(selectedTotal)}</strong>
                  </div>
                  <p className="note">
                    Combined quote · Not charged now
                  </p>
                  <label className="check">
                    <input type="checkbox" checked={batchConfirmed}
                           onChange={(e) => setBatchConfirmed(e.target.checked)} />
                    <span>
                      {selectedServices.length === 1
                        ? `I confirm this is the service order I want for ${rec.title}.`
                        : `I confirm these are the service orders I want for ${rec.title}.`}
                    </span>
                  </label>
                  <div className="row tight">
                    <button type="button" className="btn" disabled={placeBatch.isPending}
                            onClick={() => { setReviewingBatch(false); setBatchConfirmed(false); }}>
                      Back
                    </button>
                    <button type="button" className="btn primary"
                            disabled={!batchConfirmed || placeBatch.isPending}
                            onClick={() => void submitBatch()}>
                      {placeBatch.isPending ? 'Placing…'
                        : selectedServices.length === 1 ? 'Place the service order' : 'Place the service orders'}
                    </button>
                  </div>
                </div>
              )}

              {batchReceipt && (
                <div className="batch-success" role="status">
                  <strong>{batchReceipt.ref} is placed</strong>
                  <span className="note">
                    {plural(batchReceipt.orderCount, 'service order')} · {inr(batchReceipt.total)} quoted
                  </span>
                  <Link className="link accent" to={`/app/records/${rec.id}/services`}>
                    Track these service orders ›
                  </Link>
                </div>
              )}
              {batchError && (
                <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{batchError}</p>
              )}
            </Card>
          )}

          {/* What the title deed itself says, which is not the same thing as
              what the record says. A buyer reads the deed; this card is the
              part of it that can be checked against the fields above without
              opening a six-page PDF.

              Only fields the DOCUMENT carries. The extent the mock drew here
              is deliberately absent: `document` has no extent, and printing the
              record's own figure under a heading that says "the deed says"
              would put a claim in the deed's mouth. */}
          {deed && (deed.registeredOn || deed.office || deed.consideration > 0) && (
            <Card title="From the deed" className="railcard">
              <KV rows={[
                ...(deed.registeredOn
                  ? [{ k: 'Registered', v: ddmmyyyy(deed.registeredOn) }] : []),
                ...(deed.office ? [{ k: 'Office', v: deed.office }] : []),
                ...(deed.seller ? [{ k: 'Seller', v: deed.seller }] : []),
                ...(deed.buyer ? [{ k: 'Buyer', v: deed.buyer }] : []),
                ...(deed.consideration > 0
                  ? [{ k: 'Consideration', v: inr(deed.consideration) }] : []),
              ]} />
            </Card>
          )}

          {(rec.khataNo || rec.ownerName) && (
            <p className="note row tight">
              <PlaceOutlined sx={{ fontSize: 13 }} aria-hidden />{' '}
              {[rec.khataNo && `Khata ${rec.khataNo}`, rec.ownerName].filter(Boolean).join(' · ')}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
