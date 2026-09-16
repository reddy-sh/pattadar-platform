'use client';

/**
 * The dialog shell, and the form layout system that goes inside it.
 *
 * SIX WIDTHS WERE NEVER SIX DECISIONS. Add Parcel is `sm`, Location is `md`,
 * Stake is `xs`, Person is `md`, Deed Import is `lg`, and Add Property is `sm`
 * in its first step and `lg` in its second — a window that physically resizes
 * under the reader's hands halfway through the flow. Not one of those is a
 * judgement about the form it contains; each is the value that looked right in
 * the file it was typed into. `width` closes the question with three named
 * measures and offers nothing else: the spec's 560 standard, a 720 for a form
 * that genuinely earns two columns, and a 1040 workbench reserved for the batch
 * importers that put a file list beside a draft. A dialog picks one at mount
 * and keeps it.
 *
 * SECTION HEADERS WERE A THREE-WAY SPLIT. The same "group of related fields"
 * idea is spelled `overline` on the parcel page, `caption` on its near-twin the
 * property page, and `subtitle2` over a `borderTop` inside Add Property — three
 * sizes, two weights and two cases for one thing, on screens a user opens
 * within a minute of each other. The spec names `overline` as the label role,
 * so `FormSection` renders `overline` and the argument stops being re-litigated
 * per file.
 *
 * A FIXED GRID IS A 400px OVERFLOW WITH A DELAY. `gridTemplateColumns:
 * '1fr 1fr'` and `'1fr 1fr 1fr 1fr'` have no breakpoint at all, so four
 * boundary fields stay four-up on a phone; and a bare `1fr` track has a
 * min-content floor, so one long unbroken survey number widens the column and
 * takes the page's horizontal scrollbar with it. `FormGrid` answers both at
 * once — one column below `sm`, `minmax(0, 1fr)` tracks above it — and
 * `data-span="full"` replaces the `<Box sx={{ gridColumn: '1 / -1' }}>`
 * wrappers that were the only way to say "this field is wide".
 *
 * A RED BOX IS NOT AN ERROR MESSAGE. Add Parcel paints three fields red on a
 * submit attempt and prints no `helperText` on any of them, so the reader is
 * told that something is wrong and never which thing or why — and told only
 * after they have already pressed the button. The model this file assumes is
 * stated once so the four in the app can collapse onto it: validate on blur,
 * report through the field's own `error` + `helperText`, and render
 * `FormErrorSummary` only after a failed submit, where it takes focus and every
 * line is a real control that moves focus to the field it names.
 *
 * ONE FOOTER, AND THE PRIMARY NAMES THE ACT. The order is always
 * `[secondary] [Cancel] [Primary]` with the primary rightmost, the busy label
 * lives on the action rather than in an inline ternary, and `OK` — which tells
 * a reader nothing about what is about to be written — has nowhere left to be
 * typed. `FormActions` is that same footer outside a dialog, because Profile
 * and Stamp Duty are forms that simply happen not to be modal, and `note`
 * gives a disabled primary the sentence it owes the reader instead of leaving a
 * dead button on the screen.
 *
 * A BACKDROP CLICK IS NOT CONSENT. `PersonDialog` discards a fully typed
 * 749-line form when the pointer lands an inch outside it. `dirty` routes Esc,
 * the backdrop and Cancel through a nested `ConfirmDialog`; `busy` blocks all
 * three outright, so a save in flight cannot be closed out from under itself.
 *
 * AN OVERLAY IS ITS OWN REGION. The footer primary is only "the one filled
 * button" if the whole dialog is the region being counted, so the region opens
 * around the entire `<Dialog>` subtree rather than around the footer — a
 * `role="primary"` Action dropped into the body then competes with the footer's
 * and is demoted, visibly, instead of shipping two filled buttons. It is
 * declared `root`, because the region a dialog belongs to is the dialog, not
 * whatever `Section` its JSX happened to be written inside; without that a
 * dialog mounted from inside a section's region would count as nested and
 * demote its own footer primary to tonal.
 *
 * Extracted from `views/LandPropertiesPage.tsx:780-795` (the footer pair with
 * its busy label); the six widths at `holdings/AddParcelDialog.tsx:105`,
 * `holdings/LocationDialog.tsx:63`, `holdings/StakeDialog.tsx`,
 * `families/PersonDialog.tsx:312`, `documents/DeedImportDialog.tsx:213` and
 * `holdings/AddPropertyDialog.tsx:589`; the three section-header styles at
 * `detail/ParcelDetailPage.tsx:650-656`, `detail/PropertyDetailPage.tsx:372-378`
 * and `holdings/AddPropertyDialog.tsx:529-531`; the fixed grids at
 * `holdings/AddPropertyDialog.tsx:505` and `:563`; and
 * `holdings/AddParcelDialog.tsx:117-142` (red fields, no message) and `:192`
 * (the primary labelled `OK`).
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';

import type { ActionRole, ActionSpec, DialogWidth, FieldError } from './types';
import { GAP, MEASURE, PAD, RADIUS, focusRingSx } from './tokens';
import { Action, ActionRegion, ActionRow, IconAction, LinkAction } from './Action';
import { ConfirmDialog } from './ConfirmDialog';

/** The three measures, and there is no fourth. Spec "Forms/dialogs": 560 standard. */
const DIALOG_MAX_WIDTH: Record<DialogWidth, number> = {
  standard: MEASURE.form,
  wide: MEASURE.wide,
  workbench: MEASURE.workbench,
};

/**
 * `fullScreenBelow: false` still has to run the hook — conditionally calling
 * `useMediaQuery` is not an option — so it runs against a query no viewport can
 * satisfy rather than against a breakpoint.
 */
const NEVER_MATCHES = '(max-width: 0px)';

const DEFAULT_DIRTY_MESSAGE = 'Discard your changes? Anything you have typed will be lost.';

/* ── Action plumbing ─────────────────────────────────────────────────── */

interface SpecActionProps {
  spec: ActionSpec;
  /** Used when the caller's spec does not state one. */
  role: ActionRole;
}

/**
 * Renders an `ActionSpec` field by field rather than by spread. `ActionSpec.key`
 * is the caller's own identifier, and spreading the whole object into JSX would
 * hand it to React as an element key — which React 19 warns about and which
 * would quietly change reconciliation behaviour on a footer that re-renders.
 */
function SpecAction({ spec, role }: SpecActionProps) {
  return (
    <Action
      label={spec.label}
      icon={spec.icon}
      onClick={spec.onClick}
      role={spec.role ?? role}
      size={spec.size}
      disabled={spec.disabled}
      disabledReason={spec.disabledReason}
      busy={spec.busy}
      busyLabel={spec.busyLabel}
      href={spec.href}
      ariaLabel={spec.ariaLabel}
    />
  );
}

interface FooterRowProps {
  /** Names the `ActionRegion` in the dev-time two-filled-buttons error. */
  regionName: string;
  /**
   * Open an own ROOT region (default), or, with `false`, claim the region
   * already declared above. `FormDialog` passes `false`: the dialog opens the
   * root region itself, one level up, so that the footer primary counts against
   * the whole dialog body. A page form has no such wrapper, so `FormActions`
   * keeps the default and opens its own — and it must be a root, because a page
   * form is routinely written inside a `Section`, whose region would otherwise
   * make this footer a nested one and demote Save to tonal.
   */
  region?: boolean;
  primary: ActionSpec;
  secondary?: ActionSpec;
  cancel?: ActionSpec;
  note?: ReactNode;
}

/**
 * The one footer shape, shared by the dialog and by `FormActions` so a modal
 * form and a page form cannot drift apart. Order is fixed — secondary, cancel,
 * primary — and a ROOT region is always counting around it, which is what makes
 * the primary the single filled button no matter what the body contains and no
 * matter what the form is nested inside.
 */
function FooterRow({ regionName, region = true, primary, secondary, cancel, note }: FooterRowProps) {
  const cluster = (
    <>
      {secondary ? <SpecAction spec={secondary} role="tertiary" /> : null}
      {cancel ? <SpecAction spec={cancel} role="quiet" /> : null}
      <SpecAction spec={primary} role="primary" />
    </>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: GAP.cluster,
        width: '100%',
      }}
    >
      {note ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flex: '1 1 200px', minWidth: 0 }}
        >
          {note}
        </Typography>
      ) : null}
      <Box sx={{ ml: 'auto', minWidth: 0 }}>
        {region ? (
          // `root`: a footer is a footer wherever the form is written. Without
          // it a page form dropped into a `Section` — which is the shape the
          // rollout gives every form-tool screen — inherits that section's
          // region and silently renders Save tonal.
          <ActionRow name={regionName} justify="end" root>
            {cluster}
          </ActionRow>
        ) : (
          // Same cluster, no region: `ActionRow` would open a nested one.
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: GAP.control,
              justifyContent: 'flex-end',
            }}
          >
            {cluster}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/* ── FormDialog ──────────────────────────────────────────────────────── */

export interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** 'standard' 560 (spec) | 'wide' 720 | 'workbench' 1040 (batch import only). */
  width?: DialogWidth;
  /** The primary label must NAME the act ("Save parcel"), never "OK". */
  primary: ActionSpec;
  secondary?: ActionSpec;
  cancelLabel?: string;
  /** Blocks Esc / backdrop and disables both footer buttons. */
  busy?: boolean;
  /** Warn before discarding a touched form on Esc / backdrop / Cancel. */
  dirty?: boolean;
  dirtyMessage?: string;
  /** Wraps children in a <form> so Enter submits into primary.onClick. Default true. */
  asForm?: boolean;
  /** Full-screen below this breakpoint. Default 'sm'. */
  fullScreenBelow?: 'sm' | 'md' | false;
  children: ReactNode;
}

export function FormDialog({
  open,
  onClose,
  title,
  subtitle,
  width = 'standard',
  primary,
  secondary,
  cancelLabel = 'Cancel',
  busy = false,
  dirty = false,
  dirtyMessage = DEFAULT_DIRTY_MESSAGE,
  asForm = true,
  fullScreenBelow = 'sm',
  children,
}: FormDialogProps) {
  const titleId = useId();
  const subtitleId = useId();
  const [discarding, setDiscarding] = useState(false);

  const fullScreen = useMediaQuery((theme) =>
    fullScreenBelow === false ? NEVER_MATCHES : theme.breakpoints.down(fullScreenBelow),
  );

  // A dialog that is re-opened must not still be showing last time's confirm.
  useEffect(() => {
    if (!open) setDiscarding(false);
  }, [open]);

  /**
   * The one exit. Every route out of the dialog — Esc, the backdrop, the
   * title-bar close and Cancel — goes through here, so the busy block and the
   * dirty guard cannot apply to three of them and miss the fourth.
   */
  const requestClose = useCallback(() => {
    if (busy) return;
    if (dirty) {
      setDiscarding(true);
      return;
    }
    onClose();
  }, [busy, dirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setDiscarding(false);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy || primary.disabled === true) return;
      primary.onClick();
    },
    [busy, primary],
  );

  const body = asForm ? (
    <Box component="form" noValidate onSubmit={handleSubmit}>
      {children}
      {/* Implicit submission needs a default button to exist; without one, Enter
          in a form of several fields does nothing at all. It is never seen and
          never reachable — the footer primary is the visible control. */}
      <button type="submit" hidden tabIndex={-1} />
    </Box>
  ) : (
    children
  );

  return (
    /**
     * The dialog opens its own region, which is what the footer primary is
     * counted in (`FooterRow` below takes `region={false}` rather than opening
     * a second one inside this).
     *
     * `root`, because React context reaches a portal through the React tree,
     * not the DOM one: a dialog whose JSX sits inside a `Section` or an expanded
     * row would otherwise inherit that region, count as nested, and demote its
     * own footer primary to tonal. The region a dialog belongs to is the dialog.
     */
    <ActionRegion name={title} root>
      <Dialog
        open={open}
        onClose={requestClose}
        fullWidth
        maxWidth={false}
        fullScreen={fullScreen}
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        slotProps={{
          paper: {
            sx: {
              // Full screen is its own shape: a capped width or a rounded corner
              // here would fight MUI's own full-screen rules and leave a gap.
              ...(fullScreen
                ? { borderRadius: 0 }
                : { maxWidth: DIALOG_MAX_WIDTH[width], borderRadius: RADIUS.dialog }),
            },
          },
        }}
      >
        <DialogTitle
          component="div"
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: GAP.control,
            p: PAD.dialog,
            pb: GAP.control,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id={titleId} variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
            {subtitle ? (
              <Typography
                id={subtitleId}
                variant="body2"
                color="text.secondary"
                sx={{ mt: GAP.tight }}
              >
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {/* Nothing may close the dialog while a save is in flight, so the
              affordance goes away rather than sitting there inert. */}
          {busy ? null : (
            <Box sx={{ flexShrink: 0 }}>
              <IconAction
                label="Close"
                icon={<CloseIcon fontSize="small" />}
                onClick={requestClose}
              />
            </Box>
          )}
        </DialogTitle>

        {/* `pt` is the header's job — the dialog inset would otherwise be paid
            twice, and a zero would clip an outlined field's floating label. */}
        <DialogContent sx={{ p: PAD.dialog, pt: GAP.tight }}>{body}</DialogContent>

        <DialogActions sx={{ px: PAD.dialog, pb: PAD.dialog, pt: GAP.block }}>
          {/* `region={false}`: the dialog's own region, opened above, is the one
              this primary must be counted in. */}
          <FooterRow
            regionName={title}
            region={false}
            primary={{ ...primary, busy: busy || primary.busy === true }}
            secondary={
              secondary
                ? { ...secondary, disabled: busy || secondary.disabled === true }
                : undefined
            }
            cancel={{ label: cancelLabel, onClick: requestClose, role: 'quiet', disabled: busy }}
          />
        </DialogActions>

        {/* The discard guard, which is `ConfirmDialog` and not a second copy of
            it: the filled-red confirm inside a dialog, and the busy / failure
            protocol, are settled there once. FormDialog is order 6 in the
            contract's build order for exactly this dependency. */}
        <ConfirmDialog
          open={discarding}
          onClose={() => setDiscarding(false)}
          onConfirm={confirmDiscard}
          title="Discard changes?"
          body={dirtyMessage}
          confirmLabel="Discard"
          destructive
        />
      </Dialog>
    </ActionRegion>
  );
}

/* ── FormSection ─────────────────────────────────────────────────────── */

export interface FormSectionProps {
  /** An overline label with a rule above (spec: "sections with overline headers"). */
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  /** The first section drops its top rule. */
  first?: boolean;
}

/**
 * A group of related fields, inside a dialog or on a page. The rule and the
 * overline are the whole vocabulary — there is no `caption` variant and no
 * `subtitle2` variant, which is the point.
 */
export function FormSection({ title, description, children, first = false }: FormSectionProps) {
  return (
    <Box
      sx={
        first
          ? undefined
          : {
              // The rule needs air on both sides; `pt` alone would hang it off
              // whatever sat above, which is what the extracted originals did.
              mt: GAP.block,
              pt: GAP.block,
              borderTop: '1px solid',
              borderColor: 'divider',
            }
      }
    >
      {title ? (
        <Typography
          variant="overline"
          color="text.secondary"
          component="h3"
          sx={{ display: 'block', mb: GAP.tight }}
        >
          {title}
        </Typography>
      ) : null}
      {description ? (
        <Typography
          variant="body2"
          color="text.secondary"
          component="div"
          sx={{ mb: GAP.cluster }}
        >
          {description}
        </Typography>
      ) : null}
      {children}
    </Box>
  );
}

/* ── FormGrid ────────────────────────────────────────────────────────── */

export interface FormGridProps {
  /** Columns at sm and up; ALWAYS 1 column below sm. Default 2. */
  columns?: 1 | 2 | 3 | 4;
  children: ReactNode;
}

/**
 * The field grid. One column below `sm` is not a nicety — it is the only reason
 * a four-up boundary row fits a 400px phone — and `minmax(0, …)` is what stops
 * one long unbroken value from widening a track past the viewport.
 *
 * A child may set `data-span="full"` to occupy the whole row.
 */
export function FormGrid({ columns = 2, children }: FormGridProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          sm: `repeat(${columns}, minmax(0, 1fr))`,
        },
        gap: GAP.block,
        '& > [data-span="full"]': { gridColumn: '1 / -1' },
      }}
    >
      {children}
    </Box>
  );
}

/* ── FormActions ─────────────────────────────────────────────────────── */

export interface FormActionsProps {
  primary: ActionSpec;
  secondary?: ActionSpec;
  cancel?: ActionSpec;
  /** Sticky bottom bar for long page-level forms (Profile). Default false. */
  sticky?: boolean;
  /** Explains a disabled primary in context instead of leaving a dead button. */
  note?: ReactNode;
}

/**
 * The dialog footer, outside a dialog. `sticky` keeps Save on screen through a
 * long page form instead of stranding it below the fold, and `note` is where a
 * disabled primary says why — the answer to a Save button that simply goes
 * grey and never explains itself.
 */
export function FormActions({
  primary,
  secondary,
  cancel,
  sticky = false,
  note,
}: FormActionsProps) {
  return (
    <Box
      sx={
        sticky
          ? {
              position: 'sticky',
              bottom: 0,
              zIndex: 1,
              bgcolor: 'background.paper',
              borderTop: '1px solid',
              borderColor: 'divider',
              py: GAP.block,
            }
          : { pt: GAP.block }
      }
    >
      <FooterRow
        regionName="Form actions"
        primary={primary}
        secondary={secondary}
        cancel={cancel}
        note={note}
      />
    </Box>
  );
}

/* ── FormErrorSummary ────────────────────────────────────────────────── */

export interface FormErrorSummaryProps {
  errors: FieldError[];
  /** Focuses the named field when a summary entry is clicked. */
  onFocusField?: (field: string) => void;
}

/**
 * What a failed submit owes the reader: every problem in one place, each line
 * naming the field and moving focus to it. It takes focus when it first
 * appears — but only then, so that fixing the third error does not yank focus
 * back out of the field being typed into.
 *
 * It renders nothing until a submit has actually failed; blur-time validation
 * on the field itself is the first line of defence, and this is the second.
 */
export function FormErrorSummary({ errors, onFocusField }: FormErrorSummaryProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const wasEmpty = useRef(true);
  const count = errors.length;

  useEffect(() => {
    if (count > 0 && wasEmpty.current) ref.current?.focus();
    wasEmpty.current = count === 0;
  }, [count]);

  if (count === 0) return null;

  return (
    <Alert
      ref={ref}
      severity="error"
      role="alert"
      tabIndex={-1}
      sx={{ borderRadius: RADIUS.control, '&:focus-visible': { ...focusRingSx } }}
    >
      <Box component="ul" sx={{ m: 0, pl: GAP.block }}>
        {errors.map((error) => (
          <Box component="li" key={error.field}>
            {onFocusField ? (
              <LinkAction label={error.message} onClick={() => onFocusField(error.field)} />
            ) : (
              <Typography variant="body2" component="span">
                {error.message}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Alert>
  );
}
