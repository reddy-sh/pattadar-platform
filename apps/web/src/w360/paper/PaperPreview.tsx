/** A paper, previewed in the right-side drawer the way Dropbox slides a file
 *  in over its list — the paper list stays put behind it, and the scan opens
 *  where it was filed without leaving the shelf.
 *
 *  It is deliberately a LOOK, not a workbench. The full-page Reader (W13) owns
 *  rotate, print, rename, move, share, delete and the registration facts; this
 *  panel shows the scan and nothing else, and closes from its header X or the
 *  dimmed page behind it. There is no footer, no facts block and no actions —
 *  a glance at the paper, and the way to everything else is to open the Reader
 *  itself. Keeping the two apart is what lets a glance cost a click.
 *
 *  It reuses `ScanView` and `useScan` from ./scan, so the five fetch outcomes
 *  and the image/PDF render are the same bytes-or-honest-absence the Reader
 *  shows; nothing here can draw paper that does not exist.
 *
 *  Two things this panel does that the shared drawer does not, because a
 *  reading surface earns them where an "add a note" form does not: it opens
 *  WIDE and can be dragged wider still from a grip on its left edge (a
 *  certified copy at 26rem is a stamp nobody can read), and its width is
 *  remembered. An image scan can also be zoomed in place; a PDF is left to the
 *  browser's own viewer, which carries its own zoom. All of it is carried here
 *  rather than in the shared `Drawer` (Drawer.tsx), which every "add a thing"
 *  flow uses and none of which wants a resize grip. */
import { useCallback, useEffect, useState } from 'react';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';

import { useDocument } from '../api';
import { Failed, Loading } from '../ui';
import { Drawer, drawerEyebrow } from '../Drawer';
import { ScanView, useScan } from './scan';

/** How wide the preview opens, and the rails it may be dragged between.
 *
 *  The default is wide on purpose — a scan is the point of this panel, and the
 *  old 26rem drew it too small to read. The floor is still narrow enough to sit
 *  beside a list on a laptop; the ceiling leaves the list a sliver so the panel
 *  can never swallow the whole screen and strand the owner with no way back to
 *  what they were looking at. */
const WIDTH_KEY = 'w360.preview.width';
const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 380;
const STEP = 32;
/** The most the panel may take, leaving the list behind it a usable strip. */
const maxWidth = () => Math.round(Math.min(920, window.innerWidth * 0.92));

function clampWidth(px: number): number {
  return Math.max(MIN_WIDTH, Math.min(maxWidth(), Math.round(px)));
}

/**
 * The panel's width, dragged from a grip on its left edge and remembered.
 *
 * The drawer is docked to the right, so its width is `innerWidth - pointerX`:
 * dragging the grip leftward widens it. Pointer capture on the grip is what
 * keeps the drag alive when the cursor outruns a fast pull and leaves the thin
 * handle. The value is persisted only on release, not on every move, so a drag
 * is one localStorage write rather than a hundred.
 *
 * Keyboard resize is a first-class path, not an afterthought: the grip is a
 * `separator` a keyboard lands on, and Left/Right nudge, Home/End jump to the
 * rails. Without it the panel's width would be mouse-only, which is the kind of
 * control this codebase's guards exist to catch.
 */
function useResizableWidth() {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    return saved ? clampWidth(saved) : DEFAULT_WIDTH;
  });
  const [dragging, setDragging] = useState(false);

  // A window that narrows below the panel's saved width — a smaller laptop, a
  // rotated tablet — must not leave the panel wider than the screen. Re-clamp
  // on resize, but do not persist it: the owner's chosen width is restored the
  // next time there is room for it.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const persist = useCallback((px: number) => {
    try { window.localStorage.setItem(WIDTH_KEY, String(px)); } catch { /* private mode */ }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Left button only; a right-click on the grip is a context menu, not a drag.
    if (e.button !== 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);

    const move = (ev: PointerEvent) => setWidth(clampWidth(window.innerWidth - ev.clientX));
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
      persist(clampWidth(window.innerWidth - ev.clientX));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [persist]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    let next: number | null = null;
    // Left widens because the panel grows leftward, into the page; Right
    // narrows it. Home/End go to the two rails.
    if (e.key === 'ArrowLeft') next = width + STEP;
    else if (e.key === 'ArrowRight') next = width - STEP;
    else if (e.key === 'Home') next = maxWidth();
    else if (e.key === 'End') next = MIN_WIDTH;
    if (next === null) return;
    e.preventDefault();
    const w = clampWidth(next);
    setWidth(w);
    persist(w);
  }, [width, persist]);

  return { width, dragging, onPointerDown, onKeyDown };
}

export function PaperPreview({ paperId, onClose, returnFocus }: {
  paperId: string;
  onClose: () => void;
  /** Where focus goes if the row that opened the drawer is gone by the time it
   *  closes — the drawer's own contract, forwarded to the caller's list. */
  returnFocus?: React.RefObject<HTMLElement | null>;
}) {
  const { data, isLoading, error } = useDocument(paperId);
  const scan = useScan(data?.fileRef);
  const [page, setPage] = useState(1);
  // Image zoom only. A PDF ignores this — its own viewer owns PDF zoom — so the
  // pill below is drawn for an image scan and nothing else.
  const [zoom, setZoom] = useState(100);
  const { width, dragging, onPointerDown, onKeyDown } = useResizableWidth();

  const href = `/app/papers/${paperId}`;

  // The header needs a title before `data` lands. The three pre-data states
  // borrow a neutral one rather than flashing the id.
  const title = data?.title ?? 'Paper';
  const eyebrow = data
    ? drawerEyebrow(data.recordTitle || 'Your papers', 'Preview')
    : 'Your papers · Preview';

  const isImage = !!data && data.mimeType.startsWith('image/');
  const pages = data?.pageCount ?? 0;
  const showPages = pages > 1;
  const canZoom = scan.status === 'ready' && isImage;

  return (
    <Drawer
      eyebrow={eyebrow}
      title={title}
      sub={data?.subtitle || undefined}
      onClose={onClose}
      initialFocus=".drawerbody"
      returnFocus={returnFocus}
      // No `primary` — this panel has no footer. It is a look, closed from the
      // header X or the scrim.
      // The reading surface earns what an add-a-thing form does not: it opens
      // wide, its outer (left) corners are rounded away from the screen edge,
      // and it carries a resize grip. `userSelect: none` while dragging stops
      // the pull from selecting text under the cursor.
      panelClassName="drawer-preview"
      panelStyle={{
        width: `${width}px`,
        borderTopLeftRadius: 'var(--radius-lg)',
        borderBottomLeftRadius: 'var(--radius-lg)',
        userSelect: dragging ? 'none' : undefined,
      }}
    >
      {/* The drag grip. It sits on the panel's own left edge — the panel is
          position:fixed and overflow:hidden, so an absolutely-placed child at
          left:0 rides that edge without a wrapper. It is a `separator` so a
          screen reader announces a resizer and a keyboard can drive it; the
          visible bar is drawn by ::before in w360.css and widens on hover. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the preview"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={typeof window === 'undefined' ? 920 : maxWidth()}
        tabIndex={0}
        className="drawer-resize"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      />

      {isLoading && <Loading h="18rem" what="the paper" />}

      {!isLoading && error && (
        <Failed what="This paper" error={error} boxed h="18rem" />
      )}

      {!isLoading && !error && !data && (
        <Failed what="This paper" boxed h="18rem" />
      )}

      {data && (
        // A full-height column: the scan flexes to fill everything the header
        // leaves, so there is never an empty band under it — the panel is the
        // document, top to bottom, the way Dropbox fills its preview. The zoom
        // pill and the pager are fixed-height rows above and below; the scan is
        // the one row that grows.
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {/* Zoom, for an image scan only. The pill widens or narrows the image
              within the frame below; a PDF is left to its own viewer's zoom, so
              this is not drawn over one. Padded off the edge because the body
              around it is now flush. */}
          {canZoom && (
            <div className="row between" style={{ flexWrap: 'nowrap', flex: 'none', padding: 'var(--space-sm) var(--space-md) 0' }}>
              <span className="segmented" role="group" aria-label="Zoom">
                <button type="button" onClick={() => setZoom((z) => Math.max(50, z - 15))} aria-label="Zoom out">−</button>
                <output className="mono" aria-live="polite"
                        style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.8125rem', color: 'var(--w-ink-2)', padding: '0.3125rem 0.875rem' }}>
                  {zoom}%
                </output>
                <button type="button" onClick={() => setZoom((z) => Math.min(400, z + 15))} aria-label="Zoom in">+</button>
              </span>
            </div>
          )}

          {/* The scan IS this surface. `flex: 1` gives it every pixel the header
              and the pager do not take, so a tall deed fills the panel and the
              bottom is never empty. `minHeight: 0` is what lets a flex child
              shrink enough to hand its overflow to the native PDF viewer inside
              rather than growing the column past the panel. */}
          <div style={{
            flex: '1 1 auto', minHeight: 0, display: 'grid',
            placeItems: scan.status === 'ready' ? 'center' : 'start center',
            background: 'var(--w-surface-2)',
            // Flush to the panel edges — no rounding, no inner padding — so the
            // scan bleeds to the sides the way Dropbox fills its preview. A tiny
            // top margin only when there is a zoom pill above it.
            marginTop: canZoom ? 'var(--space-sm)' : 0,
            overflow: 'hidden',
          }}>
            <ScanView
              scan={scan}
              title={data.title}
              isImage={isImage}
              recordHref={data.recordId ? href : undefined}
              page={page}
              pages={pages}
              zoom={zoom}
              turn={0}
            />
          </div>

          {/* Paging, only where there is more than one page. Prev/next is the
              whole of it here — enough to check page 4 of a deed without
              opening it full page. */}
          {showPages && (
            <div className="row tight" style={{ flexWrap: 'nowrap', justifyContent: 'center', flex: 'none', padding: 'var(--space-sm) var(--space-md)' }}>
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
        </div>
      )}
    </Drawer>
  );
}
