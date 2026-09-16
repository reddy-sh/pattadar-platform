'use client';

/**
 * The summary row that sits under a page header: four figures, one surface.
 *
 * The shape is already right in `components/holdingCards.tsx:249-284` — a
 * single soft container with hairline dividers, an overline label and a
 * tabular-numeral figure — and it is faithfully reproduced here. What it
 * carried with it were three quiet lies. `borderRadius: 4` was annotated
 * "16px — card shape" and painted 32, because `sx` multiplies a number by
 * `theme.shape.borderRadius`; `RADIUS.card` is the literal string the comment
 * always meant. The tint was `rgba(25, 118, 210, 0.05)` with an
 * `rgba(144, 202, 249, 0.08)` dark branch — two hand-mixed literals, and the
 * highContrast scheme reached neither, so it got the light-mode wash and no
 * edge. The two VALUES, though, are exactly `primary.main` in their own scheme
 * (light `brand[600]` #1976D2, dark `brand[200]` #90CAF9), so `tintSx` mixes
 * the token at the same 5% / 8% and lands on the same colour, with the
 * highContrast branch the original never had. A full-strength
 * `tonalSx('brand')` fill was tried here and reverted: it repaints the ground
 * AND forces `primary.onContainer` ink, which moves the reference row and
 * drops its 12px `text.secondary` labels to 4.28:1.
 * And the loading state lived in `components/Skeletons.tsx:11-22` as a
 * `Card`, so the surface itself changed colour at the moment the data landed —
 * the placeholders here are drawn inside this component's own tinted `Box`, and
 * the only thing that arrives is the numbers.
 *
 * `scope` is required and has no default, which is the one deliberately
 * uncomfortable thing in this file. Land & Properties computes its tiles from
 * the FULL dataset (`views/LandPropertiesPage.tsx:232-251`) while the list
 * below shows the filtered rows, so the tiles hold still when a filter moves —
 * correct, and invisible. A reader who filters to one village and watches
 * "Parcels 30" refuse to budge is owed a sentence saying which population the
 * figure counts, and the next screen to grow a stat row must decide the
 * question rather than inherit an answer by accident in either direction.
 *
 * A tile is a real button when it is given something to do. `onClick` and
 * `href` produce a `ButtonBase`, a 44px floor, a focus ring and an accessible
 * name that reads "Needs attention: 3" rather than the bare label — a figure
 * that navigates must be reachable by keyboard, which is exactly what
 * Dashboard's `Box component="span" onClick` is not. The privacy mask is the
 * same argument: `masked` hides the money behind "••••" and puts the reveal on
 * a labelled `IconAction` instead of Dashboard's `Chip onClick`, which looks
 * like a filter and is announced as nothing at all.
 *
 * Extracted from `components/holdingCards.tsx:249-267` (`StatRow`) and
 * `:270-284` (`StatCard`), its consumer at
 * `views/LandPropertiesPage.tsx:454-483`, the masked hero figures at
 * `views/DashboardPage.tsx:325-355`, and `components/Skeletons.tsx:11-22`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { createContext, isValidElement, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import NextLink from 'next/link';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import type { SxProps, Theme } from '@mui/material/styles';

import { IconAction } from './Action';
import { StatusChip } from './StatusChip';
import { GAP, PAD, RADIUS, TOUCH, focusRingSx, stateLayer } from './tokens';
import type { StatEmphasis, StatItem, StatScope } from './types';

/* ── Local metrics ───────────────────────────────────────────────────────
 * Numbers that describe this row and nothing else. The 24px figure is pinned
 * in pixels rather than taken from the type scale because `holdingCards.tsx:278`
 * is pinned, and the four Land & Properties tiles must not shift by so much as
 * a pixel when they move onto this component. */

const FIGURE_PX: Record<StatEmphasis, number> = { md: 24, lg: 32 };

/**
 * Placeholder heights, matched to the LOADED line boxes rather than to each
 * other — a placeholder that agrees with another placeholder and not with the
 * text it stands in for is how a row ends up 3px shorter while it loads and
 * shoves the whole page down when the figures arrive. The label is the
 * overline's 12px at lineHeight 1.5; the figure is `FIGURE_PX × 1.3`.
 * `KitSkeletons.StatTilesSkeleton` still draws the old 16 / 30 pair.
 */
const LABEL_SKELETON_PX = 18;
const FIGURE_SKELETON_PX: Record<StatEmphasis, number> = { md: 31, lg: 42 };

/** Wide enough for "Total Extent" plus a five-figure number before it wraps. */
const TILE_MIN_WIDTH = 140;

/**
 * The tile's vertical inset — 14px, `holdingCards.tsx:272` verbatim. Off the
 * 4px grid on purpose, and one of the three documented exceptions to it: the
 * four Properties tiles must not change height when they move onto this
 * component. Same argument, same number, as `PAD.quiet`.
 */
const TILE_PAD_Y = 1.75;

const MASK = '••••';

/**
 * Said once per row, never once per tile. Which population a figure counts is a
 * property of the query, and repeating it four times would read as four claims.
 */
const SCOPE_NOTE: Record<StatScope, string> = {
  dataset: 'Across all records',
  filtered: 'Matching the current filters',
};

/**
 * Hover is not an affordance a screen reader has, and neither is a row of
 * bullets. The mask therefore ships the word as well as the glyphs.
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

/* ── Row context ─────────────────────────────────────────────────────────── */

interface StatRowApi {
  revealed: boolean;
  /** Absent when the row is controlled with no `onRevealChange` to call. */
  toggle?: () => void;
  plain: boolean;
}

/**
 * A tile placed alone by Dashboard or the calculator is the same component as a
 * tile inside a row, so the two things the row decides — the shared reveal
 * state and whether the container is painted — travel by context rather than by
 * props. `StatTile`'s published API stays exactly `StatItem`, and no caller can
 * set a row-level concern on one tile and have it disagree with its neighbours.
 */
const StatRowContext = createContext<StatRowApi | null>(null);

/* ── Accessible names ────────────────────────────────────────────────────── */

/**
 * A figure may be a node — "1,234 <span>sq.yd</span>" — and a clickable tile
 * still owes the reader one sentence. Walking the node is what keeps the
 * announced name in step with the painted one; anything unrenderable
 * contributes nothing rather than "[object Object]".
 */
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'bigint') return String(node);
  if (Array.isArray(node)) return node.map((child: ReactNode) => nodeText(child)).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

/* ── Tile ────────────────────────────────────────────────────────────────── */

export type StatTileProps = StatItem & { emphasis?: StatEmphasis };

/**
 * One tile: overline label, tabular figure, optional delta chip and hint.
 * Exported so a screen with no row — Dashboard's hero, the calculator's result
 * panel — can place a single figure without rebuilding the type scale.
 */
export function StatTile({
  label,
  value,
  delta,
  hint,
  onClick,
  href,
  masked,
  emphasis = 'md',
}: StatTileProps) {
  const row = useContext(StatRowContext);
  // A tile standing outside a row still owns a working reveal: a control that
  // cannot be operated is worse than no control at all.
  const [selfRevealed, setSelfRevealed] = useState(false);
  const toggleSelf = useCallback(() => setSelfRevealed((prev) => !prev), []);

  const revealed = row ? row.revealed : selfRevealed;
  const toggle = row ? row.toggle : toggleSelf;
  const plain = row?.plain === true;

  const hidden = masked === true && !revealed;
  const interactive = onClick !== undefined || href !== undefined;
  // Nesting the reveal inside a clickable tile would nest a button in a button,
  // so it moves out beside the tile in that one combination.
  const inlineToggle = masked === true && toggle !== undefined && !interactive;
  const asideToggle = masked === true && toggle !== undefined && interactive;

  const spoken = hidden ? 'hidden' : nodeText(value);

  const rootSx: SxProps<Theme> = (t) => ({
    px: plain ? 0 : PAD.card,
    py: plain ? 0 : TILE_PAD_Y,
    minWidth: 0,
    ...(interactive
      ? {
          display: 'block',
          textAlign: 'left',
          width: '100%',
          minHeight: TOUCH,
          borderRadius: RADIUS.card,
          transition: t.transitions.create('background-color', {
            duration: t.transitions.duration.shorter,
            easing: t.transitions.easing.easeInOut,
          }),
          '&:hover': { backgroundColor: stateLayer('primary', 8)(t) },
          '&:focus-visible': { ...focusRingSx },
        }
      : null),
  });

  const figure = (
    <Typography
      className="tnum"
      component="div"
      sx={{
        fontSize: FIGURE_PX[emphasis],
        fontWeight: 700,
        lineHeight: 1.3,
        overflowWrap: 'anywhere',
      }}
    >
      {hidden ? (
        <>
          <Box component="span" aria-hidden>
            {MASK}
          </Box>
          <Box component="span" sx={srOnlySx}>
            Hidden
          </Box>
        </>
      ) : (
        value
      )}
    </Typography>
  );

  const revealControl =
    toggle === undefined ? null : (
      <IconAction
        label={revealed ? 'Hide value' : 'Show value'}
        icon={
          revealed ? (
            <VisibilityOffOutlinedIcon fontSize="small" />
          ) : (
            <VisibilityOutlinedIcon fontSize="small" />
          )
        }
        onClick={toggle}
      />
    );

  const content = (
    <>
      {/* `nowrap` is the reference's (`holdingCards.tsx:274`) and keeps a
          two-word label on one line; the ellipsis pair is what stops a label
          too long for its 140px track — "Needs Attention" in Telugu — from
          painting outside the tile and taking the page's horizontal scrollbar
          with it at 400px. Nothing moves while the label fits. */}
      <Typography
        variant="overline"
        color="text.secondary"
        component="div"
        sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {label}
      </Typography>
      {/* The bare figure keeps the original single-node markup; the flex row
          appears only when something has to sit beside it. */}
      {delta || inlineToggle ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: GAP.control,
            minWidth: 0,
          }}
        >
          {figure}
          {delta && <StatusChip size="small" label={delta.label} tone={delta.tone} />}
          {inlineToggle && revealControl}
        </Box>
      ) : (
        figure
      )}
      {hint && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: GAP.tight }}>
          {hint}
        </Typography>
      )}
    </>
  );

  if (!interactive) return <Box sx={rootSx}>{content}</Box>;

  const ariaLabel = spoken ? `${label}: ${spoken}` : label;

  const tile = href ? (
    <ButtonBase component={NextLink} href={href} onClick={onClick} aria-label={ariaLabel} sx={rootSx}>
      {content}
    </ButtonBase>
  ) : (
    <ButtonBase onClick={onClick} aria-label={ariaLabel} sx={rootSx}>
      {content}
    </ButtonBase>
  );

  if (!asideToggle) return tile;

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>{tile}</Box>
      <Box sx={{ pr: GAP.control, pt: GAP.cluster }}>{revealControl}</Box>
    </Box>
  );
}

/* ── Row ─────────────────────────────────────────────────────────────────── */

/**
 * The row's wash. `holdingCards.tsx:257-259` hard-codes
 * `rgba(25, 118, 210, 0.05)` light and `rgba(144, 202, 249, 0.08)` dark; both
 * are `primary.main` in their own scheme, so mixing the token at the same two
 * percentages reproduces the reference row to the pixel without a literal and
 * without a second definition per scheme.
 *
 * It stays a WASH, not the `primary.container` fill `tonalSx('brand')` paints.
 * This surface carries the page's own ink — `text.primary` figures,
 * `text.secondary` labels — and only a ground this light keeps a 12px overline
 * above 4.5:1 (4.59:1 light, 5.32:1 dark). A container fill would also force
 * `primary.onContainer` onto the figures, which is a visible change to the one
 * screen this component exists to reproduce.
 *
 * highContrast has no usable 5% wash — its ground is white and its palette is
 * flat by design — so it takes the opaque container and the edge that scheme
 * draws everywhere else, which is the branch the original literals never had.
 */
const tintSx = (t: Theme) => ({
  bgcolor: `color-mix(in srgb, ${(t.vars ?? t).palette.primary.main} 5%, transparent)`,
  ...t.applyStyles('dark', {
    bgcolor: `color-mix(in srgb, ${(t.vars ?? t).palette.primary.main} 8%, transparent)`,
  }),
  ...t.applyStyles('highContrast', {
    bgcolor: 'primary.container',
    border: '1px solid',
    borderColor: 'divider',
  }),
});

/**
 * The container, in one place so the tinted surface, the dividers and the wrap
 * behaviour cannot diverge between the loaded row and its placeholders.
 */
function rowSx(plain: boolean, columns?: number): SxProps<Theme> {
  // `1 1 0%` is `flex: 1`: tiles share the row evenly. An explicit column count
  // becomes the basis instead, and `minWidth` still wins on a narrow screen —
  // which is what makes four tiles become two at 400px rather than overflow.
  const basis = columns !== undefined && columns > 0 ? `${100 / columns}%` : '0%';
  const shape = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    ...(plain
      ? { gap: GAP.page }
      : {
          borderRadius: RADIUS.card,
          '& > * + *': { borderLeft: '1px solid', borderColor: 'divider' },
        }),
    '& > *': { flex: `1 1 ${basis}`, minWidth: TILE_MIN_WIDTH },
  };
  if (plain) return shape;

  return [shape, tintSx];
}

export interface StatTilesProps {
  items: StatItem[];
  /**
   * REQUIRED and load-bearing. 'dataset' = computed from the whole collection,
   * so tiles do NOT move when filters change (Properties' deliberate parity
   * behaviour); 'filtered' = computed from the visible rows. Rendered as a hint
   * on the row so the reader is told which it is. The caption is suppressed in
   * variant='plain', which by definition describes no collection.
   */
  scope: StatScope;
  /** 'contained' (default) = one tinted container with hairline dividers. */
  variant?: 'contained' | 'plain';
  /** 'md' 24px figures (default) or 'lg' 32px for a hero row. */
  emphasis?: StatEmphasis;
  /** Renders the skeleton in the SAME surface as the loaded row. */
  loading?: boolean;
  /** Global reveal for tiles marked `masked`, plus the Show/Hide toggle. */
  revealed?: boolean;
  onRevealChange?: (revealed: boolean) => void;
  columns?: number;
}

export function StatTiles({
  items,
  scope,
  variant = 'contained',
  emphasis = 'md',
  loading,
  revealed,
  onRevealChange,
  columns,
}: StatTilesProps) {
  // Controlled when `revealed` is given — Dashboard persists the choice — and
  // self-managed otherwise, so a masked tile is never a one-way door.
  const [selfRevealed, setSelfRevealed] = useState(false);
  const controlled = revealed !== undefined;
  const isRevealed = controlled ? revealed : selfRevealed;

  const toggle = useCallback(() => {
    const next = !isRevealed;
    if (!controlled) setSelfRevealed(next);
    onRevealChange?.(next);
  }, [controlled, isRevealed, onRevealChange]);

  const plain = variant === 'plain';
  const count = items.length > 0 ? items.length : (columns ?? 4);

  return (
    <StatRowContext.Provider value={{ revealed: isRevealed, toggle, plain }}>
      {/* The block gap lives on the wrapper so the scope note stays attached to
          the row it describes rather than floating 16px away from it. */}
      <Box sx={{ mb: GAP.block }}>
        <Box sx={rowSx(plain, columns)} aria-busy={loading === true ? true : undefined}>
          {loading
            ? Array.from({ length: count }, (_, i) => (
                <Box
                  key={i}
                  sx={{ px: plain ? 0 : PAD.card, py: plain ? 0 : TILE_PAD_Y, minWidth: 0 }}
                >
                  <Skeleton width={80} height={LABEL_SKELETON_PX} />
                  <Skeleton width={110} height={FIGURE_SKELETON_PX[emphasis]} />
                </Box>
              ))
            : items.map(({ key, ...item }) => (
                <StatTile key={key} {...item} emphasis={emphasis} />
              ))}
        </Box>
        {/* A plain row is a figure panel, not a view of a collection — a
            calculator result or a single balance — so there is nothing for
            "Across all records" to be true about. `scope` stays required; only
            the sentence is withheld. */}
        {!plain && (
          <Typography
            variant="caption"
            color="text.secondary"
            component="p"
            sx={{ mt: GAP.tight, textAlign: 'right' }}
          >
            {SCOPE_NOTE[scope]}
          </Typography>
        )}
      </Box>
    </StatRowContext.Provider>
  );
}
