/** W03 — the record's default hanger, because that is what a piece of land IS
 *  in the Indian system: a stack of paper that agrees with itself.
 *
 *  The record's own identity — its name, extent, place, the actions against it
 *  and how much of it is filled in — is the shell's (RecordHead.tsx), so this
 *  screen is now only the papers and what is missing from them. The four-stat
 *  strip that used to head it is gone: the extent is a chip in the header, and
 *  the worth, the rate and the year are the Money hanger's subject, which is
 *  the point of Money being a hanger. */
import { useMemo, useRef, useState } from 'react';
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

import {
  useAddPaper, useDeletePaper, useDocument, usePapers, useUpdatePaper,
} from '../api';
import { MAX_UPLOAD_BYTES, mb } from '../filePhotos';
import { describeReading, unreadRow } from '../paperFiling';
import { STORAGE_OFFLINE_MSG, uploadToDrive } from '../../pages/documents/storage';
import {
  Card, Chip, Failed, Icon, KV, Tag,
  SHELF_WORD, ddmmyyyy, inr, nounFor, plural,
} from '../ui';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useToast } from '../Toast';
import { SkRowItems } from '../skeletons';
import { readDocument } from '../../pages/documents/upload';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { PaperPreview } from '../paper/PaperPreview';

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
    { shelf: 'identity', say: 'No approval or occupancy paper on file' },
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
function PaperDrawer({ recordId, recordTitle, onClose, returnFocus }: {
  recordId: string;
  recordTitle: string;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const addPaper = useAddPaper(false);
  const toast = useToast();
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
   *  green toast and nothing saying a paper needed sorting. */
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const tooBig = picked.filter((f) => f.size > MAX_UPLOAD_BYTES);
  const ready = picked.length > 0 && tooBig.length === 0 && !filing;

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
        let row = unreadRow(node.name, f.type);
        let couldNotRead = false;
        try {
          row = describeReading(await readDocument(f, f.name), f);
        } catch {
          couldNotRead = true;
        }
        // The owner's answer beats the reader's. It is only ever an override —
        // left on "Let Pattadar decide", the shelf the document was read into
        // is the one it lands on.
        if (shelf) row = { ...row, shelf };

        try {
          const res = await addPaper.mutateAsync({
            recordId, fileRef: node.id, name: row.name, subtitle: row.subtitle,
            shelf: row.shelf, pageCount: row.pageCount,
            mimeType: node.mimeType, sizeBytes: node.sizeBytes,
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
          toast.ok(done === 1 ? 'The paper is filed.' : `${done} papers are filed.`);
          // A paper nothing could be read from is filed under its own filename
          // in Unsorted, and needs shelving by hand. That is worth a sentence
          // the owner can actually read, so the panel HOLDS rather than closing
          // over it — it closes on Done. Nothing left to file, so nothing here
          // can be filed twice.
          if (unread.length) {
            setNotice(unread.length === 1
              ? `${unread[0]} is filed, but nothing could be read from it — it is in Unsorted,`
                + ' under its own file name, until you put it on a shelf.'
              : `${unread.length} of these are filed but could not be read — they are in`
                + ` Unsorted, under their own file names: ${unread.join(', ')}.`);
          } else {
            onClose();
          }
        }
      }
    }
  }

  return (
    <Drawer
      eyebrow={drawerEyebrow(recordTitle, 'Papers')}
      title={picked.length > 1 ? `File ${picked.length} papers` : 'File a paper'}
      sub={`A deed, a patta, a tax receipt. Pattadar reads what it can off each one and shelves it — anything it cannot read is filed under its own name in Unsorted.`}
      onClose={onClose}
      onSubmit={() => (notice ? onClose() : void file())}
      busy={filing}
      dirty={picked.length > 0}
      discardCopy={{
        title: 'Discard this pick?',
        body: 'Nothing has been uploaded yet. Closing this panel drops the files you picked — the files themselves are untouched.',
      }}
      initialFocus=".scanbox button"
      returnFocus={returnFocus}
      // Once everything is filed the panel is only holding a notice, so the
      // primary is the way out of it rather than a second filing.
      cancelLabel={notice ? 'Go to Papers' : 'Cancel'}
      primary={notice ? (
        <DrawerAction label="Done" working="Done" />
      ) : (
        <DrawerAction
          label={picked.length > 1 ? `File ${picked.length} papers` : 'File the paper'}
          working="Filing…"
          pending={filing}
          disabled={!ready}
        />
      )}
    >
      <input
        ref={input}
        type="file" hidden multiple
        accept="image/*,application/pdf"
        // Unchanged wording on purpose: it is how every suite that files a paper
        // reaches the picker, and the picker moving into the drawer is not a
        // reason for its name to move with it.
        aria-label="Add a paper to this record"
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
          Drop the scan or photograph here
        </p>
        <p className="dropline">
          A photograph of the paper is enough — it does not have to be a clean scan.
          Up to {mb(MAX_UPLOAD_BYTES)} each.
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
                const over = f.size > MAX_UPLOAD_BYTES;
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
                        {mb(f.size)}{over && ` · over the ${mb(MAX_UPLOAD_BYTES)} limit`}
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
              Take {tooBig.length > 1 ? 'those' : 'that one'} out to file the rest — nothing is
              uploaded while anything in the list is over the limit.
            </span>
          )}
        </div>
      )}

      <div className="field">
        <label>Which shelf</label>
        <div className="row tight">
          <Chip active={shelf === READ_IT} onClick={() => setShelf(READ_IT)}>
            Let Pattadar decide
          </Chip>
          {SHELVES.map((s) => (
            <Chip key={s} active={shelf === s} onClick={() => setShelf(s)}>
              {SHELF_WORD[s] ?? s}
            </Chip>
          ))}
        </div>
        <span className="note">
          {shelf
            ? `Every paper in this pick is filed under ${SHELF_WORD[shelf] ?? shelf}, whatever the reader makes of it.`
            : 'Read off the document itself. You can move a paper afterwards from its own row.'}
        </span>
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
  const [shelf, setShelf] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const shelves = useMemo(() => {
    const counts = new Map<string, number>();
    (papers ?? []).forEach((p) => counts.set(p.shelf, (counts.get(p.shelf) ?? 0) + 1));
    return [...counts.entries()];
  }, [papers]);

  const shown = (papers ?? []).filter((p) =>
    (!shelf || p.shelf === shelf)
    && (!q.trim() || `${p.title} ${p.detail}`.toLowerCase().includes(q.trim().toLowerCase())));

  // "1 paper · 1 title · showing 1" — the count, the shelves those papers fall
  // in, and what the filter is doing to them. Nothing about expiry: no paper in
  // this system carries an expiry date, so "nothing expiring" would be an
  // assertion rather than a reading.
  const papersSub = [
    plural(papers?.length ?? rec.paperCount, 'paper'),
    ...shelves.map(([k, n]) => `${n} ${(SHELF_WORD[k] ?? k).toLowerCase()}`),
    (shelf || q.trim()) && `showing ${shown.length}`,
  ].filter(Boolean).join(' · ');

  // The shelves a record of this kind is asked for, against the ones it can
  // actually produce. This is the question a buyer or a bank opens with, and
  // the record had no way of putting it: the owner had to know for themselves
  // which of the eight shelves should not be empty.
  const missing = EXPECTED_SHELVES[rec.kind === 'parcel' ? 'parcel' : 'built']
    .filter((s) => !(papers ?? []).some((p) => p.shelf === s.shelf));

  // The title deed itself, for the rail. Read from the document rather than
  // parsed out of the row's display line — "Registered 2019-10-13 · Podili"
  // is a sentence composed for a human, and picking it apart again would break
  // the first time that sentence is reworded.
  const titlePaper = (papers ?? []).find((p) => p.shelf === 'title');
  const { data: deed } = useDocument(titlePaper?.id);

  return (
    <>
      <div className="split">
        <div>
          <SectionHead
            title="What is on paper"
            sub={papersSub}
            actions={(
              <>
                <span className="search" style={{ width: '16rem' }}>
                  <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={rec.paperCount > 0 ? 'Search papers' : `No papers on this ${noun} yet`}
                    aria-label="Search this record's papers"
                  />
                </span>
                {/* Opens the drawer, like every other "add a thing" on this
                    record. It used to click a hidden file input, so the pick
                    itself was the whole interaction — there was no point at
                    which the owner could see what they had chosen. */}
                <button ref={addTrigger} type="button" className="btn primary"
                        aria-haspopup="dialog" aria-expanded={adding}
                        onClick={() => setAdding(true)}>
                  <AddOutlined sx={{ fontSize: 15 }} aria-hidden /> Add a paper
                </button>
              </>
            )}
          />

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
            <div className="row" style={{ gap: 'var(--space-sm)', margin: '0 0 var(--space-md)' }}>
              {shelves.map(([k, n]) => (
                <Chip key={k} active={shelf === k} count={n}
                      onClick={() => setShelf(shelf === k ? null : k)}>
                  {SHELF_WORD[k] ?? k}
                </Chip>
              ))}
            </div>
          )}

          {/* One line, shared by filing, renaming and removing — so each of
              them clears it before it starts. `alert` because it is the only
              notice that a paper did not move, and it appears well away from
              the row that asked. */}
          {paperErr && (
            <p className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{paperErr}</p>
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
                          style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, fontSize: '0.9375rem' }}>
                      {p.title}
                    </Link>
                    <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>{p.detail}</span>
                  </span>
                  <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                    <Chip>● {SHELF_WORD[p.shelf] ?? p.shelf}</Chip>
                    {p.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
                    {p.shared && (
                      <span className="note row tight" style={{ color: 'var(--w-info)' }}>
                        <LinkOutlined sx={{ fontSize: 13 }} /> shared
                      </span>
                    )}
                    {/* Two taps, no modal: a paper is evidence, and one
                        stray click on a row should not unfile it. */}
                    {editId === p.id ? (
                      <form className="row tight" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => {
                        e.preventDefault();
                        // The row used to close on the press and fire the
                        // rename into the void, so a refusal left the old title
                        // on screen with nothing said anywhere. It now stays
                        // open until the answer comes back — and the answer
                        // includes `false` on an otherwise perfect 200, which
                        // is the server declining to touch that row.
                        const name = draft.trim();
                        if (!name) {
                          setPaperErr('A paper needs a name — type one, or Cancel to keep the old one.');
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
                    ) : confirmId === p.id ? (
                      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                        {/* The pair used to collapse before the delete had
                            been answered, so a paper that was refused — or an
                            offline browser — read as a Remove that worked. The
                            row holds until the server says the paper is gone,
                            which is also what makes `disabled` mean anything. */}
                        <button type="button" className="btn sm danger"
                                disabled={delPaper.isPending}
                                onClick={() => {
                                  setPaperErr('');
                                  delPaper.mutate({ paperId: p.id }, {
                                    onSuccess: (res) => {
                                      if (res.web.deletePaper) {
                                        setConfirmId('');
                                        requestAnimationFrame(() => paperList.current?.focus());
                                      }
                                      else setPaperErr(`${p.title} could not be removed — it may already be gone. Reload the page.`);
                                    },
                                    onError: () => setPaperErr(`${p.title} was not removed. It is still filed here.`),
                                  });
                                }}>
                          {delPaper.isPending ? 'Removing…' : 'Remove'}
                        </button>
                        <button type="button" className="btn sm"
                                onClick={() => {
                                  setPaperErr('');
                                  setConfirmId('');
                                  restoreRowFocus(removeTriggers, p.id);
                                }}>
                          Keep
                        </button>
                      </span>
                    ) : (
                      <>
                        <button ref={(node) => {
                                  if (node) renameTriggers.current.set(p.id, node);
                                }} type="button" className="iconbtn" aria-label={`Rename ${p.title}`}
                                onClick={() => { setEditId(p.id); setDraft(p.title); }}
                                style={{ border: 0, background: 'none' }}>
                          <EditOutlined sx={{ fontSize: 16 }} />
                        </button>
                        <button ref={(node) => {
                                  if (node) removeTriggers.current.set(p.id, node);
                                }} type="button" className="iconbtn" aria-label={`Remove ${p.title}`}
                                onClick={() => setConfirmId(p.id)}
                                style={{ border: 0, background: 'none' }}>
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
                  <Failed what="These papers" error={papersErr} onRetry={() => void refetchPapers()} />
                </div>
              )}
              {!isLoading && !papers && !papersErr && (
                <div>
                  <p className="note" role="status">
                    These papers have not loaded — you appear to be offline.
                  </p>
                </div>
              )}
              {/* Two different emptinesses: nothing filed at all, versus a
                  filter that happened to miss. Both need the papers to have
                  actually arrived before either can be claimed. */}
              {!isLoading && papers && shown.length === 0 && (
                <div>
                  <p className="note">
                    {papers.length === 0
                      ? `Nothing is filed against this ${noun} yet. A deed, a passbook or a receipt added here becomes searchable by its text.`
                      : 'No paper here matches that.'}
                  </p>
                  {/* The empty state opens the same drawer as the header, which
                      is what every other hanger's does. Only when the record is
                      genuinely bare: under a filter that missed, the thing to do
                      is clear the filter, not file a paper. */}
                  {papers.length === 0 && (
                    <button type="button" className="btn primary" aria-haspopup="dialog"
                            style={{ marginTop: 'var(--space-sm)' }}
                            onClick={() => setAdding(true)}>
                      <AddOutlined sx={{ fontSize: 15 }} aria-hidden /> Add a paper
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="stack">
          {/* Only while it has something to say. A record that can produce all
              four shelves should not carry an empty box headed "what is
              missing" — the absence IS the answer, and the papers list beside
              it already shows what is there. */}
          {missing.length > 0 && (
            <Card title="What is missing" className="railcard">
              <ul className="railnotes">
                {missing.map((m) => <li key={m.shelf}>{m.say}</li>)}
              </ul>
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                {/* Named as the reason rather than left to be inferred: an
                    owner reads a list of absent documents as bureaucracy until
                    somebody says which door it closes. */}
                A buyer or a bank asks for {missing.length > 1 ? 'these' : 'this'} before
                anything else. Pattadar can fetch the revenue and search papers from the
                office — order it from the header.
              </p>
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
            <Card title="The deed says" className="railcard">
              <KV rows={[
                ...(deed.registeredOn
                  ? [{ k: 'Registered', v: ddmmyyyy(deed.registeredOn) }] : []),
                ...(deed.office ? [{ k: 'Office', v: deed.office }] : []),
                ...(deed.seller ? [{ k: 'Seller', v: deed.seller }] : []),
                ...(deed.buyer ? [{ k: 'Buyer', v: deed.buyer }] : []),
                ...(deed.consideration > 0
                  ? [{ k: 'Consideration', v: inr(deed.consideration) }] : []),
              ]} />
              {/* The deed is named in the row beside this card, so naming it
                  again here was the same string twice on one screen — and it
                  made "Sale Deed 4417/2019" ambiguous to anything looking for
                  the paper itself. */}
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                Read from the title deed filed here. Where the paper and the record
                disagree, the paper is the evidence and the record is the one to correct.
              </p>
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
