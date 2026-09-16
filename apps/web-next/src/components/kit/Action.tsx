'use client';

/**
 * The button vocabulary, closed.
 *
 * A button in this app currently answers four questions at every call site —
 * which `variant`, which `color`, which `size`, and how emphatic it should be
 * relative to whatever else is on screen — and it answers them 173 times, each
 * time locally. That is how `LandPropertiesPage.tsx:517-524` ends up flipping
 * Filters to `contained` the moment a filter is active, putting a second filled
 * button in the same toolbar as the `contained` Add at `:526-534`. Neither call
 * site is wrong on its own; there was simply nowhere for the rule to live. Here
 * a caller states a ROLE and nothing else, and the role decides the spelling.
 *
 * `ActionRegion` is the other half, and it is a registry rather than a warning.
 * "One filled button per region" cannot be enforced by review — the two buttons
 * are usually written months apart, often in different files. So the first
 * `role="primary"` to claim a region wins and every later claimant renders
 * tonal automatically; dev gets one console error naming the region and both
 * labels, production gets the correct pixels in silence.
 *
 * THE ONE RULE, and it is a property of the CALL SITE rather than of the tree:
 *
 *   A region may hold one filled button when it is declared `root` — a surface
 *   whose actions are complete in themselves and are counted against nothing
 *   outside it — or when no other region encloses it; every other region
 *   INHERITS, and a `role="primary"` inside an inherited region that has a
 *   region above it renders tonal.
 *
 * Inheriting is the default because structural nesting is the common case: a
 * sub-list, an expanded row or a detail pane inside a page must not put a
 * second filled button beside its host's, and `depth > 0` demotes it at render
 * time without even trying to claim. `root` is the stated exception, and it is
 * stated where the region is opened rather than inferred from how deep the tree
 * happened to get: a dialog is its own surface no matter which `Section` its
 * JSX was written inside, and a page form's footer owns its Save even when the
 * form sits in a card. Anything that is merely structure — `Section`,
 * `PageHeader`, `ListToolbar`, the selection bar — stays inherited, so the rule
 * a reviewer applies is "is this call site `root`, and is anything above it a
 * region?" and never "how many components deep does this render?".
 *
 * A page scaffold's tab panel is deliberately NOT a region at all (see
 * `TabbedScreen` / `RecordScreen`): a panel has nothing of its own to count,
 * and wrapping one turned every region its content opened — a `Section`, an
 * embedded `ListToolbar` — into a nested one, which is how a tab ended up with
 * no filled button anywhere in it.
 *
 * `demote` stays as the caller's explicit override so the outcome never depends
 * on mount order alone — the empty-state rule (while a list is empty, ZeroState
 * owns the filled button and the toolbar's create action goes tonal) is one
 * prop, stated once.
 *
 * The sizes exist because M3's 40/32px controls are below the 44px touch gate.
 * Rather than inflate the control — which would break the type scale the spec
 * fixes — a compact button keeps its 32px body and grows a centred 44px
 * pseudo-element hit box. The control looks right and the target passes.
 *
 * Extracted from `views/LandPropertiesPage.tsx:517-524` (the bimodal Filters
 * button), `:526-534` (the bimodal contained Add), `:561-563` (the
 * disabled-when-clean Clear), `:597-602` (two `Link component="button"`
 * pseudo-links — unreachable as buttons, which is why `LinkAction` exists),
 * `:749-751` (the `className="rowActions"` IconButton) and `:788-793` (the
 * dialog footer pair with its busy label); `components/holdingCards.tsx:311`
 * (`EmptyLanding`'s `size="large"` CTA, a fourth size this kit does not have);
 * `views/families/PersonDialog.tsx:360` (a `Link component="label"` file
 * picker, keyboard-unreachable because MUI `Link` is not a `ButtonBase` —
 * `fileInput` is the fix); and `theme/index.tsx:126-146`, whose `tonal` variant
 * this maps `secondary` onto.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ChangeEvent, MouseEvent, ReactNode } from 'react';
import NextLink from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import type { SxProps, Theme } from '@mui/material/styles';

import type { ActionRegionApi, ActionRole, ActionSize, ActionSpec } from './types';
import { GAP, TOUCH, focusRingSx } from './tokens';

const NOOP = () => {};

/**
 * `useLayoutEffect` warns on the server, and every screen in this app is
 * server-rendered before it hydrates. In the browser — the only place a claim
 * or a width measurement can mean anything — this IS `useLayoutEffect`, so the
 * demotion lands before paint rather than as a visible flicker.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/* ── Role spelling ───────────────────────────────────────────────────── */

interface ActionSpelling {
  variant: 'contained' | 'tonal' | 'outlined' | 'text';
  color: 'primary' | 'inherit' | 'error';
}

/**
 * The whole mapping, in one place, so a screen can never re-decide it. The
 * `tonal` variant is the theme's (`theme/index.tsx:129-145`) — primary
 * container fill with 16%/24% state layers — not a hand-mixed alpha.
 */
const SPELLING: Record<ActionRole, ActionSpelling> = {
  primary: { variant: 'contained', color: 'primary' },
  secondary: { variant: 'tonal', color: 'primary' },
  tertiary: { variant: 'outlined', color: 'inherit' },
  quiet: { variant: 'text', color: 'inherit' },
  destructive: { variant: 'text', color: 'error' },
};

/**
 * A compact control keeps its 32px M3 body; this band restores the 44px target
 * around it. It is invisible, centred on the control and full-width, so the
 * gate passes without the button growing.
 */
const COMPACT_HIT_BOX = {
  content: '""',
  position: 'absolute',
  inset: '50% 0 0 0',
  transform: 'translateY(-50%)',
  height: TOUCH,
} as const;

/**
 * `destructive` keeps its contract-locked `text` + `error` spelling; only the
 * ink is scheme-aware. `error.main` is legible as a fill but not as text on a
 * light ground — 3.17:1 on `background.paper` and 2.78:1 on the
 * `primary.container` the SelectionBar puts under it, both below AA — so the
 * light scheme uses `error.dark` (6.56:1 and 5.74:1). Dark and highContrast
 * keep `error.main`, which already clears AA there (4.53:1 on paper, 5.41:1 on
 * the page ground, 8.02:1 in highContrast), so neither is touched.
 */
function destructiveInkSx(t: Theme) {
  return {
    color: (t.vars ?? t).palette.error.dark,
    ...t.applyStyles('dark', { color: (t.vars ?? t).palette.error.main }),
    ...t.applyStyles('highContrast', { color: (t.vars ?? t).palette.error.main }),
  };
}

/**
 * The `aria-describedby` target for a disabled control's reason: off-screen for
 * sighted users, in the accessibility tree for everyone else.
 */
const srOnlySx: SxProps<Theme> = {
  border: 0,
  margin: -1,
  padding: 0,
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  clip: 'rect(0 0 0 0)',
};

/* ── The on-dark (hero) context ──────────────────────────────────────── */

/**
 * `HeroSection tone="brand"` publishes `true` here and every `Action` beneath
 * it switches to its on-dark spelling. The context is declared in THIS file and
 * imported by `Section.tsx`, not the other way round: the kit's build order
 * puts `Action` at 4 and `Section` at 5, so `Action` may not import `Section`,
 * and the switch has to live on the side that consumes it.
 *
 * It is deliberately an explicit, exported context rather than a descendant CSS
 * selector on the hero. A button should be able to SAY why it is white, and a
 * selector repaints whatever it happens to contain — including a menu that was
 * portalled out of the hero entirely.
 */
export const HeroContext = createContext(false);

/** `false` outside a brand hero. Re-exported through the kit barrel. */
export function useHeroContext(): boolean {
  return useContext(HeroContext);
}

/**
 * The hero ink at a percentage, as a mix rather than a second colour, so a wash
 * tracks `common.white` instead of being a literal rgba the schemes cannot move.
 */
const onDarkMix = (channel: string, pct: number) =>
  `color-mix(in srgb, ${channel} ${pct}%, transparent)`;

/**
 * The on-dark spellings. MUI's own role colours are all resolved against the
 * page ground rather than against the hero's gradient, so on a brand hero the
 * spelling is stated here instead of being switched through `color`.
 *
 * `destructive` has no on-dark spelling of its own — `error.main` text cannot
 * hold AA against this gradient in all three schemes — so it falls through to
 * the quiet spelling and `Action` says so in dev.
 */
function onDarkSx(role: ActionRole, t: Theme) {
  const p = (t.vars ?? t).palette;
  const white = p.common.white;
  if (role === 'primary') {
    return {
      bgcolor: white,
      color: p.primary.darker,
      '&:hover': { bgcolor: onDarkMix(white, 88) },
    };
  }
  if (role === 'secondary') {
    return {
      bgcolor: onDarkMix(white, 16),
      color: white,
      '&:hover': { bgcolor: onDarkMix(white, 24) },
    };
  }
  return {
    color: white,
    borderColor: onDarkMix(white, 40),
    '&:hover': {
      bgcolor: onDarkMix(white, 8),
      borderColor: onDarkMix(white, 64),
    },
  };
}

/* ── The claim registry ──────────────────────────────────────────────── */

const ActionRegionContext = createContext<ActionRegionApi | null>(null);

/** Null outside any region. Used by `Action` and by `ListToolbar`'s dev check. */
export function useActionRegion(): ActionRegionApi | null {
  return useContext(ActionRegionContext);
}

/**
 * Builds one region's registry. The holder is an object identity rather than
 * the label string, so two buttons that happen to share a label cannot release
 * each other's claim.
 *
 * `root` is the whole of the settled rule in one line: a root region resets the
 * count to 0 wherever it is mounted, so it is entitled to its one filled button
 * no matter what encloses it. Every other region adds one to its parent, and
 * `depth > 0` is what `Action` reads to demote.
 */
function useRegionApi(name: string, root: boolean): ActionRegionApi {
  const parent = useContext(ActionRegionContext);
  const depth = root || parent === null ? 0 : parent.depth + 1;
  const holderRef = useRef<{ label: string } | null>(null);
  const reportedRef = useRef(false);

  const claimPrimary = useCallback(
    (label: string) => {
      const held = holderRef.current;
      if (held === null) {
        const claim = { label };
        holderRef.current = claim;
        return {
          granted: true,
          release: () => {
            // Guarded: a remount must not clear a claim someone else now holds.
            if (holderRef.current === claim) holderRef.current = null;
          },
        };
      }
      if (process.env.NODE_ENV !== 'production' && !reportedRef.current) {
        reportedRef.current = true;
        console.error(
          `Two filled buttons in region "${name}": "${held.label}" and "${label}"`,
        );
      }
      return { granted: false, release: NOOP };
    },
    [name],
  );

  return useMemo(() => ({ name, depth, claimPrimary }), [name, depth, claimPrimary]);
}

type ActionRowJustify = 'start' | 'end' | 'between';

const JUSTIFY: Record<ActionRowJustify, string> = {
  start: 'flex-start',
  end: 'flex-end',
  between: 'space-between',
};

/**
 * The action cluster. `tokens.actionClusterSx` says the same four things, but
 * it is typed `SxProps<Theme>` — a union that includes the function and array
 * forms — so it can be passed whole and never composed with an override. The
 * gap is still the shared 8px control token.
 */
function clusterSx(justify: ActionRowJustify): SxProps<Theme> {
  return {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: GAP.control,
    justifyContent: JUSTIFY[justify],
  };
}

export interface ActionRegionProps {
  /** Names the region in the dev error, e.g. "Properties toolbar". */
  name: string;
  children: ReactNode;
  /** Render as a flex row with the standard 8px cluster gap. Default false (no DOM). */
  row?: boolean;
  /**
   * Declare this region a ROOT: it starts a fresh count and keeps its one
   * filled button wherever it is mounted. Default FALSE — the region inherits,
   * and its `role="primary"` demotes to tonal whenever another region encloses
   * it.
   *
   * Pass it only for a surface whose actions are complete in themselves and are
   * counted against nothing outside it: an overlay (`FormDialog`,
   * `ConfirmDialog`) or a form footer (`FormActions`). Do NOT pass it for
   * structure — a `Section`, a nested detail pane, an expanded row — because
   * inheriting is exactly what stops those from putting a second filled button
   * beside their host's.
   */
  root?: boolean;
}

/**
 * Declares an action region and registers its ONE filled button.
 *
 * An inherited region (the default) counts inside whatever encloses it, so a
 * detail pane or an expanded row demotes its primary rather than competing with
 * the page's — that is the GroupDetail and deed-expander case. A region
 * declared `root` starts the count over and keeps its filled button at any
 * depth — that is the dialog and form-footer case.
 */
export function ActionRegion({ name, children, row = false, root = false }: ActionRegionProps) {
  const api = useRegionApi(name, root);
  return (
    <ActionRegionContext.Provider value={api}>
      {row ? <Box sx={clusterSx('start')}>{children}</Box> : children}
    </ActionRegionContext.Provider>
  );
}

export interface ActionRowProps {
  name: string;
  children: ReactNode;
  justify?: ActionRowJustify;
  /** Same meaning as `ActionRegionProps.root`, and the same default (false). */
  root?: boolean;
}

/** Sugar for toolbars and dialog footers: `<ActionRegion row>` with an alignment. */
export function ActionRow({ name, children, justify = 'start', root = false }: ActionRowProps) {
  const api = useRegionApi(name, root);
  return (
    <ActionRegionContext.Provider value={api}>
      <Box sx={clusterSx(justify)}>{children}</Box>
    </ActionRegionContext.Provider>
  );
}

/* ── Action ──────────────────────────────────────────────────────────── */

export interface ActionProps extends Omit<ActionSpec, 'key'> {
  /** Default 'tertiary'. See types.ts for the role -> variant/color mapping. */
  role?: ActionRole;
  /** 'default' 40px visual / 48 touch; 'compact' 32 visual / 44 touch. */
  size?: ActionSize;
  /**
   * Force primary -> secondary. The empty-state rule, expressed once: while a
   * list is empty the ZeroState owns the one filled button and the toolbar's
   * create action goes tonal.
   */
  demote?: boolean;
  fullWidth?: boolean;
  /** Renders a managed hidden <input type="file"> and makes the button its label. */
  fileInput?: { accept?: string; multiple?: boolean; onFiles: (files: File[]) => void };
  /**
   * Disclosure and toggle state, forwarded verbatim to the underlying Button.
   * A trigger that opens a panel or a menu has to say so, and without these a
   * call site had to spell its own `<Button>` to do it — which also took it out
   * of `ActionRegion`'s claim registry, the one thing that stops two filled
   * buttons sharing a toolbar. `role` still owns variant/color; these are
   * state, not spelling.
   */
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
  'aria-haspopup'?: 'menu' | 'dialog' | 'true';
  'aria-pressed'?: boolean;
  /** Never accepted: an Action's content is its `label`. */
  children?: never;
}

export function Action({
  label,
  icon,
  onClick,
  role = 'tertiary',
  size = 'default',
  disabled,
  disabledReason,
  busy,
  busyLabel,
  href,
  ariaLabel,
  demote,
  fullWidth,
  fileInput,
  'aria-expanded': ariaExpanded,
  'aria-controls': ariaControls,
  'aria-haspopup': ariaHasPopup,
  'aria-pressed': ariaPressed,
}: ActionProps) {
  const region = useContext(ActionRegionContext);
  const onDark = useHeroContext();
  const nodeRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** The width the button had while it still showed its resting label. */
  const restingWidthRef = useRef<number | undefined>(undefined);

  const wantsPrimary = role === 'primary' && demote !== true;
  /**
   * `depth > 0` means this region INHERITED and something above it is already
   * counting, so the primary demotes by construction and never competes. A
   * region declared `root` — a dialog, a form footer — is 0 wherever it sits,
   * which is how it keeps its filled button at any nesting.
   */
  const nested = region !== null && region.depth > 0;
  const eligible = wantsPrimary && !nested && region !== null;
  const [granted, setGranted] = useState(true);

  useIsomorphicLayoutEffect(() => {
    if (!eligible || region === null) return;
    const claim = region.claimPrimary(label);
    setGranted(claim.granted);
    return () => {
      claim.release();
      setGranted(true);
    };
  }, [eligible, region, label]);

  // Measured on every commit that is not busy, so the busy render below can
  // pin the width the resting label had and the row does not reflow mid-save.
  useIsomorphicLayoutEffect(() => {
    const node = nodeRef.current;
    if (!busy && node) restingWidthRef.current = node.offsetWidth;
  });

  const setNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      // A control that explains itself is `aria-disabled`, not `disabled` (see
      // the reason branch below), so it still receives clicks — and as a
      // file-input label it would still forward activation to the input.
      // Refusing here is what actually makes it inert.
      if (disabled === true || busy === true) {
        event.preventDefault();
        return;
      }
      // Re-picking the same file fires no `change` unless the value is blanked
      // first, and the label forwards activation to the input only after this
      // handler has run.
      if (fileInput && inputRef.current) inputRef.current.value = '';
      onClick();
    },
    [busy, disabled, fileInput, onClick],
  );

  const handleFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length > 0) fileInput?.onFiles(files);
    },
    [fileInput],
  );

  const effectiveRole: ActionRole =
    role !== 'primary'
      ? role
      : wantsPrimary && !nested && (region === null || granted)
        ? 'primary'
        : 'secondary';
  const spelling = SPELLING[effectiveRole];
  const isDisabled = disabled === true || busy === true;
  const restingWidth = restingWidthRef.current;
  const reason = disabledReason ?? '';
  /** Disabled AND able to say why: the soft-disabled, still-focusable spelling. */
  const explained = disabled === true && reason !== '';
  const reasonId = useId();

  // Said out loud rather than silently absorbed: on the hero a destructive verb
  // renders as the quiet on-dark spelling, so the red that carries the warning
  // is gone. The verb belongs behind a ConfirmDialog trigger instead.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && onDark && effectiveRole === 'destructive') {
      console.error(
        `Destructive action "${label}" is on a brand hero, which has no on-dark red: it renders quiet. Put the destructive verb behind a ConfirmDialog trigger, not on the hero.`,
      );
    }
  }, [effectiveRole, label, onDark]);

  const rootSx: SxProps<Theme> = (t) => ({
    position: 'relative',
    ...(size === 'compact' ? { '&::after': COMPACT_HIT_BOX } : null),
    ...(busy && restingWidth ? { minWidth: restingWidth } : null),
    // On a brand hero the on-dark spelling owns every role, destructive
    // included — its scheme-aware red is legible on the page ground, not on
    // the gradient.
    ...(effectiveRole === 'destructive' && !onDark ? destructiveInkSx(t) : null),
    ...(onDark ? onDarkSx(effectiveRole, t) : null),
    ...(explained ? { opacity: t.palette.action.disabledOpacity } : null),
    '&:focus-visible': { ...focusRingSx },
  });

  const shared = {
    ref: setNode,
    variant: spelling.variant,
    color: spelling.color,
    size: size === 'compact' ? ('small' as const) : ('medium' as const),
    startIcon: icon,
    fullWidth,
    disabled: explained ? undefined : isDisabled,
    onClick: handleClick,
    sx: rootSx,
    'aria-label': ariaLabel,
    'aria-busy': busy === true ? true : undefined,
    'aria-disabled': explained ? true : undefined,
    'aria-describedby': explained ? reasonId : undefined,
    'aria-expanded': ariaExpanded,
    'aria-controls': ariaControls,
    'aria-haspopup': ariaHasPopup,
    'aria-pressed': ariaPressed,
  };

  const text = busy ? (busyLabel ?? 'Working…') : label;

  let button;
  if (fileInput) {
    // MUI Button is a ButtonBase, so as a <label> it still gets role="button"
    // and a tab stop — which a `Link component="label"` never did.
    button = (
      <Button {...shared} component="label">
        {text}
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={fileInput.accept}
          multiple={fileInput.multiple}
          onChange={handleFiles}
          // The label forwards the click to the input; without this the
          // input's own click bubbles back and fires `onClick` a second time.
          onClick={(event) => event.stopPropagation()}
        />
      </Button>
    );
  } else if (href) {
    button = (
      <Button {...shared} component={NextLink} href={href}>
        {text}
      </Button>
    );
  } else {
    button = <Button {...shared}>{text}</Button>;
  }

  // Busy has its own label and is not an explanation, so only a genuinely
  // disabled control gets the reason.
  if (explained) {
    // A disabled MUI button fires no pointer events, which is why this used to
    // wrap it in a focusable span. That span was `role="generic"`, and ARIA
    // forbids naming a generic — so MUI's tooltip-as-`aria-label` was dropped
    // and the tab stop announced nothing at all. The control now stays in the
    // tab order as ITSELF: `aria-disabled` instead of `disabled` (so it keeps
    // its pointer and focus events), clicks refused in `handleClick`, dimmed
    // to the theme's disabled opacity, and the reason carried by a
    // visually-hidden `aria-describedby` target that is always in the tree,
    // open tooltip or not. `describeChild` stops the tooltip overwriting the
    // button's own name with its title.
    return (
      <>
        <Tooltip title={reason} describeChild>
          {button}
        </Tooltip>
        <Box component="span" id={reasonId} sx={srOnlySx}>
          {reason}
        </Box>
      </>
    );
  }

  return button;
}

/* ── IconAction ──────────────────────────────────────────────────────── */

export interface IconActionProps {
  /** REQUIRED. Becomes both the aria-label and the tooltip title. */
  label: string;
  icon: ReactNode;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Adds className="rowActions": reveal on row hover/focus, always on for touch. */
  revealOnRowHover?: boolean;
  edge?: 'start' | 'end';
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
  'aria-haspopup'?: 'menu' | 'dialog' | 'true';
  /** Toggle state, for an icon button that is pressed rather than pressed-once. */
  'aria-pressed'?: boolean;
}

/**
 * An icon button that cannot ship nameless: `label` is required, and it is both
 * the accessible name and the tooltip, so the two can never disagree. When a
 * `disabledReason` is showing, the tooltip carries the reason and `label` is
 * still the name — the reason is a description, never a rename. The 44px floor
 * comes from the theme (`theme/index.tsx:185-192`), as does the `rowActions`
 * hover/focus reveal, which is always-on under `hover: none`.
 */
export function IconAction({
  label,
  icon,
  onClick,
  danger,
  disabled,
  disabledReason,
  revealOnRowHover,
  edge,
  'aria-expanded': ariaExpanded,
  'aria-controls': ariaControls,
  'aria-haspopup': ariaHasPopup,
  'aria-pressed': ariaPressed,
}: IconActionProps) {
  const reason = disabledReason ?? '';
  const explained = disabled === true && reason !== '';
  const reasonId = useId();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      // `aria-disabled` keeps the click listener live, so the refusal is here.
      if (disabled === true) {
        event.preventDefault();
        return;
      }
      onClick(event);
    },
    [disabled, onClick],
  );

  const button = (
    <IconButton
      className={revealOnRowHover ? 'rowActions' : undefined}
      size="small"
      edge={edge ?? false}
      color={danger ? 'error' : 'default'}
      disabled={explained ? undefined : disabled}
      aria-disabled={explained ? true : undefined}
      onClick={handleClick}
      aria-label={label}
      aria-describedby={explained ? reasonId : undefined}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-haspopup={ariaHasPopup}
      aria-pressed={ariaPressed}
      sx={(t) => ({
        '&:focus-visible': { ...focusRingSx },
        ...(explained ? { opacity: t.palette.action.disabledOpacity } : null),
      })}
    >
      {icon}
    </IconButton>
  );

  // Same spelling as `Action`: the control keeps its own tab stop and its own
  // name, is soft-disabled rather than `disabled`, and the reason reaches AT
  // through a visually-hidden `aria-describedby` target. `describeChild` is
  // what stops the tooltip replacing `label` as the accessible name.
  if (explained) {
    return (
      <>
        <Tooltip title={reason} describeChild>
          {button}
        </Tooltip>
        <Box component="span" id={reasonId} sx={srOnlySx}>
          {reason}
        </Box>
      </>
    );
  }

  // Disabled with nothing to explain keeps MUI's native `disabled`, and a
  // natively disabled button fires no events for a Tooltip to listen to — so
  // it renders bare rather than behind a tooltip that could never open. The
  // name is on the button either way.
  if (disabled === true) return button;

  return <Tooltip title={label}>{button}</Tooltip>;
}

/* ── LinkAction ──────────────────────────────────────────────────────── */

export interface LinkActionProps {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Required when the visible label is a glyph. */
  ariaLabel?: string;
  trailingChevron?: boolean;
}

/**
 * An anchor when `href` is set, a quiet compact button when `onClick` is.
 * Exists so `<Link component="button">` never appears in a view again — that
 * spelling looks like a link, is announced as a link, and navigates nowhere.
 * The chevron is decorative in both branches: it never reaches the accessible
 * name, so "Edit ›" is announced as "Edit".
 */
export function LinkAction({ label, href, onClick, ariaLabel, trailingChevron }: LinkActionProps) {
  if (href) {
    return (
      <Link
        component={NextLink}
        href={href}
        variant="body2"
        underline="hover"
        aria-label={ariaLabel}
        sx={{ '&:focus-visible': { ...focusRingSx } }}
      >
        {label}
        {trailingChevron && (
          <Box component="span" aria-hidden sx={{ ml: GAP.tight }}>
            ›
          </Box>
        )}
      </Link>
    );
  }

  return (
    <Action
      role="quiet"
      size="compact"
      label={trailingChevron ? `${label} ›` : label}
      ariaLabel={ariaLabel ?? (trailingChevron ? label : undefined)}
      onClick={onClick ?? NOOP}
    />
  );
}
