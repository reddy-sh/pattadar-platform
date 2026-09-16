'use client';

/**
 * The one destructive confirmation — and the only one that knows the mutation
 * it guards can take time, and can fail.
 *
 * Eleven dialogs in this app already ask "are you sure?", and no two of them
 * agree on what happens after the user answers. `LandPropertiesPage.tsx:780-795`
 * is the most complete of them and is still wrong in one expensive way: its
 * `confirmDelete` clears `deleteTarget` inside a `finally` (`:315-318`), so the
 * dialog closes whether the delete succeeded or threw. On failure the only
 * trace is a snackbar that auto-hides in four seconds, over a list where the
 * row the user just tried to delete is still sitting. So the rule here is the
 * inverse: a rejected `onConfirm` keeps the dialog open and puts the reason
 * inside it, and only a resolved one closes.
 *
 * `InvitationsPage.tsx:366-379` and `NotificationsPage.tsx:279-290` have no
 * pending state at all — the confirm button stays live while the request is in
 * flight, so a double-tap fires two deletes. `GroupDetail.tsx:590-598` and
 * `ParcelDetailPage.tsx:502-518` are a title and two buttons with no body:
 * "Remove this boundary?" never says that the boundary is gone. That is why
 * `ConfirmSpec.body` is required rather than optional — a destructive confirm
 * with no stated consequence does not compile. And `PropertyDetailPage.tsx:736-768`
 * inlines the entire chain — mutate, refresh, route, catch, finally — inside
 * the button's `onClick`, which is why nothing about it can be reused or
 * reasoned about. Here that is `onConfirm`: a named handler, and the promise it
 * returns is the whole protocol.
 *
 * Busy is the reason this is a component and not a snippet. While the promise
 * is in flight both buttons disable and `onClose` is refused for Esc, the
 * backdrop and Cancel alike, because a dialog that vanishes mid-mutation leaves
 * the user with no way to tell whether the thing happened. The moment it is not
 * busy, Esc closes again — that is the accessibility gate, not a preference.
 * (MUI 9 removed `disableEscapeKeyDown`; Modal reports Esc through `onClose`
 * and never closes itself, so refusing there covers all three routes.)
 *
 * The filled red confirm button is deliberate, and this is the only place in the
 * kit that allows it. The spec's "destructive = red text + confirm" governs the
 * TRIGGER out on the page, which is `Action role="destructive"`; inside the
 * dialog the choice has already been narrowed to two and the emphasis belongs on
 * the act. All eleven originals already spell it this way, so the kit writes the
 * split down instead of churning it (contract, "Known seams").
 *
 * `useConfirm` exists so that guarding an action does not cost a screen two
 * pieces of state. Every one of the eleven keeps a `deleteTarget` beside the
 * dialog purely to remember what was clicked; `ask(spec, run)` closes over the
 * target instead, and the screen holds nothing.
 *
 * Extracted from `views/LandPropertiesPage.tsx:780-795` (+ `:315-318`) and its
 * ten siblings, notably `views/InvitationsPage.tsx:366-379`,
 * `views/NotificationsPage.tsx:279-290`, `views/families/GroupDetail.tsx:590-598`,
 * `views/detail/ParcelDetailPage.tsx:502-518` and
 * `views/detail/PropertyDetailPage.tsx:736-768`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useCallback, useId, useState } from 'react';
import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

import { Action, ActionRow } from './Action';
import { GAP, MEASURE, RADIUS, focusRingSx } from './tokens';
import type { ConfirmSpec } from './types';

/** Neutral enough to sit under any title; a caller with a verb passes one. */
const DEFAULT_CONFIRM_LABEL = 'Confirm';

/** Contract default. `Deleting…` / `Removing…` are the caller's to supply. */
const DEFAULT_BUSY_LABEL = 'Working…';

/**
 * Shown when the rejection carries nothing readable. It says "try again"
 * because the dialog is still open and trying again is one tap away — which is
 * the entire difference between this and the toast it replaces.
 */
const DEFAULT_FAILURE = "Couldn't complete that — try again.";

/**
 * A rejection is `unknown`, and the three shapes that actually reach us are an
 * `Error`, a thrown string, and something with neither. Anything else falls
 * through to prose rather than rendering `[object Object]` at the user.
 */
function failureMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim() !== '') return cause.message;
  if (typeof cause === 'string' && cause.trim() !== '') return cause;
  return DEFAULT_FAILURE;
}

export interface ConfirmDialogProps extends ConfirmSpec {
  open: boolean;
  onClose: () => void;
  /** Rejecting keeps the dialog OPEN and shows the error inline. */
  onConfirm: () => void | Promise<void>;
  /** Third, left-aligned action (GroupDetail's "Reset to everyone"). Rare. */
  tertiaryAction?: { label: string; onClick: () => void };
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  tertiaryAction,
  title,
  body,
  confirmLabel = DEFAULT_CONFIRM_LABEL,
  busyLabel = DEFAULT_BUSY_LABEL,
  destructive,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * The dialog stays mounted across opens (that is what gives it an exit
   * transition), so a failure from the last question would otherwise still be
   * on screen when the next one opens. Adjusted during render rather than in an
   * effect so the stale Alert never paints for a frame — React's documented
   * "adjust state when a prop changes" pattern, and it terminates because the
   * two values are equal immediately afterwards.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBusy(false);
      setFailure(null);
    }
  }

  /** Esc, the backdrop and Cancel all land here, and all three are refused while busy. */
  const handleClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const handleConfirm = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await onConfirm();
    } catch (cause) {
      // Deliberately NOT a `finally`: closing here is the defect this file was
      // written to remove.
      setBusy(false);
      setFailure(failureMessage(cause));
      return;
    }
    setBusy(false);
    onClose();
  }, [busy, onConfirm, onClose]);

  const runConfirm = useCallback(() => {
    void handleConfirm();
  }, [handleConfirm]);

  return (
    <Dialog
      open={open}
      // Esc, the backdrop and Cancel all arrive here, and `open` is the
      // parent's, so refusing inside the handler is what actually keeps the
      // dialog on screen while busy. MUI 9 dropped `disableEscapeKeyDown`
      // (Modal only ever reported the key through `onClose`), so this handler
      // is the whole gate rather than half of it.
      onClose={handleClose}
      maxWidth="xs"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      slotProps={{
        paper: {
          sx: {
            // `xs` sizes it for one sentence; the form measure is the ceiling a
            // longer consequence can grow to.
            maxWidth: MEASURE.form,
            borderRadius: RADIUS.dialog,
          },
        },
      }}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        {/* `div`, because `body` is a ReactNode and a caller may pass a list. */}
        <DialogContentText id={bodyId} component="div">
          {body}
        </DialogContentText>
        {failure !== null ? (
          <Alert severity="error" sx={{ mt: GAP.block, borderRadius: RADIUS.control }}>
            {failure}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        {/* Full width so the tertiary's `mr: auto` has room to push against. */}
        <Box sx={{ width: '100%' }}>
          {/* `root`: a confirm is opened from wherever the verb lives — a row
              menu inside a table, a `Section`, another dialog's discard guard —
              and its own Confirm button must stay filled in every one of those.
              Inheriting would demote the button the overlay exists to offer. */}
          <ActionRow name="Confirm" justify="end" root>
            {tertiaryAction ? (
              <Box sx={{ mr: 'auto' }}>
                <Action
                  role="quiet"
                  label={tertiaryAction.label}
                  onClick={tertiaryAction.onClick}
                  disabled={busy}
                />
              </Box>
            ) : null}
            <Action role="quiet" label="Cancel" onClick={handleClose} disabled={busy} />
            {destructive === true ? (
              // The one sanctioned filled-red button in the kit. `Action` has no
              // role for it on purpose — `destructive` is the red-TEXT trigger
              // that opens this dialog, never the button inside it.
              <Button
                variant="contained"
                color="error"
                disabled={busy}
                aria-busy={busy ? true : undefined}
                onClick={runConfirm}
                sx={{ '&:focus-visible': { ...focusRingSx } }}
              >
                {busy ? busyLabel : confirmLabel}
              </Button>
            ) : (
              <Action
                role="primary"
                label={confirmLabel}
                busy={busy}
                busyLabel={busyLabel}
                onClick={runConfirm}
              />
            )}
          </ActionRow>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

/* ── useConfirm ──────────────────────────────────────────────────────── */

interface PendingConfirm {
  spec: ConfirmSpec;
  run: () => void | Promise<void>;
}

export interface ConfirmController {
  /** Guard any action in one line. */
  ask: (spec: ConfirmSpec, run: () => void | Promise<void>) => void;
  /** Mount once per screen. The scaffolds mount it for you. */
  element: ReactNode;
}

/**
 * One pending question, held as `{ spec, run }`. The screen keeps no target
 * state of its own: `run` closes over whatever the row menu was pointing at.
 *
 * The spec survives the close so the fade-out renders the same words it faded
 * in with — clearing it on close would blank the dialog for the length of the
 * exit transition. The next `ask` replaces it.
 */
export function useConfirm(): ConfirmController {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [open, setOpen] = useState(false);

  const ask = useCallback((spec: ConfirmSpec, run: () => void | Promise<void>) => {
    setPending({ spec, run });
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const element: ReactNode =
    pending === null ? null : (
      <ConfirmDialog {...pending.spec} open={open} onClose={close} onConfirm={pending.run} />
    );

  return { ask, element };
}
