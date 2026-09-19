/** The scan surface, shared by the full-page Reader (W13) and the preview
 *  drawer that opens over a paper list.
 *
 *  This is the half of the reading screen that refuses to draw paper that does
 *  not exist. The bytes of a scan arrive through one of five outcomes — no
 *  file on the row, a legacy reference the store cannot resolve, a fetch in
 *  flight, the bytes themselves, a refused read, or a network failure — and
 *  each says which one it is rather than falling back to a fabricated page.
 *  Both surfaces render the same five states, so they live here once instead
 *  of being copied into the drawer the day it wanted a preview.
 *
 *  `useScan` and `ScanView` were lifted out of Reader.tsx verbatim; the only
 *  new thing is `zoomable`, which lets a caller drop the zoom pill for a
 *  compact preview while the full Reader keeps it for images. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { Empty, Failed, Loading } from '../ui';
import { apiFetch } from '../../api/client';
import { isStorageRef } from '../../pages/documents/storage';

export type ScanStatus = 'none' | 'legacy' | 'loading' | 'ready' | 'error' | 'gone';

/**
 * The scan's bytes, and which of five things happened while fetching them.
 *
 * `useBlobUrl` in components/holdingCards.tsx returns a bare string and
 * swallows every failure — `if (!res.ok) return;` and a bare `catch {}` — so
 * a storage gateway that refused the file was indistinguishable from a paper
 * that has no file at all, and the reading surface drew the same fabricated
 * page for both. On a reading surface that is the worst confusion available:
 * the owner is looking at invented paper where their registered deed should
 * be, with nothing on screen saying the fetch failed.
 *
 * It is a local hook rather than a change to `useBlobUrl` because that hook's
 * other five callers — card covers, gallery frames, photo tiles — are
 * decorative and want exactly its old forgiving behaviour.
 *
 * A non-UUID `fileRef` is its own outcome, not an error: such a ref can never
 * resolve, so no request is made and no retry is offered.
 */
export function useScan(fileRef: string | undefined) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ url: string; status: ScanStatus; error?: unknown }>(
    { url: '', status: 'loading' });

  useEffect(() => {
    if (!fileRef) { setState({ url: '', status: 'none' }); return; }
    if (!isStorageRef(fileRef)) { setState({ url: '', status: 'legacy' }); return; }

    let revoke = '';
    let cancelled = false;
    setState({ url: '', status: 'loading' });
    (async () => {
      try {
        // `format=web` is not optional: an iPhone's HEIC is undecodable in
        // every browser and the gateway transcodes it server-side.
        const res = await apiFetch(`/api/gateway/storage/files/${fileRef}/content?format=web`);
        // A 404 or a 403 is a settled answer, not a bad moment on the network:
        // the store resolved the reference and would not hand the bytes over.
        // Offering "Try again" there re-asks a question already answered, and
        // the shared Failed box swears "nothing has been lost" over the top of
        // it. Those two outcomes get their own state, with no retry.
        if (res.status === 404 || res.status === 403) {
          if (!cancelled) setState({ url: '', status: 'gone' });
          return;
        }
        if (!res.ok) throw new Error(`The file store answered ${res.status}.`);
        const blob = await res.blob();
        if (cancelled) return;
        revoke = URL.createObjectURL(blob);
        setState({ url: revoke, status: 'ready' });
      } catch (e) {
        if (!cancelled) setState({ url: '', status: 'error', error: e });
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [fileRef, nonce]);

  return { ...state, retry: () => setNonce((n) => n + 1) };
}

export interface ScanViewProps {
  /** The result of `useScan(fileRef)`. */
  scan: { url: string; status: ScanStatus; error?: unknown; retry: () => void };
  /** The paper's own name, used in the img alt and the iframe title. */
  title: string;
  isImage: boolean;
  /** Where "Open the record" points when a scan is refused — omitted for an
   *  unfiled paper, which has no record to return to. */
  recordHref?: string;
  /** The page the frame/alt should land on, and how many there are. */
  page: number;
  pages: number;
  /** Image zoom as a percentage. A PDF ignores it — the browser's own viewer
   *  owns PDF zoom — so it only ever drives the <img>. */
  zoom: number;
  /** A quarter turn (90/270) has swapped the box the image has to fit. */
  turn: number;
  /** The <iframe> ref, so the caller can drive the native viewer's print(). */
  frameRef?: React.RefObject<HTMLIFrameElement | null>;
}

/**
 * The paper itself, in whichever of the five states the fetch landed in.
 *
 * `ready` splits on kind: an image is height-led and zoom-scaled within the
 * reading pane; a PDF is the browser's own viewer inside an <iframe> that
 * fills the whole cell. The other four states each say which absence they are
 * — a refused read is not a network failure, a legacy reference is not a
 * missing file — because on a reading surface an owner cannot tell invented
 * paper from their registered deed, so the drawn fallback page is gone.
 */
export function ScanView({
  scan, title, isImage, recordHref, page, pages, zoom, turn, frameRef,
}: ScanViewProps) {
  const quarter = turn === 90 || turn === 270;

  if (scan.status === 'loading') {
    return (
      <div style={{ width: 'min(100%, 34rem)' }}>
        <Loading h="26rem" what="the scan" />
      </div>
    );
  }

  if (scan.status === 'ready') {
    return isImage ? (
      // A quarter turn swaps the box the page has to fit: what was its height
      // is its width on screen. The constraints are written against this
      // wrapper in container units so a rotated scan still fits the reading
      // pane instead of running out of the grid cell.
      <div style={{
        alignSelf: 'stretch', justifySelf: 'stretch', minWidth: 0, minHeight: 0,
        display: 'grid', placeItems: 'center', containerType: 'size',
      }}>
        <img
          src={scan.url}
          alt={`${title}, page ${page} of ${pages}`}
          style={quarter ? {
            width: '100cqh', height: 'auto', maxWidth: 'none',
            maxHeight: `min(${zoom}cqw, 44rem)`,
            transform: `rotate(${turn}deg)`,
            borderRadius: 'var(--radius-xs)', display: 'block',
          } : {
            // Height-led, so a page always fits the reader; zoom then scales it
            // within that. Width-led at 124% ran the seal off the screen.
            height: '100%', maxWidth: `min(${zoom}%, 44rem)`, maxHeight: '100%',
            objectFit: 'contain', transform: turn ? `rotate(${turn}deg)` : undefined,
            borderRadius: 'var(--radius-xs)', display: 'block',
          }}
        />
      </div>
    ) : (
      // Browsers render PDFs natively, so the viewer costs nothing and brings
      // its own scrolling, rotate and print. The rail hands it a `#page=`
      // fragment and remounts the frame on a page change, which is what makes
      // clicking page 7 move the document rather than only the readout beneath
      // it. The frame fills the whole reading cell — no width cap — because the
      // native viewer already centres and scales the document inside itself,
      // so a capped frame only left dead gutters on both sides of the pane.
      <iframe
        ref={frameRef}
        key={page}
        src={`${scan.url}#page=${page}`}
        title={title}
        style={{
          justifySelf: 'stretch', alignSelf: 'stretch',
          height: '100%', width: '100%', border: 0,
          borderRadius: 'var(--radius-xs)', background: 'var(--w-surface-2)',
        }}
      />
    );
  }

  if (scan.status === 'error') {
    return (
      <div style={{ width: 'min(100%, 34rem)' }}>
        <Failed what="This paper's scan" error={scan.error} onRetry={scan.retry} boxed />
      </div>
    );
  }

  // Separate from `error` on purpose. The shared Failed box offers a retry and
  // swears "nothing has been lost — the app could not reach the server", and
  // over a refused read both halves are false: the store answered, and it will
  // answer the same way every time.
  if (scan.status === 'gone') {
    return (
      <div style={{ width: 'min(100%, 34rem)' }}>
        <Empty boxed icon="paper" title="This scan cannot be opened from this account"
               action={recordHref
                 ? <Link className="btn sm" to={recordHref}>Open the record</Link>
                 : undefined}>
          The file store holds the reference on this row but will not release the file to the
          account you are signed in as. Nothing has been deleted — the paper, the record and the
          file are all still there. Asking again returns the same answer, so there is no retry here.
        </Empty>
      </div>
    );
  }

  if (scan.status === 'legacy') {
    return (
      <div style={{ width: 'min(100%, 34rem)' }}>
        <Empty boxed icon="paper" title="This paper's file is filed under an old reference">
          The reference on this row is not one the file store can resolve, so the scan cannot be
          opened and asking again will not change that. Upload the scan again to restore it.
        </Empty>
      </div>
    );
  }

  // scan.status === 'none'
  return (
    <div style={{ width: 'min(100%, 34rem)' }}>
      <Empty boxed icon="paper" title="No file is attached to this paper">
        The record holds what was read off it — the registration facts and the reading on the
        right — but the scan itself has never been filed. The page count comes from the filing,
        not from anything on this screen.
      </Empty>
    </div>
  );
}
