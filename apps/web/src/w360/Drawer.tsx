/**
 * The one right-side drawer, for every "add a thing" on a record.
 *
 * Nine hangers hung off the record and no two of them agreed on what adding
 * something looked like. Papers and Media fired a hidden file input straight
 * from the header, so picking a scan was the whole interaction and there was
 * never a form to check before it was filed. People and Notes each grew their
 * own inline composer under the section head — different markup, different
 * focus handling, no Escape, and one of them had `aria-expanded` while the
 * other did not. Features scrolled the page to a dashed card at the end of the
 * grid and flashed a ring at it. Money offered nothing. Five answers to one
 * question, and the two surfaces that DID have a proper drawer — the record
 * add/edit drawer and the expense drawer — were not on a tab at all, and had
 * copied the focus trap between themselves rather than sharing one.
 *
 * So the drawer is the answer everywhere, and it is this component. What a
 * caller supplies is the eyebrow, the title, the sentence under it, the fields
 * and the primary button. Everything that makes a panel modal in fact rather
 * than in appearance is here, once:
 *
 *  1. Focus moves in on open, and back to the control that opened it on close.
 *  2. Tab and Shift-Tab cycle inside; the page behind is `inert`, not merely
 *     covered by the scrim.
 *  3. Escape and a click on the scrim close — unless a write is in flight, or
 *     there is typed work to lose, in which case they ask first.
 *  4. The page behind cannot be scrolled out from under the panel.
 *  5. The footer is pinned, so the primary action is reachable without
 *     scrolling a long form to the bottom to find it.
 *
 * Point 3 is the one worth spelling out: a half-filled form is the most
 * expensive thing on screen, and Escape is a key people press to dismiss a
 * browser's own autofill dropdown. `dirty` is what separates "I am done here"
 * from "I lost twenty minutes".
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import CloseOutlined from '@mui/icons-material/CloseOutlined';

import { Dialog, useFocusTrap } from './Dialog';

/** The line above a drawer's title: which record this is about, and which
 *  hanger asked. `SY 120-2 · PEOPLE` — the uppercasing is `.eyebrow`'s, so the
 *  record's name is passed through exactly as it is filed.
 *
 *  A drawer covers the header that names the record, so without this the panel
 *  is a form with no subject. It matters most on the narrow width, where the
 *  drawer is the whole screen. */
export const drawerEyebrow = (recordTitle: string, hanger: string) =>
  `${recordTitle} · ${hanger}`;

/** What the confirmation says when there is typed work to lose. Overridable
 *  because "discard this record" and "discard this note" are not the same
 *  warning, and a generic one is the kind nobody reads. */
export interface DiscardCopy {
  title: string;
  body: ReactNode;
  keep: string;
  discard: string;
}

const DISCARD: DiscardCopy = {
  title: 'Discard what you have entered?',
  body: 'Nothing has been saved yet. Closing this panel loses everything you have entered here.',
  keep: 'Keep editing',
  discard: 'Discard',
};

/** Put the page behind the drawer out of reach, hand focus over, and stop the
 *  document scrolling underneath it.
 *
 *  `inert` goes on the SIBLINGS all the way up rather than on `document.body`:
 *  the scrim and the panel live in the same tree under `.w360`, so inerting the
 *  body would disable the drawer along with the page. The toast stack is left
 *  alone deliberately — a write refused from inside the drawer has to stay
 *  readable and dismissable.
 *
 *  The opener is remembered and restored here rather than left to useFocusTrap,
 *  because `inert` and focus have to be unwound in an order one hook cannot
 *  keep on its own: making a sibling inert blurs whatever inside it held focus,
 *  so the opener has to be read BEFORE the loop runs, and `focus()` on an inert
 *  element does nothing at all, so the page has to be reachable again BEFORE
 *  that control can have focus back. Moving focus into the panel here is what
 *  keeps the two from fighting — useFocusTrap captures the panel, which is
 *  detached by the time its own restore fires, so this is the only restore that
 *  actually happens.
 */
function useSealedPage(
  panel: React.RefObject<HTMLElement | null>,
  scrim: React.RefObject<HTMLElement | null>,
  fallback?: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const el = panel.current;
    const opener = document.activeElement as HTMLElement | null;
    const behind: HTMLElement[] = [];
    for (let node: HTMLElement | null = el; node && node !== document.body;
         node = node.parentElement) {
      const parent = node.parentElement;
      if (!parent) break;
      for (const sib of Array.from(parent.children)) {
        if (!(sib instanceof HTMLElement) || sib === node || sib === scrim.current) continue;
        if (sib.classList.contains('toasts') || sib.hasAttribute('inert')) continue;
        sib.setAttribute('inert', '');
        behind.push(sib);
      }
    }

    /** The document is what scrolls on this shell (`.w360` is a grid that grows
     *  past the viewport), so this is where the lock goes. `scrollbar-gutter`
     *  is not usable here — it has to be set on the scrolling element before
     *  the lock, not during — so the classic pad-by-the-scrollbar's-width is
     *  what keeps the page from jumping sideways as its scrollbar disappears.
     *  On a platform with overlay scrollbars the difference is 0 and nothing
     *  moves. */
    const { body } = document;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    el?.focus();

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
      // Both halves in this order: focus() on an inert element does nothing at
      // all, so the page has to be reachable again before the control that
      // opened the drawer can have focus back.
      behind.forEach((n) => n.removeAttribute('inert'));
      /** The opener can be gone by the time the drawer closes, and routinely
       *  is: the empty state's own "Assign someone" is removed by the very
       *  person it just filed, because the list is no longer empty. Focus would
       *  land on <body> and the next Tab would start again from the top of the
       *  document, so a caller with a control that always exists — the one in
       *  the section head — names it as the fallback. */
      const back = opener?.isConnected ? opener : fallback?.current;
      back?.focus();
    };
    // Mount and unmount only — the drawer is mounted when it is open, which is
    // the same lifetime as the seal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function Drawer({
  eyebrow, title, sub, onClose, onSubmit, busy, dirty, discardCopy,
  primary, cancelLabel = 'Cancel', initialFocus, returnFocus, children,
}: {
  /** `SY 120-2 · PEOPLE` — see drawerEyebrow. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** The one sentence under the title: what this panel does, and what happens
   *  to what it files. Not marketing — the People drawer uses it to say the
   *  person gets a card of their own, which is the thing nobody expects. */
  sub?: ReactNode;
  onClose: () => void;
  /** Makes the panel a <form>, so Enter in a field files it and the primary
   *  button can be a real submit. Omit for a drawer whose primary action is
   *  not a form submission. */
  onSubmit?: () => void;
  /** A write is in flight: Escape, the scrim and the discard prompt all stand
   *  aside until it lands. */
  busy?: boolean;
  /** There is typed work here that closing would throw away. */
  dirty?: boolean;
  discardCopy?: Partial<DiscardCopy>;
  /** The footer's primary button. It comes FIRST in the DOM and grows to fill
   *  the row, with Cancel beside it — the action the panel was opened for is
   *  the one under the thumb. */
  primary: ReactNode;
  cancelLabel?: string;
  /** CSS selector, resolved inside the panel, for what should take focus. */
  initialFocus?: string;
  /** Where focus goes if the control that opened the drawer is gone by the time
   *  it closes — see the note in useSealedPage. */
  returnFocus?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subId = useId();
  /** The drawer is asking whether it may be closed on typed work. */
  const [asking, setAsking] = useState(false);
  const copy = { ...DISCARD, ...discardCopy };

  useSealedPage(panel, scrim, returnFocus);

  /** Escape and a slipped click on the scrim are not "throw this away".
   *
   *  The deliberate ways out — the header X, Cancel — still close at once.
   *  Only the two accidental paths come through here. */
  const tryClose = useCallback(() => {
    // A write is in flight, or our own confirmation is already up: one Escape
    // must not both dismiss that dialog and act on the drawer behind it.
    if (asking || busy) return;
    if (dirty) setAsking(true);
    else onClose();
  }, [asking, busy, dirty, onClose]);

  /** Tab, Escape, and where focus lands. The shared hook only wraps at the
   *  panel's first and last stop, which is why it can stay armed while the
   *  discard confirmation sits on top of it — a trap that hauled focus back
   *  whenever it found it elsewhere would fight that dialog for its own
   *  buttons. */
  useFocusTrap(panel, { onClose: tryClose, busy, initialFocus });

  const head = (
    <div className="drawerhead">
      <div className="grow">
        {eyebrow && <p className="eyebrow" style={{ margin: 0 }}>{eyebrow}</p>}
        {/* `aria-labelledby` points at the heading the panel already shows
            rather than repeating it in an `aria-label`: one title, announced
            exactly as it is written, and no second copy to drift when the
            wording changes. */}
        <h2 id={titleId}>{title}</h2>
        {sub && <p className="note" id={subId} style={{ margin: '0.25rem 0 0' }}>{sub}</p>}
      </div>
      <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
        <CloseOutlined sx={{ fontSize: 18 }} />
      </button>
    </div>
  );

  const foot = (
    <div className="drawerfoot">
      {primary}
      <button type="button" className="btn" onClick={onClose}>{cancelLabel}</button>
    </div>
  );

  /** `tabIndex={-1}` so a caller can hand it the opening focus with
   *  `initialFocus=".drawerbody"`, which is how a drawer says "the panel, not a
   *  field". The expense drawer wants exactly that: it leads with "photograph
   *  the receipt first", and landing on the amount box would skip both that and
   *  the heading. -1 keeps it out of the tab order, so it is never a stop on the
   *  way through the form. */
  const body = <div className="drawerbody" tabIndex={-1}>{children}</div>;

  return (
    <>
      {/* Not a button. Once Tab is trapped inside the panel a scrim button is
          either unreachable or a second Close beside the one in the header, so
          it goes back to being what it looks like: the dimmed page, which a
          click puts away. */}
      <div ref={scrim} className="scrim" aria-hidden="true" onClick={tryClose} />
      <aside
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={sub ? subId : undefined}
        tabIndex={-1}
      >
        {onSubmit ? (
          <form
            className="drawerin"
            onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          >
            {head}{body}{foot}
          </form>
        ) : (
          <div className="drawerin">{head}{body}{foot}</div>
        )}
      </aside>

      {asking && (
        /* Lifted into a stacking context of its own. The shared dialog's scrim
           sits at z-index 39 and the drawer at 40, so a confirmation raised
           from inside the drawer would otherwise paint behind the very panel it
           is asking about. */
        <div style={{ position: 'relative', zIndex: 41 }}>
          <Dialog
            title={copy.title}
            onClose={() => setAsking(false)}
            footer={(
              <>
                <button type="button" className="btn" onClick={() => setAsking(false)}>
                  {copy.keep}
                </button>
                <button type="button" className="btn danger" onClick={onClose}>
                  {copy.discard}
                </button>
              </>
            )}
          >
            <p className="note" style={{ margin: 0 }}>{copy.body}</p>
          </Dialog>
        </div>
      )}
    </>
  );
}

/**
 * The primary button in a drawer's footer, with the four things every one of
 * them has to say.
 *
 * Offline, react-query PAUSES a write rather than failing it, so a button left
 * to `isPending` alone sits on "Saving…" for as long as the network stays down
 * with nothing to explain it. That was written out by hand in the expense
 * drawer and nowhere else; every drawer needs it, so it lives here.
 */
export function DrawerAction({
  label, working, paused, pending, disabled, onClick, submit = true,
}: {
  /** What the button does when it is idle: "Assign them", "File the note". */
  label: string;
  /** What it says mid-write: "Assigning…", "Filing…". */
  working: string;
  paused?: boolean;
  pending?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** False for a drawer that is not a form. */
  submit?: boolean;
}) {
  return (
    <button
      type={submit ? 'submit' : 'button'}
      className="btn primary grow"
      style={{ justifyContent: 'center' }}
      disabled={disabled || pending}
      onClick={onClick}
    >
      {paused ? 'Waiting for the network…' : pending ? working : label}
    </button>
  );
}
