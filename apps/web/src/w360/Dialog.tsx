/**
 * A modal that is actually modal.
 *
 * Four separate overlays in this module declared `aria-modal="true"` and then
 * did none of what that promises: focus stayed on the button behind them, Tab
 * walked straight out into the page underneath, Escape did nothing, and
 * closing left focus on `<body>` so the next Tab started again from the top of
 * the document. `aria-modal` on a div that traps nothing is worse than no
 * attribute at all — it tells a screen reader to ignore the rest of the page
 * while the keyboard is still free to wander into it.
 *
 * One implementation, five behaviours, all of them the WAI-ARIA dialog pattern:
 *
 *  1. On open, focus moves into the dialog — to `initialFocus` if given, else
 *     the first focusable thing, else the dialog itself.
 *  2. Tab and Shift-Tab cycle within the dialog and cannot leave it.
 *  3. Escape closes — unless `busy`, because a write is in flight and the
 *     answer has not come back yet.
 *  4. A click on the scrim closes, with the same exception, and with
 *     `dismissable={false}` for dialogs holding typed work: throwing away a
 *     half-filled record because the pointer slipped is not a dismissal.
 *  5. On close, focus returns to whatever opened it.
 *
 * `aria-labelledby` points at the real heading rather than repeating it in an
 * `aria-label`, so the title is announced exactly as it is written.
 */
import { useCallback, useEffect, useId, useRef } from 'react';
import type { RefObject } from 'react';
import type { ReactNode } from 'react';

/** Everything a Tab can land on. Exported because the side drawers need the
 *  same trap and are not `.dlg` boxes — two copies of this string would drift
 *  the first time either was touched. */
export const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The modal keyboard contract, for surfaces that are not a Dialog box.
 *
 * The record drawer, the expense drawer and the share panel are all modal in
 * behaviour and none of them is a centred dialog, so they were each about to
 * grow their own copy of this. Focus moves in on mount, Tab cycles inside,
 * Escape calls `onClose` unless `busy`, and focus returns to the opener.
 *
 * `active` lets a caller hold the trap off — a drawer mid-open-animation that
 * grabs focus before it is on screen scrolls the page behind it.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  { onClose, busy, active = true, initialFocus }: {
    onClose: () => void; busy?: boolean; active?: boolean; initialFocus?: string;
  },
) {
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    returnTo.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (el) {
      const wanted = initialFocus ? el.querySelector<HTMLElement>(initialFocus) : null;
      (wanted ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    }
    return () => {
      const back = returnTo.current;
      if (back && back.isConnected) back.focus();
    };
  }, [active, initialFocus, ref]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); if (!busy) onClose(); return; }
      if (e.key !== 'Tab') return;
      const el = ref.current;
      if (!el) return;
      const all = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!all.length) { e.preventDefault(); el.focus(); return; }
      const first = all[0];
      const last = all[all.length - 1];
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [active, busy, onClose, ref]);
}

export function Dialog({
  title, children, onClose, busy, dismissable = true, wide, footer, initialFocus,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** A write is in flight; Escape and the scrim stop working until it lands. */
  busy?: boolean;
  /** False for dialogs holding typed work — only the explicit controls close it. */
  dismissable?: boolean;
  wide?: boolean;
  footer?: ReactNode;
  /** CSS selector, resolved inside the dialog, for what should take focus. */
  initialFocus?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    const el = box.current;
    if (el) {
      const wanted = initialFocus ? el.querySelector<HTMLElement>(initialFocus) : null;
      (wanted ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    }
    return () => {
      // `isConnected` guards the case where the opener itself was removed by
      // the action — deleting a record from its own dialog — which would
      // otherwise throw focus at a detached node and land it on <body>.
      const back = returnTo.current;
      if (back && back.isConnected) back.focus();
    };
  }, [initialFocus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const el = box.current;
      if (!el) return;
      const all = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!all.length) { e.preventDefault(); el.focus(); return; }
      const first = all[0];
      const last = all[all.length - 1];
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [close]);

  return (
    <div
      className="scrim"
      onPointerDown={(e) => { if (dismissable && e.target === e.currentTarget) close(); }}
    >
      <div
        ref={box}
        className={wide ? 'dlg wide' : 'dlg'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <h2 id={titleId} className="dlg-t">{title}</h2>
        {children}
        {footer && <div className="dlg-f">{footer}</div>}
      </div>
    </div>
  );
}
