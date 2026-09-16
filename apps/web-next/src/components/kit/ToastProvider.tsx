'use client';

/**
 * The app's one snackbar.
 *
 * Nine screens own a private `Snackbar` today and a tenth hides inside
 * `export/ExportMenu.tsx:84-88`, which means two of them can occupy the same
 * anchor at the same moment: export a filtered list from Properties, have the
 * export fail, and ExportMenu's snackbar lands on top of the page's own
 * (`views/LandPropertiesPage.tsx:821-825`) — one message covering another, each
 * running its own timer. Neither file is wrong on its own; that is simply what
 * happens when the queue is a component-local `useState` and every screen keeps
 * its own. There is exactly one `Snackbar` in this file, it is mounted once at
 * the app root, and it is the only one that should be left in the app.
 *
 * The timers are the other half. Every copy auto-hides — 4000ms on the screens,
 * 5000 in ExportMenu — and none of them makes an exception for failure, so
 * "Could not delete the parcel" disappears while the reader is still looking at
 * the row it was talking about, and the dialog that raised it has already closed
 * behind it. The spec's rule is that a failure stays until it is dismissed, so
 * severity picks the duration here and `error` gets `null`. The same rule is why
 * `clickaway` is ignored: clicking somewhere else on the page is not a reader
 * acknowledging an error, and treating it as one would put the four-second
 * problem back under a different name.
 *
 * `notify` is threaded into four dialogs as a plain prop on the canonical screen
 * (`:806`, `:813`, `:815`, `:816`), and the twenty-odd call sites across the app
 * will migrate one at a time rather than in one commit. So every function on the
 * api object is stable for the life of the provider — the queue lives in a ref
 * and the visible toast in a reducer whose `dispatch` never changes identity —
 * and a dialog can go on taking `notify` as a prop without re-rendering itself
 * every time some other part of the screen toasts.
 *
 * Nothing about the anchor or the fill is re-declared: `theme/index.tsx:193-196`
 * already makes bottom-center the default for every `Snackbar` in the app, and
 * `Alert`'s default (standard) variant is the one the spec asks for. A provider
 * that restated either would be a second place for them to drift.
 *
 * Extracted from `views/LandPropertiesPage.tsx:97-100` (the local `Toast`
 * interface, now `ToastMessage` in `types.ts`), `:146` (`notify`), `:821-825`
 * (the `Snackbar` + `Alert` pair, 4000ms, errors auto-hiding against the spec)
 * and `:806`/`:813`/`:815`/`:816` (the prop threading);
 * `export/ExportMenu.tsx:84-88` (the second, overlapping queue at 5000ms);
 * `theme/index.tsx:193-196` (the bottom-center default this inherits).
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import type { SnackbarCloseReason } from '@mui/material/Snackbar';
import CloseIcon from '@mui/icons-material/Close';
import type { ActionSpec, ToastMessage, ToastSeverity } from './types';
import { Action } from './Action';
import { focusRingSx } from './tokens';

export interface ToastApi {
  /** Default severity 'success'. Errors never auto-hide. */
  notify: (message: ReactNode, severity?: ToastSeverity, action?: ActionSpec) => void;
  success: (message: ReactNode) => void;
  error: (message: ReactNode, action?: ActionSpec) => void;
  warning: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
  dismiss: () => void;
}

export interface ToastProviderProps {
  children: ReactNode;
}

/**
 * Null is the "no provider" signal and `useToast` turns it into a throw. A
 * default no-op api would be worse than no provider at all: every failure
 * message in the app would be swallowed and the screen would look like it
 * succeeded.
 */
const ToastContext = createContext<ToastApi | null>(null);

/**
 * Severity, not the caller, decides how long a message stays. An error has no
 * duration at all — it leaves when someone dismisses it, which is the whole
 * reason this provider exists.
 */
const AUTO_HIDE: Record<ToastSeverity, number | null> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: null,
};

/**
 * The visible toast, separate from the queue behind it. `current` outlives
 * `open` on purpose: the message has to stay mounted through its exit
 * transition, and that exit is what releases the next one.
 */
interface ToastState {
  current: ToastMessage | null;
  open: boolean;
}

type ToastEvent = { type: 'show'; toast: ToastMessage } | { type: 'hide' };

const INITIAL: ToastState = { current: null, open: false };

function reduce(state: ToastState, event: ToastEvent): ToastState {
  switch (event.type) {
    case 'show':
      return { current: event.toast, open: true };
    case 'hide':
      return state.open ? { ...state, open: false } : state;
  }
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [state, dispatch] = useReducer(reduce, INITIAL);

  /** Waiting messages. A ref, so pushing one cannot re-render the whole tree. */
  const queueRef = useRef<ToastMessage[]>([]);
  /** Mirrors `state.open` synchronously — `notify` must not wait for a commit. */
  const showingRef = useRef(false);
  /**
   * Whether the current toast actually reached the DOM. Two `notify` calls in
   * one event handler are batched into a single commit, so the first message
   * can be asked to leave a transition it never entered; without this flag its
   * `onExited` would never fire and everything queued behind it would strand.
   */
  const enteredRef = useRef(false);

  const idPrefix = useId();
  const seqRef = useRef(0);
  const nextId = useCallback(() => {
    seqRef.current += 1;
    return `${idPrefix}toast-${seqRef.current}`;
  }, [idPrefix]);

  /** Promotes the head of the queue, if there is one. Idempotent when empty. */
  const pump = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) return;
    showingRef.current = true;
    enteredRef.current = false;
    dispatch({ type: 'show', toast: next });
  }, []);

  const dismiss = useCallback(() => {
    showingRef.current = false;
    dispatch({ type: 'hide' });
  }, []);

  const notify = useCallback(
    (message: ReactNode, severity: ToastSeverity = 'success', action?: ActionSpec) => {
      queueRef.current.push({ id: nextId(), message, severity, action });
      // One at a time, never stacked: whatever is on screen is asked to leave
      // and the newcomer opens on its exit.
      if (showingRef.current) {
        showingRef.current = false;
        dispatch({ type: 'hide' });
        return;
      }
      pump();
    },
    [nextId, pump],
  );

  const handleExited = useCallback(() => {
    enteredRef.current = false;
    pump();
  }, [pump]);

  const handleEntered = useCallback(() => {
    enteredRef.current = true;
  }, []);

  // The safety net for the batched case described on `enteredRef`: a toast that
  // was closed before it ever rendered owes the queue an `onExited` it can
  // never deliver, so the queue is advanced here instead.
  useEffect(() => {
    if (state.open || enteredRef.current) return;
    pump();
  }, [state.open, state.current, pump]);

  const api = useMemo<ToastApi>(
    () => ({
      notify,
      success: (message: ReactNode) => notify(message, 'success'),
      error: (message: ReactNode, action?: ActionSpec) => notify(message, 'error', action),
      warning: (message: ReactNode) => notify(message, 'warning'),
      info: (message: ReactNode) => notify(message, 'info'),
      dismiss,
    }),
    [notify, dismiss],
  );

  const handleClose = useCallback(
    (_event: SyntheticEvent | Event, reason: SnackbarCloseReason) => {
      // A click elsewhere on the page is not someone reading the message.
      // Escape and the timer are; both land in `dismiss`.
      if (reason === 'clickaway') return;
      dismiss();
    },
    [dismiss],
  );

  const current = state.current;
  const spec = current?.action;

  // MUI renders `action` INSTEAD of its built-in close affordance, so when a
  // toast carries one the close button has to be composed in by hand — the
  // Alert always keeps a way out, action or no action. Both spellings of that
  // way out carry the kit focus ring: `ButtonBase` zeroes the UA outline and
  // leaves only the ripple behind, and on an error toast — which never
  // auto-hides — this button is the reader's sole exit, so a keyboard user has
  // to be able to see where it is.
  const alertAction = spec ? (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Action
        label={spec.label}
        icon={spec.icon}
        onClick={spec.onClick}
        role="quiet"
        size="compact"
        disabled={spec.disabled}
        disabledReason={spec.disabledReason}
        busy={spec.busy}
        busyLabel={spec.busyLabel}
        href={spec.href}
        ariaLabel={spec.ariaLabel}
      />
      <IconButton
        size="small"
        color="inherit"
        aria-label="Dismiss"
        onClick={dismiss}
        sx={{ '&:focus-visible': { ...focusRingSx } }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  ) : undefined;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        // Independent treatment per message: without a changing key the timer
        // of the outgoing toast would carry over to the incoming one.
        key={current?.id}
        open={state.open}
        autoHideDuration={current ? AUTO_HIDE[current.severity] : null}
        onClose={handleClose}
        slotProps={{ transition: { onEntered: handleEntered, onExited: handleExited } }}
      >
        <Alert
          severity={current?.severity ?? 'success'}
          onClose={dismiss}
          action={alertAction}
          slotProps={{ closeButton: { sx: { '&:focus-visible': { ...focusRingSx } } } }}
          sx={{ width: '100%' }}
        >
          {current?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

/**
 * Throws outside a provider. A missing `ToastProvider` means every message the
 * screen tries to raise would vanish silently, so it fails at the first call
 * rather than the first failure it was meant to report.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error(
      'useToast must be used inside a <ToastProvider>. Mount it once in src/app/layout.tsx, ' +
        'inside the provider stack and outside RequireAuth.',
    );
  }
  return api;
}
