'use client';

/**
 * The hidden-input dance, as a hook.
 *
 * Every screen that lets a user attach a file has been re-writing the same four
 * pieces by hand — a ref, a bare `<input type="file" hidden>` parked at the
 * bottom of the JSX, a change handler that must remember to blank `value` or
 * re-picking the same file fires nothing, and a second ref to remember what the
 * file was *for*. Extracted from `src/views/LandPropertiesPage.tsx` — the two
 * refs at :143-144, `onCoverFile` at :321-335 (including the `e.target.value = ''`
 * reset at :323), the menu item that reaches through to `.click()` at :344-350,
 * and the orphan input at :819 — which is the shortest of the four copies; the
 * other three live in `documents/DocumentsTab.tsx`, `detail/PropertyFilesPanel.tsx`
 * and `documents/DeedImportDialog.tsx`.
 *
 * Two things make the extraction worth it. `pick()` is a promise, so the caller
 * writes a straight line of code instead of splitting its intent across a click
 * handler and a detached `onChange` — which is why the "what was this for?" ref
 * disappears entirely; the answer is just the closure around the `await`. And
 * the caps return a discriminated result rather than a message: the hook has no
 * opinion about how a breach should read, because the app demonstrably does not
 * have one either — the identical 10-file cap toasts `'info'` in `DocumentsTab`
 * and `'warning'` in `PropertyFilesPanel`. Copy and severity stay with the
 * caller, which is the only place that knows whether a rejected pick is a
 * nuisance or a failure.
 *
 * A dismissed OS dialog fires no event at all, so a naive promise hangs for the
 * life of the page. The window regaining focus is the only signal a browser
 * gives us, and it lands slightly *before* the `change` of a successful pick —
 * hence the grace period rather than an immediate cancel.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { createElement, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type { FilePickResult } from './types';

/**
 * How long after the window regains focus we still wait for a `change`.
 * A real pick delivers one within a frame or two; a dismissed dialog never does.
 */
const CANCEL_GRACE_MS = 500;

export interface FilePickerOptions {
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxBytes?: number;
}

export interface FilePicker {
  /** Opens the OS picker and resolves with the outcome. Never rejects. */
  pick: () => Promise<FilePickResult>;
  /** Mount once per screen. Renders the managed hidden input. */
  element: ReactNode;
}

/**
 * Does one `accept` token cover this file? Tokens are either an extension
 * (`.pdf`), a trailing-wildcard type (image-slash-star), the everything
 * wildcard, or an exact MIME type. A file coming off some filesystems arrives
 * with an empty `type`, so an extension token is the only thing that can vouch
 * for it.
 */
function tokenAccepts(token: string, file: File): boolean {
  const t = token.trim().toLowerCase();
  if (!t || t === '*' || t === '*/*') return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (t.startsWith('.')) return name.endsWith(t);
  if (t.endsWith('/*')) return type.startsWith(t.slice(0, -1));
  return type === t;
}

function matchesAccept(accept: string | undefined, files: File[]): boolean {
  if (!accept) return true;
  const tokens = accept.split(',').filter((t) => t.trim().length > 0);
  if (tokens.length === 0) return true;
  return files.every((file) => tokens.some((token) => tokenAccepts(token, file)));
}

/**
 * Owns a single hidden `<input type="file">` and hands back a promise-shaped
 * `pick()`. Mount `element` once anywhere in the screen; its position in the
 * DOM is irrelevant, it is never focusable and never reaches the a11y tree.
 */
export function useFilePicker(options?: FilePickerOptions): FilePicker {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resolveRef = useRef<((result: FilePickResult) => void) | null>(null);
  /** Clears the focus listener and grace timer of the pick currently in flight. */
  const teardownRef = useRef<(() => void) | null>(null);

  // Held in a ref so a caller passing an inline object literal — the common
  // case — does not churn `pick` on every render, while the handlers still read
  // the current caps.
  const optionsRef = useRef<FilePickerOptions | undefined>(options);
  optionsRef.current = options;

  /** Resolves the in-flight pick exactly once and disarms the cancel watch. */
  const settle = useCallback((result: FilePickResult) => {
    teardownRef.current?.();
    teardownRef.current = null;
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(result);
  }, []);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const opts = optionsRef.current;
      const files = Array.from(event.target.files ?? []);
      // Blanking here as well as in `pick` keeps the input from holding a
      // reference to the chosen file for the rest of the page's life.
      event.target.value = '';

      if (files.length === 0) {
        settle({ status: 'cancelled' });
        return;
      }
      const maxFiles = opts?.maxFiles;
      if (typeof maxFiles === 'number' && files.length > maxFiles) {
        settle({ status: 'too-many', limit: maxFiles });
        return;
      }
      const maxBytes = opts?.maxBytes;
      if (typeof maxBytes === 'number') {
        // A multi-file pick is capped as a batch (one upload's worth of bytes);
        // a single-file pick is capped per file.
        const over = opts?.multiple
          ? files.reduce((sum, file) => sum + file.size, 0) > maxBytes
          : files.some((file) => file.size > maxBytes);
        if (over) {
          settle({ status: 'too-large', limitBytes: maxBytes });
          return;
        }
      }
      if (!matchesAccept(opts?.accept, files)) {
        settle({ status: 'wrong-type', accept: opts?.accept ?? '' });
        return;
      }
      settle({ status: 'ok', files });
    },
    [settle],
  );

  const pick = useCallback(
    () =>
      new Promise<FilePickResult>((resolve) => {
        const input = inputRef.current;
        if (!input) {
          // `element` was never mounted — nothing can open, and a hung promise
          // would be the worse failure.
          resolve({ status: 'cancelled' });
          return;
        }
        // A second pick supersedes the first; the older caller hears 'cancelled'
        // rather than waiting on a result that will now go to someone else.
        settle({ status: 'cancelled' });
        resolveRef.current = resolve;
        // Without this the same file picked twice in a row fires no `change`.
        input.value = '';
        input.click();

        let timer: ReturnType<typeof setTimeout> | null = null;
        const onFocus = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => settle({ status: 'cancelled' }), CANCEL_GRACE_MS);
        };
        teardownRef.current = () => {
          if (timer) clearTimeout(timer);
          window.removeEventListener('focus', onFocus);
        };
        // Registered after `click()`: the dialog blurs the window, so the next
        // focus we see is the dialog closing, dismissed or not.
        window.addEventListener('focus', onFocus);
      }),
    [settle],
  );

  // A screen can unmount mid-pick (a dialog closed behind the OS sheet).
  useEffect(() => () => settle({ status: 'cancelled' }), [settle]);

  const accept = options?.accept;
  const multiple = options?.multiple;
  const element = useMemo(
    () =>
      createElement('input', {
        ref: inputRef,
        type: 'file',
        hidden: true,
        accept,
        multiple,
        onChange: handleChange,
      }),
    [accept, multiple, handleChange],
  );

  return { pick, element };
}
