/**
 * The layout constants and `sx` atoms every kit primitive reuses.
 *
 * It exists for one reason above all others: `sx={{ borderRadius: 3 }}` does
 * NOT mean 3px, it means `3 × theme.shape.borderRadius`. That footgun has
 * already shipped twice — and now that `shape.borderRadius` is the spec's 12
 * (`theme/index.tsx:251`), both sites paint worse than when they were filed:
 * `components/tableSx.ts:35` asks for 12 and paints 36,
 * `components/holdingCards.tsx:257` annotates "16px" and paints 48 — so
 * every radius here is a literal px STRING, which MUI passes through
 * untouched. There is deliberately no `px()` helper to forget.
 *
 * The rest is the same argument applied to the values a component would
 * otherwise invent: a row height, a gap, a state-layer percentage, the card
 * grid, the toolbar row. Declared once, they are reviewable; scattered across
 * twenty files they are not. Colour never appears as a literal — it resolves
 * from the theme, through `(t.vars ?? t).palette…` when a real string is
 * needed (a `color-mix` operand) and through a palette path otherwise, so
 * light, dark and highContrast are all correct without a second definition.
 *
 * Extracted from `components/tableSx.ts:10-19` (`stickyHeadSx`, verbatim) and
 * `:26-38` (`selectionBarSx`, with its radius bug fixed);
 * `views/LandPropertiesPage.tsx:486` (toolbar row), `:492` (action cluster),
 * `:540` / `:570` (the quiet filter and chip surfaces), `:608` (the card
 * grid); `components/holdingCards.tsx:95-114` (`clickableCardSx`, with its
 * literal shadow, its hand-mixed border and its missing focus ring fixed) and
 * `:249-267` (the tinted stat container). `holdingCards.tsx:77-88`'s `pillSx`
 * is deliberately NOT ported — mixing against a literal white is exactly the
 * bug `tonalSx` exists to replace.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import type { SxProps, Theme } from '@mui/material/styles';

import type { StatusTone } from './types';

/* ── Scale ───────────────────────────────────────────────────────────── */

/**
 * Spec "Shape". LITERAL PX STRINGS — never numbers. `sx borderRadius: 1`
 * multiplies by theme.shape.borderRadius; a string is passed through untouched.
 */
export const RADIUS = {
  control: '12px',
  card: '16px',
  dialog: '20px',
  pill: '999px',
} as const;

/** Spec "Tables/lists": 52px rows. */
export const ROW_HEIGHT = 52;

/** Accessibility gate: 44x44 minimum. */
export const TOUCH = 44;

/**
 * M3 control heights. Consumed only by the ::after hit-box that grows a
 * compact control to `TOUCH` — never set as a height, because the theme
 * already pins Button and IconButton (`theme/index.tsx`).
 */
export const CONTROL_H = { default: 40, compact: 32 } as const;

/**
 * MUI spacing units (x8), not pixels — `gap` and `p` multiply by 8.
 * Spec "the 4px grid is law": 4 / 8 / 12 / 16 / 24 / 32.
 */
export const GAP = {
  /** 4px */
  tight: 0.5,
  /** 8px */
  control: 1,
  /** 12px */
  cluster: 1.5,
  /** 16px */
  block: 2,
  /** 24px */
  page: 3,
  /** 32px */
  section: 4,
} as const;

/** MUI spacing units. Spec "Card padding 20". */
export const PAD = {
  /** 20px */
  card: 2.5,
  /** 14px — the filter panel's tighter inset. LandPropertiesPage.tsx:540 verbatim; off-grid on purpose. */
  quiet: 1.75,
  /** 24px */
  dialog: 3,
} as const;

/** Standard form measure in px (spec, Forms/dialogs). */
export const MEASURE = { form: 560, wide: 720, workbench: 1040 } as const;

/* ── Colour atoms ────────────────────────────────────────────────────── */

/**
 * State layers: hover 8% / focus 12% / pressed 12% / selected 16% of the role
 * colour, mixed against transparent so the layer is correct on any surface
 * underneath it. Same mechanism as the `tonal` Button variant's 16%/24%.
 *
 * 5 is NOT a state layer. It is the reference stat row's resting wash —
 * `holdingCards.tsx:258-259`, `rgba(25, 118, 210, 0.05)` in light and
 * `rgba(144, 202, 249, 0.08)` in dark, which are `primary.main` at 5% and at
 * 8% in the two schemes — spelled from the theme instead of from two hex
 * literals. It is in the union so `StatTiles` can paint that wash without
 * re-inventing the mix: the reference row is a faint tint under
 * `text.secondary` labels, never a `primary.container` fill.
 */
export function stateLayer(
  role: 'primary' | 'secondary' | 'error',
  pct: 5 | 8 | 12 | 16 | 24,
): (theme: Theme) => string {
  return (theme) =>
    `color-mix(in srgb, ${(theme.vars ?? theme).palette[role].main} ${pct}%, transparent)`;
}

/**
 * Tonal fill for a tone, taken from the palette's `container` / `onContainer`
 * pair rather than a hand-mixed alpha. highContrast adds a currentColor edge,
 * because that scheme's containers are all white and a fill alone would be
 * invisible.
 */
export function tonalSx(tone: StatusTone): SxProps<Theme> {
  const role = tone === 'brand' ? 'primary' : tone;
  return (t) => ({
    ...(tone === 'neutral'
      ? { bgcolor: 'background.neutral', color: 'text.primary' }
      : { bgcolor: `${role}.container`, color: `${role}.onContainer` }),
    ...t.applyStyles('highContrast', { border: '2px solid', borderColor: 'currentColor' }),
  });
}

/* ── Surfaces ────────────────────────────────────────────────────────── */

/**
 * The resting card. Border + surface tint, never a shadow — elevation in this
 * spec means "this floats above the page", so a card that is not an overlay
 * must not borrow the signal.
 */
export const surfaceSx: SxProps<Theme> = {
  borderRadius: RADIUS.card,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  boxShadow: 'none',
};

/**
 * The quiet surface: filter panels and collapsed chip rows.
 * `LandPropertiesPage.tsx:540` verbatim — `background.default`, a hairline and
 * the control radius.
 *
 * The recession it is named for is real only in dark, where `background.default`
 * is grey[900] under `paper` grey[800]. Light and highContrast both ship
 * `paper` and `default` as `#FFFFFF` (`theme/palette.ts:174-175`, `:320-321`),
 * so in those two schemes the hairline and the smaller radius are the whole
 * distinction and the panel reads as chrome by shape rather than by tone.
 * Kept as the reference paints it: giving light a genuinely sunken ground is a
 * palette change (a recessed `background.default`, or a new `background.sunken`
 * role), not a change here. `background.neutral` is not the substitute — it is
 * grey[200], which would visibly darken the reference screen's filter panel.
 */
export const quietSurfaceSx: SxProps<Theme> = {
  borderRadius: RADIUS.control,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.default',
  p: PAD.quiet,
};

/**
 * The focus ring. Composed into a primitive's own `&:focus-visible` rather
 * than left to the global `.kit-focusable` class, so a control cannot ship
 * without one by forgetting to opt in. Secondary is the ring colour because
 * primary is the fill colour of the thing most often focused.
 *
 * `secondary.dark`, not `.main`. The `outlineOffset` means the ring paints on
 * whatever surface is BEHIND the control, and this kit puts focusable controls
 * on tonal fills — `selectionBarSx` and the stat row above all. Light
 * `secondary.main` is gold[600]: 3.25:1 on paper, but 2.85:1 on
 * `primary.container`, 3.00:1 on `background.neutral` and 2.55–2.78:1 on the
 * status containers — under the 3:1 non-text floor (SC 1.4.11) on every
 * surface the kit actually focuses a control over. `secondary.dark` resolves
 * to gold[700] in light (4.54:1 on paper, ≥3.57:1 on every container),
 * gold[500] in dark (≥4.12:1) and #4A3200 in highContrast (12:1), so one
 * palette path clears the floor in all three schemes.
 *
 * Documented deviation: the contract spells this `secondary.main`. That
 * spelling fails the contract's own accessibility floor, so the contract line
 * needs the amendment, not the ring.
 */
export const focusRingSx = {
  outline: '2px solid',
  outlineColor: 'secondary.dark',
  outlineOffset: '2px',
} as const satisfies SxProps<Theme>;

/**
 * The whole-card click target: hover lift, pressed layer, focus ring. Ported
 * from `holdingCards.tsx:95-114` with its three defects fixed — the literal
 * rgba shadow is now `customShadows.z4` (scheme-adaptive), the hand-mixed 45%
 * border is now the 24% pressed state layer, and the focus ring it never had
 * is present, which is what makes the card reachable by keyboard.
 *
 * It restates the resting surface rather than leaning on `surfaceSx` being
 * applied alongside it. Without that, a Card falls through to the donor
 * template's `MuiCard` root — `customShadows.card` at `shape.borderRadius * 2`
 * = 24px — which is the exact inverse of the spec's "borders and surface tint
 * for resting cards, shadows ONLY for overlays; radius 16 cards". The resting
 * `border` is also what the `:hover` `borderColor` below has to recolour: with
 * no border declared, that hover line paints nothing.
 */
export const clickableSurfaceSx: SxProps<Theme> = (t) => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  cursor: 'pointer',
  borderRadius: RADIUS.card,
  border: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  boxShadow: 'none',
  transition: t.transitions.create(
    ['transform', 'box-shadow', 'border-color', 'background-color'],
    { duration: t.transitions.duration.standard, easing: t.transitions.easing.easeInOut },
  ),
  '&:hover': {
    transform: 'translateY(-2px)',
    borderColor: stateLayer('primary', 24)(t),
    boxShadow: t.customShadows.z4,
  },
  '&:active': {
    transform: 'translateY(0)',
    boxShadow: 'none',
    backgroundColor: (t.vars ?? t).palette.action.selected,
  },
  '&:focus-visible': focusRingSx,
});

/* ── Table atoms ─────────────────────────────────────────────────────── */

/**
 * Container-scoped scrollport with a pinned header — put it on the
 * TableContainer of a long list. The bounded container is also what keeps a
 * wide table from ever overflowing the page horizontally, and the paper fill
 * on the pinned header is what stops rows showing through it.
 */
export const stickyHeadSx: SxProps<Theme> = {
  overflowX: 'auto',
  maxHeight: 'min(72vh, 680px)',
  '& thead th': {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    bgcolor: 'background.paper',
  },
};

/**
 * The M3 contextual toolbar that replaces a list's filter row while rows are
 * selected: "N selected" left, bulk actions right, Esc clears. Its radius was
 * `3` — 24px against a `// 12` comment — until it was lifted here.
 */
export const selectionBarSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: GAP.control,
  flexWrap: 'wrap',
  mb: GAP.cluster,
  px: GAP.block,
  py: GAP.control,
  minHeight: ROW_HEIGHT,
  borderRadius: RADIUS.control,
  bgcolor: 'primary.container',
  color: 'primary.onContainer',
};

/* ── Layout atoms ────────────────────────────────────────────────────── */

/**
 * THE card grid, declared once so the live grid and its loading skeleton can
 * never drift apart. Tracks are `minmax(0, 1fr)` rather than `1fr`: a single
 * unbroken survey number in one card would otherwise widen its column past
 * the viewport and take the page's horizontal scrollbar with it.
 */
export const cardGridSx: SxProps<Theme> = {
  display: 'grid',
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr)',
    sm: 'repeat(2, minmax(0, 1fr))',
    lg: 'repeat(3, minmax(0, 1fr))',
    xl: 'repeat(4, minmax(0, 1fr))',
  },
  gap: GAP.page,
};

/** THE toolbar row: filters/tabs left, actions right, wrapping at narrow widths. */
export const toolbarRowSx: SxProps<Theme> = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: GAP.cluster,
  flexWrap: 'wrap',
  mb: GAP.cluster,
};

/** THE right-hand action cluster — wraps rather than overflowing at 400px. */
export const actionClusterSx: SxProps<Theme> = {
  display: 'flex',
  gap: GAP.control,
  alignItems: 'center',
  flexWrap: 'wrap',
};
