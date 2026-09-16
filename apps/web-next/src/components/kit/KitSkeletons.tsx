'use client';

/**
 * The kit's loading placeholders. Every one is cut to the shape of the thing
 * it stands in for, because the cost of a skeleton is paid at the moment the
 * data lands: if the placeholder guessed wrong, the page rearranges itself in
 * front of the reader, and the rearrangement is more expensive than the wait
 * ever was.
 *
 * Three such rearrangements are closed here by construction. The card grid
 * skeleton stopped at three columns while the live grid goes to four, so a
 * fourth card slid in on every wide-screen load — both now read the one
 * `cardGridSx`, and the column count cannot drift again. The loading branch of
 * Land & Properties drew a header, a stat row and a grid and nothing else, so
 * the tabs, the search box, the view toggle, Filters, Export and Add all
 * appeared together a beat later; `ToolbarSkeleton` reserves that entire
 * control surface, which is the single biggest jump on the canonical screen.
 * And the stat row was a `Card` where the real row is a tinted `Box`, so the
 * surface itself changed colour on arrival — it is now the same tinted box,
 * loaded or not, down to the scope note under it.
 *
 * Nothing in this file spins. A spinner says "something is happening"; these
 * say "this is what is coming", which is the M3 rule and the reason
 * `CircularProgress` appears nowhere in the kit — including behind the lazy
 * Leaflet chunk, where `MapSkeleton` now holds the map's exact height and
 * radius so the map does not resize itself into place.
 *
 * `'use client'` is load-bearing: the tinted stat surface is a theme callback,
 * and a function `sx` cannot cross an RSC boundary.
 *
 * Extracted from `src/components/Skeletons.tsx` (`StatRowSkeleton`,
 * `TableSkeleton`, `CardGridSkeleton`, `HeaderSkeleton`, `HeroSkeleton`) and
 * from the consumer that exposed what they were missing,
 * `src/views/LandPropertiesPage.tsx:420-427`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';

import type { StatEmphasis, ViewMode } from './types';
import {
  actionClusterSx,
  cardGridSx,
  GAP,
  PAD,
  RADIUS,
  ROW_HEIGHT,
  surfaceSx,
  toolbarRowSx,
} from './tokens';

/* ── Local metrics ───────────────────────────────────────────────────────
 * Sizes that describe a placeholder and nothing else. Anything a real
 * component also depends on — a radius, a grid, a row height, a colour — is
 * imported from `tokens` above, never restated here. */

/** Control height shared by the search field, the toggle group and a button. */
const CONTROL_ROW = 40;

/**
 * `SearchField`'s contract default `minWidth` (220), so the search box does not
 * change width when data lands. It is restated rather than imported because the
 * contract closes `SearchField`'s API at its props and components, and the
 * barrel re-exports whatever a leaf exports; both numbers trace to the same
 * line of the contract, not to each other.
 */
const SEARCH_MIN_WIDTH = 220;

/** `TabStrip`'s metric (`LandPropertiesPage.tsx:486`), so tabs do not resize. */
const TAB_ROW = 38;

/** `CardHero`'s default band (`holdingCards.tsx:128`). */
const MEDIA_BAND = 140;

/** `RecordMedia`'s default cover band. */
const RECORD_BAND = 240;

/**
 * `MAP_HEIGHTS.standard`. It is restated rather than imported because it is
 * exported from `MapSurface`, which sits four build orders above this file and
 * would take the whole map with it; the two must be changed together.
 */
const MAP_STANDARD = 430;

/** Deterministic bar widths, so a skeleton never flickers between renders. */
const CELL_WIDTHS = ['34%', '22%', '28%', '20%', '26%', '24%'] as const;

function cellWidth(index: number): string {
  return CELL_WIDTHS[index % CELL_WIDTHS.length] ?? '24%';
}

/* ── Header ──────────────────────────────────────────────────────────────── */

/**
 * `PageHeader`'s footprint: eyebrow, title, the chips that sit beside the
 * title, the subtitle, and the action cluster on the right. Reserving the
 * chips matters more than it looks — the unreachable chip appears only on a
 * failed load, and without its width the title re-wraps when it arrives.
 */
export function HeaderSkeleton({ chips = false, actions = 0 }: { chips?: boolean; actions?: number }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: GAP.cluster,
        mb: GAP.page,
      }}
    >
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Skeleton width={90} height={14} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
          <Skeleton width={240} height={36} />
          {chips && (
            <>
              <Skeleton variant="rounded" width={72} height={24} sx={{ borderRadius: RADIUS.pill }} />
              <Skeleton variant="rounded" width={132} height={24} sx={{ borderRadius: RADIUS.pill }} />
            </>
          )}
        </Box>
        <Skeleton width={320} height={18} sx={{ maxWidth: '100%' }} />
      </Box>
      {actions > 0 && (
        <Box sx={actionClusterSx}>
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton
              key={i}
              variant="rounded"
              width={104}
              height={CONTROL_ROW}
              sx={{ borderRadius: RADIUS.control }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

/* ── Stats ───────────────────────────────────────────────────────────────── */

/**
 * The stat row, drawn inside `StatTiles`' own tinted container rather than a
 * `Card` — `Skeletons.tsx:13` swapped the surface for a card and then swapped
 * it back, which read as the row changing colour when the figures arrived.
 *
 * The tint is the reference row's 5% / dark 8% wash (`holdingCards.tsx:249-267`
 * `StatRow`), not the `primary.container` fill: the container pair is opaque
 * enough that the `text.secondary` labels the loaded tiles use fall below
 * 4.5:1, so painting it here would both move the reference row's colour and
 * make the placeholder lie about the surface the figures land on. What the
 * reference hard-coded — `rgba(25, 118, 210, 0.05)` and a dark
 * `rgba(144, 202, 249, 0.08)` — is `primary.main` at those two alphas in each
 * scheme, so the same two values are mixed off the palette instead: the
 * highContrast scheme then gets a wash of its own primary plus the edge that
 * keeps a near-white surface visible, which the literal never gave it.
 *
 * The surface is spelled out rather than imported because the shared atom for
 * it is `tokens.tonalSx`, which resolves the container pair, and because a
 * `SxProps` returned from a token cannot be merged with the layout rules that
 * have to live on this very element.
 *
 * The wrapper and the scope-note line under the row are not decoration: the
 * loaded `StatTiles` renders a `caption` ("Across all records") inside a
 * `mb: GAP.block` wrapper, so a placeholder that stops at the tinted row is
 * one caption line — 18px plus `GAP.tight` — shorter than what replaces it,
 * and the toolbar and the whole body below drop by that much on arrival.
 */
export function StatTilesSkeleton({
  count = 4,
  emphasis = 'md',
}: {
  count?: number;
  emphasis?: StatEmphasis;
}) {
  return (
    /* The block gap sits on the wrapper, exactly as it does on the loaded row,
       so the scope note stays attached to the row it describes. */
    <Box sx={{ mb: GAP.block }}>
      <Box
        sx={(t) => ({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          borderRadius: RADIUS.card,
          bgcolor: `color-mix(in srgb, ${(t.vars ?? t).palette.primary.main} 5%, transparent)`,
          ...t.applyStyles('dark', {
            bgcolor: `color-mix(in srgb, ${(t.vars ?? t).palette.primary.main} 8%, transparent)`,
          }),
          ...t.applyStyles('highContrast', { border: '2px solid', borderColor: 'currentColor' }),
          '& > *': { flex: 1, minWidth: 140 },
          '& > * + *': { borderLeft: '1px solid', borderColor: 'divider' },
        })}
      >
        {Array.from({ length: count }, (_, i) => (
          <Box key={i} sx={{ px: PAD.card, py: 1.75, minWidth: 0 }}>
            <Skeleton width={80} height={16} />
            <Skeleton width={110} height={emphasis === 'lg' ? 42 : 30} />
          </Box>
        ))}
      </Box>
      {/* An empty `caption` wrapper, so the reserved line is the scope note's
          own line box rather than a height restated from the type scale. */}
      <Typography variant="caption" component="p" sx={{ mt: GAP.tight, textAlign: 'right' }}>
        <Skeleton width={140} sx={{ display: 'inline-block' }} />
      </Typography>
    </Box>
  );
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */

/**
 * The control surface, which used to pop in whole. `controls` is the number of
 * placeholders in the right-hand cluster, filled in `ListToolbar`'s fixed
 * order: the search field first, the view toggle second, then buttons —
 * Filters, Export, the create action. Four is the default; a caller that knows
 * its own cluster passes the live count, because a placeholder that guesses a
 * different wrap point is the reflow this file exists to prevent. Zero leaves a
 * bare tab row, which is what a screen whose tabs carry no toolbar needs.
 */
export function ToolbarSkeleton({ tabs = false, controls = 4 }: { tabs?: boolean; controls?: number }) {
  return (
    <Box sx={toolbarRowSx}>
      {tabs && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: GAP.block,
            minHeight: TAB_ROW,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <Skeleton width={48} height={18} />
          <Skeleton width={96} height={18} />
          <Skeleton width={84} height={18} />
        </Box>
      )}
      {controls > 0 && (
        <Box sx={actionClusterSx}>
          {Array.from({ length: controls }, (_, i) => {
            /* 0 = search, at `SearchField`'s default `minWidth`; 1 = the two-up
             * view toggle, 2+ = buttons. */
            const width = i === 0 ? SEARCH_MIN_WIDTH : i === 1 ? 132 : 104;
            return (
              <Skeleton
                key={i}
                variant="rounded"
                height={CONTROL_ROW}
                sx={{ width, maxWidth: '100%', borderRadius: RADIUS.control }}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}

/* ── Bodies ──────────────────────────────────────────────────────────────── */

/**
 * The table, at the spec's 52px rows and at the caller's live column count —
 * so a six-column table is never replaced by a four-bar placeholder that then
 * doubles. The 26px circle the old skeleton drew in every row is gone: no
 * table in the app renders an avatar, and a placeholder must not promise one.
 */
export function TableSkeleton({
  rows = 6,
  columns = 6,
  selectable = false,
}: {
  rows?: number;
  columns?: number;
  selectable?: boolean;
}) {
  return (
    <Card sx={surfaceSx}>
      <Box sx={{ px: GAP.block, py: GAP.control }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: GAP.block, py: 1.5 }}>
          {selectable && <Skeleton variant="rounded" width={18} height={18} sx={{ flexShrink: 0 }} />}
          {Array.from({ length: columns }, (_, c) => (
            <Box key={c} sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton width={cellWidth(c)} height={16} />
            </Box>
          ))}
        </Box>
        {Array.from({ length: rows }, (_, r) => (
          <Box
            key={r}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: GAP.block,
              height: ROW_HEIGHT,
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            {selectable && <Skeleton variant="rounded" width={18} height={18} sx={{ flexShrink: 0 }} />}
            {Array.from({ length: columns }, (_, c) => (
              <Box key={c} sx={{ flex: 1, minWidth: 0 }}>
                <Skeleton width={cellWidth(c + r)} height={18} />
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Card>
  );
}

/**
 * The card grid, on `cardGridSx` — the same object the live grid uses, which
 * is the whole point: the skeleton used to stop at three columns while the
 * grid went to four, so the fourth card appeared out of nowhere on any wide
 * screen. The body mirrors `MediaCard`'s anatomy in order — title row with its
 * type chip, owner, location, footer rule — and there is no circular avatar,
 * because no card renders one.
 */
export function CardGridSkeleton({ count = 6, media = true }: { count?: number; media?: boolean }) {
  return (
    <Box sx={cardGridSx}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} sx={surfaceSx}>
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {media && <Skeleton variant="rectangular" height={MEDIA_BAND} />}
            <Box
              sx={{
                p: GAP.block,
                display: 'flex',
                flexDirection: 'column',
                gap: GAP.control,
                flexGrow: 1,
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: GAP.control }}>
                <Skeleton width="55%" height={22} />
                <Skeleton
                  variant="rounded"
                  width={64}
                  height={24}
                  sx={{ flexShrink: 0, borderRadius: RADIUS.pill }}
                />
              </Box>
              <Skeleton width="70%" height={18} />
              <Skeleton width="50%" height={18} />
              <Box
                sx={{
                  mt: 'auto',
                  pt: GAP.cluster,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: GAP.control,
                }}
              >
                <Skeleton width={90} height={22} />
                <Skeleton width={70} height={18} />
              </Box>
            </Box>
          </Box>
        </Card>
      ))}
    </Box>
  );
}

/**
 * One `Section variant="card"`: its heading and a few lines of prose. Also the
 * body a `DataTable` expander shows while it fetches, which is why it carries
 * no outer margin — the caller owns the rhythm around it.
 */
export function SectionSkeleton({ lines = 3, title = true }: { lines?: number; title?: boolean }) {
  return (
    <Card sx={surfaceSx}>
      <Box sx={{ p: PAD.card }}>
        {title && <Skeleton width={160} height={20} sx={{ mb: GAP.cluster }} />}
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} height={16} width={i === lines - 1 ? '60%' : '100%'} sx={{ mt: i === 0 ? 0 : 0.5 }} />
        ))}
      </Box>
    </Card>
  );
}

/* ── Record detail ───────────────────────────────────────────────────────── */

/**
 * The record page as it will actually render: hero header, the cover band when
 * the record has one, its tab strip, then its panels. `PassbookDetailPage`'s
 * skeleton promised a page header and a hero the page never draws, so the
 * reader was shown furniture that then vanished — `hero` exists precisely so a
 * coverless record can say so.
 */
export function RecordSkeleton({
  hero = true,
  tabs = true,
  sections = 2,
}: {
  hero?: boolean;
  tabs?: boolean;
  sections?: number;
}) {
  return (
    <>
      <Skeleton width={96} height={18} sx={{ mb: GAP.control }} />
      <HeaderSkeleton chips actions={2} />
      {hero && (
        <Skeleton
          variant="rounded"
          height={RECORD_BAND}
          sx={{ borderRadius: RADIUS.card, mb: GAP.block }}
        />
      )}
      {tabs && <ToolbarSkeleton tabs controls={0} />}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: GAP.section }}>
        {Array.from({ length: sections }, (_, i) => (
          <SectionSkeleton key={i} />
        ))}
      </Box>
    </>
  );
}

/**
 * `FieldGrid`'s label/value pairs, on the grid the real one uses: one column
 * below `sm`, `minmax(0, 1fr)` tracks at `md` and up. The `minmax(0, …)` is
 * not decoration — a bare `1fr` track lets one long survey number widen the
 * grid past the viewport.
 */
export function FieldGridSkeleton({ fields = 6, columns = 2 }: { fields?: number; columns?: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: `repeat(${columns}, minmax(0, 1fr))`,
        },
        columnGap: GAP.page,
        rowGap: GAP.block,
      }}
    >
      {Array.from({ length: fields }, (_, i) => (
        <Box key={i} sx={{ minWidth: 0 }}>
          <Skeleton width={90} height={14} />
          <Skeleton width={cellWidth(i + 2)} height={20} sx={{ minWidth: 120 }} />
        </Box>
      ))}
    </Box>
  );
}

/* ── Map ─────────────────────────────────────────────────────────────────── */

/**
 * The map's placeholder at the map's own height and radius, with its toolbar
 * row above it. `GeoMapLazy.tsx:18-31` held a lone spinner in a 380px box at a
 * 24px radius and then handed over to a 430px map at 12px, so the page jumped
 * twice on every detail view — once in height, once in shape.
 */
export function MapSkeleton({
  height = MAP_STANDARD,
  toolbar = true,
}: {
  height?: number;
  toolbar?: boolean;
}) {
  return (
    <Box>
      {toolbar && (
        <Box sx={{ mb: GAP.control }}>
          <Box sx={actionClusterSx}>
            {/* Modes, locate, search, layers — `MapSurface`'s fixed toolbar order. */}
            {[132, 104, 128, 180].map((width) => (
              <Skeleton
                key={width}
                variant="rounded"
                height={CONTROL_ROW}
                sx={{ width, maxWidth: '100%', borderRadius: RADIUS.control }}
              />
            ))}
          </Box>
        </Box>
      )}
      <Skeleton variant="rounded" height={height} sx={{ width: '100%', borderRadius: RADIUS.card }} />
    </Box>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export interface PageSkeletonProps {
  header?: boolean;
  /** Tile count, or `false` for a screen with no stat row. */
  stats?: number | false;
  /** The control surface must NOT pop in. */
  toolbar?: boolean;
  /**
   * Placeholders in the toolbar's right-hand cluster. Four is the standard
   * cluster; a caller that knows its own — Properties renders five — passes the
   * live count, so the reserved row wraps where the real one will.
   */
  controls?: number;
  tabs?: boolean;
  /** Picks `TableSkeleton` vs `CardGridSkeleton` from the LIVE view mode. */
  view?: ViewMode;
  rows?: number;
  columns?: number;
}

/**
 * The whole list screen, assembled in the order the screen itself renders:
 * header, stats, then the one row that carries the tabs on its left and the
 * controls on its right — `ListToolbar`'s `left` slot, not a second row — and
 * finally the body, taken from the live view mode so a grid load never resolves
 * into a table or the reverse.
 */
export function PageSkeleton({
  header = true,
  stats = 4,
  toolbar = true,
  controls = 4,
  tabs = false,
  view = 'grid',
  rows = 6,
  columns = 6,
}: PageSkeletonProps) {
  return (
    <>
      {header && <HeaderSkeleton />}
      {stats !== false && stats > 0 && <StatTilesSkeleton count={stats} />}
      {(toolbar || tabs) && <ToolbarSkeleton tabs={tabs} controls={toolbar ? controls : 0} />}
      {view === 'list' ? (
        <TableSkeleton rows={rows} columns={columns} />
      ) : (
        <CardGridSkeleton count={rows} />
      )}
    </>
  );
}
