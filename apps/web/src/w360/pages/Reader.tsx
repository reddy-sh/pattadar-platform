/** W13 — reading a document: the paper on the left, what was read from it on
 *  the right.
 *
 *  Two things this screen refuses to blur together. The SCAN is the evidence
 *  and is never altered — v1 is kept even after a better rescan replaces it.
 *  The READING is a machine's summary of that scan, is labelled as such, and
 *  says out loud where it was unsure ("the sub-division digit is smudged on
 *  page 4") instead of quietly guessing.
 *
 *  A third thing it now refuses to do: draw paper that does not exist. The
 *  reading surface used to fall back to a cream parchment page — grey text
 *  bars, a PATTADAR watermark, a dashed SRO seal — whenever the bytes did not
 *  arrive, which covers a refused fetch, a legacy file reference and a row
 *  that never had a file at all. An owner cannot tell invented paper from
 *  their registered deed, so the drawn page is gone and each of those
 *  outcomes now says which one it is. */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import RotateRightOutlined from '@mui/icons-material/RotateRightOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';

import { useCreateShareLink, useDeletePaper, useDocument, useUpdatePaper } from '../api';
import { Card, Chip, Empty, Failed, KV, Loading, Menu, SHELF_WORD, Tag, inrFull, plural } from '../ui';
import { Dialog } from '../Dialog';
import ShareResult from '../components/ShareResult';
import { useToast } from '../Toast';
import { ScanView, useScan } from '../paper/scan';
import { downloadBlob, fetchFileBlob, isStorageRef } from '../../pages/documents/storage';

/** The shelves a paper can be moved to, in the order the vault lists them. */
const SHELVES = ['title', 'revenue', 'map', 'search', 'identity', 'old', 'unsorted'];

/**
 * Print means the scan, not the screen around it.
 *
 * `window.print()` on its own printed the toolbar, the 7rem page rail, the
 * paging row and the whole 24rem reading panel around a postage-stamp deed.
 * The module already learned this in the fence estimator, where an
 * `@media print` block in w360.css leaves only the sheet on the paper; these
 * rules belong beside it, but this screen does not own w360.css, so it
 * carries them itself until they can be moved there.
 *
 * The `rd-` classes exist only as print hooks — nothing in w360.css styles
 * them, so they change nothing on screen.
 *
 * Rotation is deliberately dropped for the printer: it is a reading aid for
 * the screen, and a rotated transform prints clipped rather than sideways.
 */
const PRINT_CSS = `
@media print {
  .w360 .rd-bar, .w360 .rd-pages, .w360 .rd-paging, .w360 .rd-side { display: none !important; }
  .w360 .rd-grid { display: block !important; min-height: 0 !important; }
  .w360 .rd-sheet { display: block !important; padding: 0 !important; }
  .w360 .rd-sheet img {
    transform: none !important;
    max-width: 100% !important; max-height: none !important;
    width: auto !important; height: auto !important;
  }
}`;

/** What a downloaded scan should be called on disk.
 *
 *  `downloadBlob` falls back to a bare "document" with no extension, which
 *  lands in Downloads as a file the operating system will not open. The
 *  extension therefore comes off the bytes' own media type (or the row's),
 *  never off the title, and the title is only ever the base name. */
const EXT: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/tiff': 'tif',
};

function fileNameFor(title: string, mime: string): string {
  const ext = EXT[mime] ?? (mime.split('/')[1] ?? '').replace(/[^a-z0-9]/gi, '');
  // Slashes and colons are legal in a survey number and illegal in a filename.
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'document';
  return ext ? `${base}.${ext}` : base;
}

export function Reader() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, isLoading, error } = useDocument(id);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(124);
  const [turn, setTurn] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [audience, setAudience] = useState('');
  const [sharePath, setSharePath] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [shelf, setShelf] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const del = useDeletePaper();
  const share = useCreateShareLink();
  const editPaper = useUpdatePaper();
  // Full resolution, no ?thumb: this is the reading surface, not a tile.
  // Every hook stays above the three early returns below — React counts them
  // in order, and one that only runs once `data` has arrived breaks the very
  // first render.
  const scan = useScan(data?.fileRef);
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef<HTMLButtonElement>(null);

  // The rail scrolls now, so the page you are on has to be brought into it —
  // otherwise "Go to it" on page 18 of 22 marks a thumbnail nobody can see.
  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest' }); }, [page]);

  if (isLoading) return <main><Loading h="80vh" /></main>;
  // Two different absences that used to render identically: the read broke,
  // or the paper is genuinely not there. Telling an owner their deed "did not
  // load" when it has been deleted sends them to support for nothing.
  if (error) return <main><Failed what="This paper" error={error} boxed h="26rem" /></main>;
  if (!data) {
    return (
      <main>
        <Empty boxed icon="paper" title="This paper is not in your vault">
          It may have been deleted, or it belongs to a record that is no longer yours.
        </Empty>
      </main>
    );
  }

  // No fabrication. `Math.max(1, …)` turned a pageCount of 0 — which is what
  // the filing writes for every paper in the vault — into a page rail, a
  // paging row and the header text "1 pages", all describing a page nobody had
  // counted. A 12-page deed said "1 pages" just as loudly as a one-page one.
  const pages = data.pageCount;
  // Page chrome exists only where there are pages to move between. The count
  // is the filing's, not the fetch's — a fourteen-page deed whose preview was
  // refused still has fourteen pages — so this is deliberately not tied to the
  // scan. With the floor of 1 gone, a paper nobody counted draws no rail and
  // no "1 / 1" pager, which is the pair that could never do anything.
  const showPages = pages > 1;
  // The structured read. Filing pays for a full extraction and then stores only
  // the name and the subtitle line, so these five are empty on every real paper
  // — which is why the rail below needs an honest empty branch rather than a
  // conditional that quietly renders nothing at all.
  const hasFacts = !!(data.registeredOn || data.office || data.buyer
    || data.seller || data.consideration);
  const isImage = data.mimeType.startsWith('image/');

  // Where this paper came from, written once because four places used to
  // write it themselves and three of them wrote it wrong. Those three pointed
  // at `/app/records/:id/papers`, and there is no such child route — a
  // record's papers ARE its index route, `/app/records/:id`, which only the
  // Back link had right. So deleting a paper, opening the record it is filed
  // under, and the "this record's papers" link under Versions all landed on
  // the /app catch-all: "page not found" where the record should have been,
  // and after a deletion that reads as though the deletion broke something.
  // An unfiled paper has no record to return to, so it goes to the vault.
  const papersHome = data.recordId ? `/app/records/${data.recordId}` : '/app/papers';

  // A shared title deed asks for the document number to be typed out before it
  // goes. The phrase falls back to the whole title: `replace(/^\D+/, '')` used
  // to strip every leading non-digit, so a digit-free title ("Pattadar
  // Passbook") left the sentence reading "…asks you to type  first" and gated
  // the deletion on an empty string.
  const needsPhrase = data.shelf === 'title' && data.shared;
  const phrase = data.title.match(/\d[\d/-]*\d|\d/)?.[0] ?? data.title;
  const phraseOk = confirm.trim().toLowerCase() === phrase.toLowerCase();

  const download = async () => {
    try {
      const blob = await fetchFileBlob(data.fileRef);
      downloadBlob(blob, fileNameFor(data.title, blob.type || data.mimeType));
    } catch (e) {
      // A storage read is not a w360 mutation, so no shared onError stands
      // behind it — this one has to raise its own.
      toast.bad('That file could not be downloaded. The paper itself is unchanged.', e);
    }
  };

  const print = () => {
    if (isImage) { window.print(); return; }
    // A PDF is the browser's own viewer inside an <iframe>, and the page's
    // print() hands the printer an empty frame where the document should be.
    // The blob URL is same-origin, so the frame can be asked to print itself.
    const w = frame.current?.contentWindow;
    if (!w) {
      toast.bad('This document has not finished loading, so it cannot be printed yet.');
      return;
    }
    try {
      w.focus();
      w.print();
    } catch (e) {
      toast.bad('This document could not be sent to the printer. The viewer has its own print button.', e);
    }
  };

  const remove = async () => {
    // The shared mutation hook raises the failure toast itself; catching here
    // only stops the navigation, so a refused delete leaves the paper on
    // screen where the owner can see it is still filed.
    try {
      await del.mutateAsync({ paperId: data.id });
    } catch {
      return;
    }
    // Staying here would refetch `document` as null and land the owner on
    // "This paper is not in your vault", which reads as an error rather than
    // as the deletion they just asked for.
    nav(papersHome);
  };

  const makeLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!audience.trim()) return;
    try {
      const result = await share.mutateAsync({
        recordId: data.recordId, audience: audience.trim(), terms: 'view', days: 30,
        documentIds: [data.id],
      });
      if (!result.web.createShareLink) {
        toast.bad('This paper could not be shared. Refresh and try again.');
        return;
      }
      setSharePath(result.web.createShareLink);
    } catch {
      return;
    }
    // Nothing on this screen changes when the link is made: the "shared" note
    // in the rail tracks a document-scoped link, and this one is scoped to the
    // record. So the confirmation has to be said out loud.
    toast.ok('The link is ready to copy. Revoke it any time from the Vault.');
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    // An empty shelf means "leave it where it is" to the API, which is exactly
    // what an unchanged select should send.
    try {
      await editPaper.mutateAsync({
        paperId: data.id, name, shelf: shelf === data.shelf ? '' : shelf,
      });
    } catch {
      return;
    }
    setEditing(false);
  };

  return (
    <main className="flush">
      <style media="print">{PRINT_CSS}</style>

      <header className="row between rd-bar" style={{ padding: 'var(--space-sm) var(--space-lg)', borderBottom: '1px solid var(--w-line)', flexWrap: 'nowrap', gap: 'var(--space-md)' }}>
        <span className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)' }}>
          <Link className="iconbtn" to={papersHome} aria-label="Back">
            <ArrowBackOutlined sx={{ fontSize: 18 }} />
          </Link>
          <span>
            {/* The screen had no h1 at all: the document's own name was a
                <strong>, and the first heading was the rail's h2. Rank is not
                size — this stays 1rem. */}
            <h1 style={{ fontSize: '1rem', margin: 0 }}>{data.title}</h1>
            <span className="note" style={{ display: 'block' }}>
              {[data.recordTitle, SHELF_WORD[data.shelf],
                pages > 0 && plural(pages, 'page'), data.sizeLabel]
                .filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>

        {/* The search box that used to sit here typed nothing into anything:
            it showed a mono "searching…" beside itself for as long as there
            was text in it and never searched. A permanent present-progressive
            label is read as work in progress. There is no in-document text
            search behind this screen, so the box is gone rather than dressed
            up — it comes back the day the API can search inside a scan. */}

        <span className="row tight" style={{ flexWrap: 'nowrap' }}>
          {/* Zoom, rotate and print act on the scan, so they exist only while
              there is one. They used to be drawn for every document, including
              the metadata-only rows where every click was a no-op. */}
          {scan.status === 'ready' && (
            <>
              {/* Zoom is for images only. On an image the percentage IS the
                  render — it drives `maxWidth`/`maxHeight` on the <img>. On a
                  PDF it only stretched the <iframe>'s outer box while the
                  browser's own viewer, which has its own zoom, kept the
                  document at its own scale: two zoom controls disagreeing over
                  one page. The native viewer owns PDF zoom, so this pill is
                  drawn only where it is the single source of truth. */}
              {isImage && (
                <span className="segmented" role="group" aria-label="Zoom">
                  <button type="button" onClick={() => setZoom(Math.max(50, zoom - 12))} aria-label="Zoom out">−</button>
                  {/* The readout was a <button> held inert with pointer-events:
                      none, so a mouse could not use it and a keyboard still
                      stopped on it — a tab stop that led nowhere. It is a value,
                      not a segment: an <output> carries the status role, so
                      aria-live makes − and + actually speak the new percentage.
                      The padding and size are inline because `.mono` alone is
                      font-family, and the pill's metrics come from
                      `.segmented button`, which this deliberately is not. */}
                  <output className="mono" aria-live="polite"
                          style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.8125rem', color: 'var(--w-ink-2)', padding: '0.3125rem 0.875rem' }}>
                    {zoom}%
                  </output>
                  <button type="button" onClick={() => setZoom(Math.min(400, zoom + 12))} aria-label="Zoom in">+</button>
                </span>
              )}
              {/* Rotate is for images only. A PDF is the browser's own viewer,
                  which already has a rotate control of its own, and a CSS
                  transform on the frame would turn that viewer's chrome with
                  the document. */}
              {isImage && (
                <button type="button" className="iconbtn" aria-label="Rotate"
                        onClick={() => setTurn((t) => (t + 90) % 360)}>
                  <RotateRightOutlined sx={{ fontSize: 17 }} />
                </button>
              )}
              <button type="button" className="iconbtn" aria-label="Print" onClick={print}>
                <PrintOutlined sx={{ fontSize: 17 }} />
              </button>
            </>
          )}
          {/* Download goes to the stored original, not to the transcoded copy
              on screen, and is drawn only when there are bytes to fetch:
              `fetchFileBlob` throws 'legacy-ref' on anything that is not a
              storage node id, which is most seeded papers. */}
          {/* Download and the preview are two different fetches: `?format=web`
              asks the gateway to transcode, this asks for the bytes as filed.
              A gateway that cannot transcode a 40 MB TIFF still hands the TIFF
              over, so a refused preview must not take this away too. */}
          {isStorageRef(data.fileRef) && (
            <button type="button" className="btn sm" onClick={() => void download()}>
              <FileDownloadOutlined sx={{ fontSize: 15 }} /> Download
            </button>
          )}
          {/* A share link is made against a RECORD — a document-scoped link is
              not modelled — so an unfiled paper has nothing to share from, and
              says so rather than offering a button that cannot work. */}
          {data.recordId ? (
            <button type="button" className="btn primary sm" aria-haspopup="dialog"
                    onClick={() => setSharing(true)}>
              <IosShareOutlined sx={{ fontSize: 15 }} /> Share securely
            </button>
          ) : (
            <span className="note" style={{ maxWidth: '13rem', lineHeight: 1.3 }}>
              Sharing works on a record's papers. File this paper under a record to share it.
            </span>
          )}
          <Menu label={`Actions for ${data.title}`} header={data.title} items={[
            {
              label: 'Rename or move to another shelf',
              onClick: () => { setDraft(data.title); setShelf(data.shelf); setEditing(true); },
            },
            ...(data.recordId ? [{
              label: 'Open the record it is filed under',
              onClick: () => nav(papersHome),
            }] : []),
            // Where the two other screens in this codebase that delete a
            // document already put it, and where MenuItem.danger was written
            // for. It used to be a permanently red panel in the reading rail.
            {
              label: 'Delete this document…',
              danger: true,
              onClick: () => { setConfirm(''); setDeleting(true); },
            },
          ]} />
        </span>
      </header>

      <div className="rd-grid" style={{ display: 'grid', gridTemplateColumns: showPages ? '7rem minmax(0,1fr) 24rem' : 'minmax(0,1fr) 24rem', minHeight: 'calc(100vh - 4.5rem)' }}>
        {/* The rail used to stop at six thumbnails and print the remainder as
            the dead text "+6": page 7 of a 12-page deed could only be reached
            by pressing the chevron six times, no rail item was ever current
            past page 6, and a reader's flag on page 7 had no dot at all. Every
            page is a button now. `minHeight: 0` is what lets a grid item
            shrink enough to scroll instead of growing the page, and sticky
            keeps the rail beside the reading pane while that pane scrolls. */}
        {showPages && (
        <nav aria-label="Pages" className="rd-pages"
             style={{
               borderRight: '1px solid var(--w-line)', padding: 'var(--space-md)',
               display: 'grid', gap: '0.625rem', alignContent: 'start',
               minHeight: 0, maxHeight: 'calc(100vh - 4.5rem)', overflowY: 'auto',
               position: 'sticky', top: 0,
             }}>
          {Array.from({ length: pages }).map((_, n) => (
            <button
              key={n}
              type="button"
              ref={page === n + 1 ? current : undefined}
              onClick={() => setPage(n + 1)}
              aria-current={page === n + 1}
              className="thumb"
              style={{
                width: '100%', height: '4.5rem',
                borderColor: page === n + 1 ? 'var(--w-accent)' : 'var(--w-line)',
                fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
              }}
            >
              {n + 1}
              {data.readerFlagPage === n + 1 && (
                <span className="src" style={{ background: 'var(--w-accent)' }} aria-hidden />
              )}
            </button>
          ))}
        </nav>
        )}

        <section className="rd-sheet" style={{ display: 'grid', gridTemplateRows: showPages ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)', placeItems: scan.status === 'ready' ? 'center' : 'start center', padding: 'var(--space-lg)', gap: 'var(--space-md)' }}>
          {/* The scan itself, in whichever of five states the fetch landed
              in. Both this screen and the preview drawer render it, so it
              lives in ../paper/scan. The paging row below is this screen's
              alone. */}
          <ScanView
            scan={scan}
            title={data.title}
            isImage={isImage}
            recordHref={data.recordId ? papersHome : undefined}
            page={page}
            pages={pages}
            zoom={zoom}
            turn={turn}
            frameRef={frame}
          />

          {showPages && (
            <div className="row tight rd-paging" style={{ flexWrap: 'nowrap' }}>
              <button type="button" className="iconbtn" disabled={page <= 1}
                      onClick={() => setPage(Math.max(1, page - 1))}
                      aria-label="Previous page" style={{ border: '1px solid var(--w-line)' }}>
                <ChevronLeftOutlined sx={{ fontSize: 17 }} />
              </button>
              <output className="mono" aria-live="polite" style={{ fontSize: '0.8125rem' }}>
                {page} / {pages}
              </output>
              <button type="button" className="iconbtn" disabled={page >= pages}
                      onClick={() => setPage(Math.min(pages, page + 1))}
                      aria-label="Next page" style={{ border: '1px solid var(--w-line)' }}>
                <ChevronRightOutlined sx={{ fontSize: 17 }} />
              </button>
            </div>
          )}
        </section>

        <aside className="rd-side" style={{ borderLeft: '1px solid var(--w-line)', padding: 'var(--space-lg)', overflowY: 'auto', display: 'grid', gap: 'var(--space-md)', alignContent: 'start' }}>
          <div className="row between">
            <span className="row tight">
              <Chip>● {SHELF_WORD[data.shelf] ?? data.shelf}</Chip>
              {data.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
            </span>
            {data.shared && (
              <span className="note row tight" style={{ color: 'var(--w-info)' }}>
                <LinkOutlined sx={{ fontSize: 13 }} /> shared
              </span>
            )}
          </div>

          <h2 style={{ fontSize: '1.375rem' }}>{data.title}</h2>

          {/* `subtitle` is the one place the deed read survives filing — the
              shelf list shows it and searches it — and this screen fetched it
              on every load and drew it nowhere. It is most of the reason the
              rail underneath was empty. */}
          {data.subtitle && (
            <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--w-ink-2)' }}>
              {data.subtitle}
            </p>
          )}

          {hasFacts ? (
            <KV
              rows={[
                ...(data.registeredOn ? [{ k: 'Registered', v: data.registeredOn }] : []),
                ...(data.office ? [{ k: 'Office', v: data.office }] : []),
                ...(data.buyer ? [{ k: 'Buyer', v: data.buyer }] : []),
                ...(data.seller ? [{ k: 'Seller', v: data.seller }] : []),
                ...(data.consideration ? [{ k: 'Consideration', v: inrFull(data.consideration) }] : []),
              ]}
            />
          ) : (
            /* An empty branch, not a hidden one. Every card in this rail was
               conditional and the only unconditional block was the delete
               panel, so a paper with nothing read off it rendered a screen
               whose entire message was "Delete this document". */
            <Card title="What was read off this paper">
              <p className="note" style={{ margin: 0 }}>
                {data.subtitle
                  ? 'The line above is all that was kept when this paper was filed. Nothing further was taken off the scan, so there is nothing more to show here yet.'
                  : 'Nothing was taken off this paper when it was filed — no dates, no parties, no amounts. The scan itself is beside this panel; it is the reading that is missing.'}
              </p>
            </Card>
          )}

          {data.readerSummary && (
            <Card title={
              <span className="row tight">
                <span className="mono muted" style={{ fontSize: '0.75rem', letterSpacing: '0.08em' }}>TEXT_</span>
                <SearchOutlined sx={{ fontSize: 15 }} aria-hidden />
                What the reader found
              </span>
            }>
              <p style={{ fontSize: '0.875rem', lineHeight: 1.55, margin: 0, color: 'var(--w-ink-2)' }}>
                {data.readerSummary}
              </p>
              {data.readerFlag && (
                <>
                  <hr className="hr" />
                  <div className="row between" style={{ flexWrap: 'nowrap' }}>
                    <span className="note row tight">
                      <span className="accent" style={{ display: 'flex' }}>
                        <ErrorOutlineOutlined sx={{ fontSize: 15 }} />
                      </span>
                      {data.readerFlag}
                    </span>
                    <button type="button" className="link accent"
                            onClick={() => setPage(data.readerFlagPage || 1)}
                            style={{ border: 0, background: 'none', font: 'inherit', fontSize: '0.8125rem', color: 'var(--w-accent)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Go to it
                    </button>
                  </div>
                </>
              )}
            </Card>
          )}

          {data.versions.length > 0 && (
            <Card title="Versions">
              <div className="rows">
                {data.versions.map((v) => (
                  <div key={v.id}>
                    <span className="pill managed mono">v{v.version}</span>
                    <span className="grow">
                      <span style={{ display: 'block', fontSize: '0.875rem' }}>{v.label}</span>
                      <span className="note mono" style={{ display: 'block', fontSize: '0.6875rem' }}>
                        {[v.madeOn, v.madeBy && `by ${v.madeBy}`, v.note].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              {/* The "Replace" button that sat in this card's corner had no
                  handler. Replacing a scan means writing a new fileRef onto
                  the row, and `updatePaper` takes a name and a shelf and
                  nothing else — so it is removed rather than left looking
                  live, and the card says where a newer scan does go. Bring it
                  back when the API accepts a fileRef on an existing paper. */}
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                A newer scan is filed from{' '}
                {data.recordId
                  ? <Link className="link" to={papersHome}>this record's papers</Link>
                  : 'the record this paper belongs to'}.
                Nothing here is ever overwritten — an older version stays in this list.
              </p>
            </Card>
          )}

          {data.link && (
            <Card>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)', alignItems: 'flex-start' }}>
                <span className="muted" style={{ display: 'flex', paddingTop: '0.125rem' }}>
                  <VisibilityOutlined sx={{ fontSize: 17 }} />
                </span>
                <span>
                  <strong style={{ fontSize: '0.875rem' }}>
                    {data.link.audience} has opened this {data.link.openedCount} times
                  </strong>
                  <span className="note" style={{ display: 'block' }}>
                    Last {data.link.lastOpenedAt} ·{' '}
                    {data.link.daysLeft <= 1 ? 'link expires tomorrow' : `${data.link.daysLeft} days left`}
                  </span>
                </span>
              </div>
            </Card>
          )}

        </aside>
      </div>

      {sharing && (
        <Dialog
          title="Share securely"
          busy={share.isPending}
          dismissable={false}
          onClose={() => { setSharing(false); setSharePath(''); }}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => { setSharing(false); setSharePath(''); }}>{sharePath ? 'Done' : 'Cancel'}</button>
              {!sharePath && <button type="submit" form="share-paper" className="btn primary"
                      disabled={!audience.trim() || share.isPending}>
                {share.isPending ? 'Making the link…' : 'Share'}
              </button>}
            </>
          )}
        >
          {sharePath ? <ShareResult path={sharePath} /> : <form id="share-paper" onSubmit={makeLink} style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            <p className="note" style={{ margin: 0 }}>
              This link carries only this paper. It is good for 30 days and anyone
              you send it to can open and download the file. Revoke it any time from the Vault.
            </p>
            <div className="field">
              <label htmlFor="rd-share">Who is it for</label>
              <input id="rd-share" type="text" value={audience}
                     placeholder="A name, a firm"
                     onChange={(e) => setAudience(e.target.value)} />
            </div>
          </form>}
        </Dialog>
      )}

      {/* Two taps, still — the decision Reader made when it wrote "one stray
          click in the rail should not unfile it" is kept, it just stops being
          permanent red furniture to get there. This is the shape every other
          w360 screen already uses: a danger item in the Menu (RecordPapers.tsx
          :268, Properties.tsx:137) opening the Dialog, which is the one
          implementation here that actually traps focus and returns it.

          The phrase gate moves across intact. A shared title deed is the most
          dangerous row in the vault, and it was the one case that had its
          delete form sitting permanently live in the rail. */}
      {deleting && (
        <Dialog
          title={`Delete ${data.title}?`}
          busy={del.isPending}
          dismissable={!needsPhrase}
          initialFocus={needsPhrase ? '#rd-confirm' : undefined}
          onClose={() => { setConfirm(''); setDeleting(false); }}
          footer={(
            <>
              <button type="button" className="btn"
                      onClick={() => { setConfirm(''); setDeleting(false); }}>
                Keep it
              </button>
              <button type="submit" form="delete-paper" className="btn danger"
                      disabled={del.isPending || (needsPhrase && !phraseOk)}>
                {del.isPending ? 'Removing…' : 'Delete'}
              </button>
            </>
          )}
        >
          <form id="delete-paper" onSubmit={(e) => { e.preventDefault(); void remove(); }}
                style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            <p className="note" style={{ margin: 0 }}>
              {data.recordId
                ? <>It leaves this record straight away, with its list of versions.</>
                : <>It leaves the vault straight away, with its list of versions.</>}{' '}
              {/* The old panel promised the file "stays in your storage" in
                  every state, including the states where this screen has just
                  proved the store will not produce it. */}
              {scan.status === 'ready'
                ? <>The file itself stays in your storage, but nothing in the vault points at it.</>
                : <>Whatever is in your storage is left alone, but nothing in the vault will point at it.</>}
            </p>
            {needsPhrase && (
              <>
                <p className="note" style={{ margin: 0 }}>
                  This is your title to this land and it is shared right now, so you are asked
                  to type {phrase} first. The link is revoked with it.
                </p>
                <div className="field">
                  {/* The accessible name the suite already knows this field by. */}
                  <label htmlFor="rd-confirm">Type {phrase} to confirm deletion</label>
                  <input id="rd-confirm" type="text" value={confirm} placeholder={phrase}
                         onChange={(e) => setConfirm(e.target.value)} />
                </div>
              </>
            )}
          </form>
        </Dialog>
      )}

      {editing && (
        <Dialog
          title="Rename or move this paper"
          busy={editPaper.isPending}
          dismissable={false}
          onClose={() => setEditing(false)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" form="edit-paper" className="btn primary"
                      disabled={!draft.trim() || editPaper.isPending}>
                {editPaper.isPending ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        >
          <form id="edit-paper" onSubmit={saveEdit} style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            <div className="field">
              <label htmlFor="rd-name">What it is called</label>
              <input id="rd-name" type="text" value={draft}
                     onChange={(e) => setDraft(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rd-shelf">Shelf</label>
              <select id="rd-shelf" value={shelf} onChange={(e) => setShelf(e.target.value)}>
                {/* A paper filed on a shelf this list does not know still has
                    to show its own shelf as the selected one, or the select
                    opens blank and a save silently refiles it. */}
                {(SHELVES.includes(data.shelf) ? SHELVES : [...SHELVES, data.shelf])
                  .map((s) => <option key={s} value={s}>{SHELF_WORD[s] ?? s}</option>)}
              </select>
            </div>
            <p className="note" style={{ margin: 0 }}>
              The shelf is where the vault files this paper. Nothing read off the scan changes.
            </p>
          </form>
        </Dialog>
      )}
    </main>
  );
}
