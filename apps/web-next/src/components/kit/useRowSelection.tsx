'use client';

/**
 * Checkbox selection, the contextual bar it raises, and the one sentence a
 * bulk run is allowed to say when it finishes.
 *
 * Two screens implement this today and they have already drifted apart.
 * `documents/DocumentsTab.tsx:288-309` extends a selection across the visible
 * range on shift-click; `documents/RegisteredDeedsTab.tsx:354-362` — the same
 * fifty lines, retyped — does not, so the same gesture on two sibling tabs of
 * the same page does two different things. Neither is a decision anyone made.
 * That is the argument for this file: the range extend is the behaviour that
 * survives, it lives in one place, and there is no second copy left to fall
 * behind it.
 *
 * `visibleIds` is the hook's only input because a selection that outlives its
 * filter is a data-loss bug, not a convenience. Both screens already prune on
 * every change to the filtered list, and for a good reason — a bulk Delete
 * reads the selection, not the rows on screen, so a row filtered out of sight
 * while still checked would be deleted by a button the reader saw pointing at
 * something else. Pruning is keyed on the JOINED ids rather than the array
 * identity, so a caller writing the natural `useRowSelection(rows.map(getRowKey))`
 * does not re-run the effect on every render of an unchanged list.
 *
 * Esc clears, but only when nothing is layered above: an open dialog, menu or
 * file viewer owns its own Esc, and clearing a selection out from under a
 * confirm dialog — the dialog Esc was meant to close — would leave that dialog
 * pointing at nothing. The gate is a DOM probe for a mounted overlay rather
 * than `event.defaultPrevented`, because MUI does not set that flag reliably
 * and a gate that silently stops working is worse than no gate.
 *
 * `SelectionBar` exists to be handed to `ListToolbar.replaceWith`, never to be
 * stacked above a toolbar. Its predecessors unmount the entire toolbar —
 * `DocumentsTab.tsx:609-702` takes the search box AND the live type-filter
 * chips down with it — so mid-selection the reader can no longer see which
 * subset the bulk Delete is aimed at. Here the bar is only the right-hand
 * cluster's replacement, and anything still in effect rides along in `context`.
 * It is an `ActionRegion` that no action can win: every spec renders
 * `destructive` or `quiet`, so a bulk Delete and a bulk Download never arrive
 * at the same weight, and nothing in a contextual bar can outrank the page's
 * own primary. The region INHERITS deliberately — it is handed to
 * `ListToolbar.replaceWith` and so sits inside the toolbar's region — and
 * carries no `root`: a contextual bar is subordinate by definition, and even a
 * caller who forced `role="primary"` into `actions` would be re-spelled `quiet`
 * below before the region rule ever came into it.
 *
 * `useBulkRun` is the third copy of a loop the app has written three times
 * (`DocumentsTab.tsx:515-534` and `:536-556`, `RegisteredDeedsTab.tsx:364-388`),
 * each ending in its own hand-assembled summary sentence. Sequential is
 * deliberate and not a simplification: these are storage and registry writes,
 * and a parallel fan-out would trade a readable progress count for a rate
 * limit. Exactly one toast is emitted, at the end — a per-item toast over a
 * 40-row selection is forty messages through a provider that shows one at a
 * time, which is the queue, not a notification.
 *
 * Extracted from `components/tableSx.ts:26-38` (`selectionBarSx`, exported and
 * documented but wired to no screen — now `tokens.selectionBarSx`, radius bug
 * fixed); `views/documents/DocumentsTab.tsx:262-309` (the prune effect, the Esc
 * listener and the shift-range `toggleRow`), `:606-641` (the bar) and
 * `:515-556` (the two bulk loops and their summaries);
 * `views/documents/RegisteredDeedsTab.tsx:332-362`, `:424-453` and `:364-388`
 * (the same three, minus the range extend).
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

import type { ActionSpec, BulkProgress, RowSelectionApi } from './types';
import { Action, ActionRow } from './Action';
import { GAP, RADIUS, selectionBarSx } from './tokens';
import { useToast } from './ToastProvider';

/**
 * Any mounted overlay owns Escape. `[role="dialog"]` covers Dialog, Drawer and
 * the file viewer's portal; `.MuiModal-root` covers the menus and popovers that
 * carry no dialog role. Matching either means this listener stands down.
 */
const OVERLAY_SELECTOR = '[role="dialog"], .MuiModal-root';

/**
 * The prune key. Ids come from the server and never contain a pipe, so the
 * joined string changes exactly when the visible set does — and not when the
 * caller merely re-maps the same rows into a new array.
 */
function keyOf(visibleIds: string[]): string {
  return visibleIds.join('|');
}

/* ── useRowSelection ─────────────────────────────────────────────────── */

/**
 * Checkbox selection over the rows currently visible. `toggle` takes the
 * originating `shiftKey` and extends from the last toggled row across the
 * VISIBLE order, so a range that spans a filtered-out row still only selects
 * what the reader can see.
 */
export function useRowSelection(visibleIds: string[]): RowSelectionApi {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());

  /**
   * The visible order as of the last commit. Event handlers fire between
   * commits, so they read it from here rather than closing over the array of
   * whichever render created them.
   */
  const visibleRef = useRef<string[]>(visibleIds);
  /** The anchor a shift-click extends from. Reset by `toggleAll` and `clear`. */
  const lastToggledRef = useRef<string | null>(null);

  // Declared FIRST so the prune effect below, in the same commit, already sees
  // the new order. Effects run in declaration order.
  useEffect(() => {
    visibleRef.current = visibleIds;
  });

  const visibleKey = keyOf(visibleIds);

  // Filtering a selected row away deselects it. Without this a bulk action
  // would reach rows the reader can no longer see — the selection and the list
  // it is drawn on must describe the same set.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(visibleRef.current);
      const next = new Set([...prev].filter((id) => visible.has(id)));
      // Same size means nothing was pruned; returning `prev` skips the render.
      return next.size === prev.size ? prev : next;
    });
  }, [visibleKey]);

  const clear = useCallback(() => {
    lastToggledRef.current = null;
    setSelected((prev) => (prev.size === 0 ? prev : new Set<string>()));
  }, []);

  const toggle = useCallback((id: string, shiftKey?: boolean) => {
    setSelected((prev) => {
      const ids = visibleRef.current;
      const next = new Set(prev);
      const anchor = lastToggledRef.current === null ? -1 : ids.indexOf(lastToggledRef.current);
      const target = ids.indexOf(id);
      if (shiftKey === true && anchor !== -1 && target !== -1 && anchor !== target) {
        // The clicked row decides the direction; the whole range follows it, so
        // shift-clicking inside a selected block clears the block.
        const on = !prev.has(id);
        const [lo, hi] = anchor < target ? [anchor, target] : [target, anchor];
        for (let i = lo; i <= hi; i += 1) {
          if (on) next.add(ids[i]);
          else next.delete(ids[i]);
        }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastToggledRef.current = id;
  }, []);

  const toggleAll = useCallback((checked: boolean) => {
    lastToggledRef.current = null;
    setSelected(checked ? new Set(visibleRef.current) : new Set<string>());
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  /** Visible order, not click order — a bulk run reads the list as it is read. */
  const ids = useMemo(() => visibleIds.filter((id) => selected.has(id)), [visibleIds, selected]);

  const count = selected.size;

  // Only listen while something is selected: an app-wide keydown handler that
  // does nothing is still a handler every keystroke has to walk past.
  useEffect(() => {
    if (count === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(OVERLAY_SELECTOR) !== null) return;
      clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, clear]);

  return useMemo<RowSelectionApi>(
    () => ({ selected, toggle, toggleAll, clear, isSelected, count, ids }),
    [selected, toggle, toggleAll, clear, isSelected, count, ids],
  );
}

/* ── SelectionBar ────────────────────────────────────────────────────── */

export interface SelectionBarProps {
  count: number;
  onClear: () => void;
  /** Destructive first, then benign. Clear is rendered last by the component. */
  actions: ActionSpec[];
  /** Determinate progress while a bulk run is in flight. */
  progress?: BulkProgress | null;
  /**
   * Rendered beside the count — e.g. the still-applied filter chips, so the bar
   * never hides state that is still in effect.
   */
  context?: ReactNode;
}

/**
 * The contextual toolbar for a live selection. Hand it to
 * `ListToolbar.replaceWith`; it replaces the action cluster and nothing else,
 * which is what keeps the search box and the active filters on screen while a
 * bulk action is being aimed.
 */
export function SelectionBar({ count, onClear, actions, progress, context }: SelectionBarProps) {
  const countId = useId();
  const progressId = useId();

  const run = progress ?? null;
  const running = run !== null;
  const pct = running && run.total > 0 ? Math.min(100, (run.done / run.total) * 100) : 0;

  return (
    <Box sx={selectionBarSx} role="group" aria-labelledby={countId}>
      <Typography id={countId} variant="subtitle2" className="tnum" sx={{ fontWeight: 600 }}>
        {count} selected
      </Typography>
      {context}
      <Box sx={{ flexGrow: 1 }} />
      {/* No action in this row may render filled: a contextual bar must not
          out-weigh the page's own primary, and a bulk Delete must not read
          like the safe choice beside a bulk Download. */}
      <ActionRow name="selection bar" justify="end">
        {actions.map((spec) => (
          <Action
            key={spec.key ?? spec.label}
            label={spec.label}
            icon={spec.icon}
            onClick={spec.onClick}
            role={spec.role === 'destructive' ? 'destructive' : 'quiet'}
            size={spec.size}
            disabled={running || spec.disabled === true}
            disabledReason={spec.disabledReason}
            busy={spec.busy}
            busyLabel={spec.busyLabel}
            href={spec.href}
            ariaLabel={spec.ariaLabel}
          />
        ))}
        <Action label="Clear" onClick={onClear} role="quiet" disabled={running} />
      </ActionRow>
      {running ? (
        // Full width, so it takes its own line inside the wrapping bar rather
        // than squeezing the actions it is already disabling.
        <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: GAP.control }}>
          <LinearProgress
            color="inherit"
            variant="determinate"
            value={pct}
            aria-labelledby={progressId}
            sx={{ flexGrow: 1, borderRadius: RADIUS.pill }}
          />
          <Typography id={progressId} variant="body2" className="tnum">
            {run.done} of {run.total}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}

/* ── useBulkRun ──────────────────────────────────────────────────────── */

export interface BulkRunner<T> {
  run: (items: T[], fn: (item: T) => Promise<void>) => Promise<void>;
  progress: BulkProgress | null;
  busy: boolean;
}

/**
 * A rejection is the only failure signal, so whatever it carries is what the
 * summary quotes. The fallback is a sentence rather than a shrug because
 * "3 done, 2 failed — undefined" is what the hand-rolled copies risk today.
 */
function reasonOf(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  if (typeof error === 'string' && error.trim() !== '') return error;
  return 'the reason was not reported';
}

/**
 * Runs `fn` over the selection one item at a time, reports `{ done, total }`
 * as it goes, and emits exactly ONE toast when it finishes. `noun` is the
 * plural the success sentence reads with — "12 documents done".
 */
export function useBulkRun<T>(opts: { noun: string; onDone?: () => void }): BulkRunner<T> {
  const toast = useToast();
  const [progress, setProgress] = useState<BulkProgress | null>(null);

  /** Guards a second run started from a button the first one did not disable. */
  const runningRef = useRef(false);
  // Latest-value refs, so `run` keeps one identity for the life of the hook
  // and a caller can pass an inline `onDone` without re-creating every button
  // in the selection bar on each render.
  const nounRef = useRef(opts.noun);
  const onDoneRef = useRef(opts.onDone);
  useEffect(() => {
    nounRef.current = opts.noun;
    onDoneRef.current = opts.onDone;
  });

  const run = useCallback(
    async (items: T[], fn: (item: T) => Promise<void>) => {
      if (runningRef.current) return;
      const total = items.length;
      // Nothing selected is not an outcome worth a toast — the caller already
      // knows, because it is the one that filtered the list to nothing.
      if (total === 0) return;

      runningRef.current = true;
      setProgress({ done: 0, total });

      let ok = 0;
      let reason = '';
      for (const item of items) {
        try {
          await fn(item);
          ok += 1;
        } catch (error) {
          // The FIRST reason is the one quoted: a cascade of failures almost
          // always shares a cause, and the last one is the least informative.
          if (reason === '') reason = reasonOf(error);
        }
        setProgress((prev) => (prev === null ? prev : { ...prev, done: prev.done + 1 }));
      }

      runningRef.current = false;
      setProgress(null);
      // Refetch before the toast, so the list has already caught up by the
      // time the sentence describing it appears.
      onDoneRef.current?.();

      const failed = total - ok;
      if (failed === 0) toast.success(`${ok} ${nounRef.current} done`);
      else toast.error(`${ok} done, ${failed} failed — ${reason}`);
    },
    [toast],
  );

  return { run, progress, busy: progress !== null };
}
