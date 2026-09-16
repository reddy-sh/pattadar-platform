'use client';

/**
 * The four ways a screen can have nothing to show — and the switch that
 * decides which one it actually is.
 *
 * Land & Properties decides this today in one line, `LandPropertiesPage.tsx:375`:
 * `const firstRun = !isLoading && holdings.length === 0`. It reads like a
 * definition of "new user" and is in fact a definition of "the array is empty",
 * and `useLiveOrSample` hands back `emptyLike` whenever the service does not
 * answer. So the screen a founder with thirty parcels sees during an outage is
 * a cheerful `🌍 Add your first holding` under a filled Add button. Their
 * records are safe; the app is telling them the opposite and offering to start
 * them over. That is the highest-severity defect in the whole inventory, and it
 * is closed here by construction rather than by care: the outage is a state of
 * its own, and its spec type — `UnreachableSpec` — omits `primaryAction`, so
 * handing an outage a create CTA is a compile error instead of a rule somebody
 * has to remember in a review six months from now.
 *
 * The same bug has a quieter half at the other end. Filter the list down to
 * nothing and `:607-757` renders an empty grid, or a table with headers and no
 * rows — a blank region that says neither "nothing matches" nor "clear the
 * filters", and leaves the reader to guess whether they broke the app. So
 * precedence is fixed here, once, and nowhere else: loading → error →
 * (unreachable ? error : first-run) → no-results → the body. `total === 0`
 * while unreachable is an outage and never a first run. `hasActiveQuery` does
 * NOT gate the no-results state — a body with nothing visible is never blank —
 * it gates only whether `Clear filters` is offered, because a Clear button with
 * nothing to clear is exactly the dead control the zero-state standard forbids.
 *
 * `placement` owns the geometry and `variant` owns the meaning, which is what
 * lets one component retire two. `page` is `EmptyLanding`'s Card — 72px of
 * padding, a 56px emoji, one filled CTA — the first-run screen, unchanged.
 * `panel` is `EmptyState`'s bare box at 48px with a 44px `text.disabled` icon.
 * `cell` is the same panel inside a full-width table row, so a filtered-to-zero
 * table can answer inside its own body instead of showing bare headers. The two
 * icon vocabularies survive together: a string renders as a large emoji, a node
 * renders dimmed at the placement's size.
 *
 * Two structural notes worth stating, because both look like omissions.
 * ZeroState does NOT wrap its buttons in an `ActionRegion`: an inherited region
 * demotes its primary wherever another region encloses it (`Action.tsx`), and a
 * zero state is rendered inside list bodies, table cells and panels — so
 * declaring one here would quietly tonal-ise the very filled button this state
 * exists to offer, in exactly the placements that need it most. Declaring
 * `root` instead would win those pixels back and cost the empty-state rule:
 * `demote` on the toolbar's create action is what hands this button the page's
 * one fill, and that only works while this one is not claiming a region of its
 * own.
 * And `onResolve` reports the resolved state through an effect guarded by a
 * signature, not on every render — a scaffold storing the report in state would
 * otherwise re-render, hand back a fresh callback, and loop forever.
 *
 * Extracted from `src/views/LandPropertiesPage.tsx:375` (the `firstRun` test
 * that is also true for an outage), `:431-441` (the first-run branch that
 * replaces the whole page) and `:607-757` (the loaded body that renders blank
 * when filters exclude everything); `src/components/holdingCards.tsx:287-317`
 * (`EmptyLanding` — `py: 9`, `px: 3`, 56px emoji, mandatory CTA) and
 * `src/components/EmptyState.tsx:13-29` (`EmptyState` — `py: 6`, `px: 2`, 44px
 * `text.disabled` icon, optional action): two components, one job, incompatible
 * APIs. The one visible change to either is the page card's surface, which is
 * now `surfaceSx` — border and tint, no shadow — because in this spec a shadow
 * means "this floats above the page" and a resting card must not borrow it.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

import { Action } from './Action';
import { GAP, surfaceSx } from './tokens';
import type {
  ActionRole,
  ActionSpec,
  AsyncStatus,
  ZeroPlacement,
  ZeroSpec,
  ZeroVariant,
} from './types';

/**
 * MUI's own sx-composition idiom. `surfaceSx` is typed `SxProps<Theme>` — a
 * union that already admits the callback and array forms — so it cannot be
 * spread into an object literal without being flattened first. Composing into
 * one array keeps the token the single definition of the surface instead of a
 * value this file copies and then quietly edits.
 */
function composeSx(...parts: SxProps<Theme>[]): SxProps<Theme> {
  return parts.flatMap((part) => (Array.isArray(part) ? part : [part]));
}

/* ── Copy ────────────────────────────────────────────────────────────── */

/**
 * The defaults a caller inherits by supplying only a partial spec. They are
 * written down rather than left to each screen because the failures they
 * replace all share one habit — `AuditLogPage.tsx:105-112`,
 * `AdminRefDataPage.tsx:138-145` and `ToolsPage.tsx:83-85` all report an outage
 * in the language of an empty result, which reads as "you have nothing" when
 * the truth is "we could not ask". The error copy names the outage and says the
 * records are safe, because that is the sentence the reader needs first.
 *
 * Each default carries an icon as well as its sentence, because the design
 * authority's fourth principle asks for an icon, one sentence and one action —
 * and a caller who declares only the state it is in (the documented minimum)
 * must still get all three rather than a bare heading.
 */
const NO_RESULTS_COPY = {
  icon: '🔍',
  title: 'No matches',
  body: 'Nothing matches the current search and filters.',
  clearLabel: 'Clear filters',
} as const;

const OUTAGE_COPY = {
  icon: '⚠️',
  title: 'We could not load this',
  body: 'The service did not answer. Your records are safe — try again in a moment.',
  retryLabel: 'Try again',
} as const;

/* ── Geometry ────────────────────────────────────────────────────────── */

/**
 * Icon size by placement: `EmptyLanding`'s 56 on the page card, `EmptyState`'s
 * 44 everywhere else. The brief states both figures — the placement decides the
 * size, the icon's type decides its treatment.
 */
const ICON_PX: Record<ZeroPlacement, number> = { page: 56, panel: 44, cell: 44 };

/**
 * How the state announces itself when it swaps in after a fetch. A no-results
 * is news the reader can take politely; a failed load must not wait for them to
 * happen to look at the region. First-run and idle say nothing — first-run is a
 * whole-page change the reader already navigated to.
 */
const LIVE_ROLE: Record<ZeroVariant, 'status' | 'alert' | undefined> = {
  'first-run': undefined,
  'no-results': 'status',
  error: 'alert',
  idle: undefined,
};

/**
 * `ActionSpec.key` is a list identity, not a DOM prop — spreading an object
 * carrying `key` into JSX is a React 19 warning — so it is peeled off here and
 * used as the element key it always was. The role falls back rather than being
 * forced: a caller who states one keeps it.
 */
function renderAction(spec: ActionSpec, fallbackRole: ActionRole) {
  const { key, ...props } = spec;
  return <Action key={key ?? props.label} {...props} role={props.role ?? fallbackRole} />;
}

/** One full-width row, for a state that has to live inside a `<tbody>`. */
function cellShell(node: ReactNode, colSpan: number) {
  return (
    <TableRow>
      {/* The panel body carries its own 48/16 inset; a second one from the cell
          would double it, and the rule under a state that IS the whole body
          reads as a stray divider. */}
      <TableCell colSpan={colSpan} sx={{ p: 0, borderBottom: 'none' }}>
        {node}
      </TableCell>
    </TableRow>
  );
}

/* ── ZeroState ───────────────────────────────────────────────────────── */

export interface ZeroStateProps extends ZeroSpec {
  /** Default 'first-run'. Decides the live-region semantics, not the geometry. */
  variant?: ZeroVariant;
  /** Default 'panel'. Decides the geometry. */
  placement?: ZeroPlacement;
  /** Colspan for placement='cell'. DataTable supplies it automatically. */
  colSpan?: number;
}

export function ZeroState({
  variant = 'first-run',
  placement = 'panel',
  colSpan = 1,
  icon,
  title,
  body,
  primaryAction,
  secondaryAction,
}: ZeroStateProps) {
  const page = placement === 'page';
  const iconPx = ICON_PX[placement];
  const hasIcon = Boolean(icon);
  const hasActions = primaryAction !== undefined || secondaryAction !== undefined;

  const content = (
    <>
      {hasIcon ? (
        typeof icon === 'string' ? (
          // An emoji is decoration with a text encoding: read aloud it is
          // "globe showing Europe-Africa" in front of the sentence that matters.
          <Box aria-hidden sx={{ fontSize: iconPx, lineHeight: 1, mb: page ? 0 : 1.5 }}>
            {icon}
          </Box>
        ) : (
          <Box
            sx={{ color: 'text.disabled', lineHeight: 1, mb: page ? 0 : 1.5, '& svg': { fontSize: iconPx } }}
          >
            {icon}
          </Box>
        )
      ) : null}

      {/* `component="p"` in both originals: the state is content, not an
          outline entry, and a page already owns exactly one h1. */}
      <Typography
        variant="h6"
        component="p"
        // The page card's 16px gap belongs to the icon above it. Without one —
        // which the originals never allowed and this kit does — it would be a
        // stray offset inside an otherwise symmetric 72px inset.
        sx={{ mt: page && hasIcon ? 2 : 0, mb: page ? 1 : 0.75 }}
      >
        {title}
      </Typography>

      {body !== undefined && body !== null ? (
        <Typography
          variant="body2"
          color="text.secondary"
          // A measure, not a width: the sentence stays readable and the box
          // still shrinks below it at 400px rather than taking a scrollbar.
          sx={{ maxWidth: page ? 460 : 420, mx: 'auto' }}
        >
          {body}
        </Typography>
      ) : null}

      {hasActions ? (
        <Box
          sx={{
            mt: 2.5,
            display: 'flex',
            // The page card stacks — `EmptyLanding` put its secondary under the
            // CTA at 12px, and this gap is that. A panel's two buttons are peers.
            flexDirection: page ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: page ? GAP.cluster : GAP.control,
          }}
        >
          {primaryAction !== undefined ? renderAction(primaryAction, 'primary') : null}
          {secondaryAction !== undefined ? renderAction(secondaryAction, 'secondary') : null}
        </Box>
      ) : null}
    </>
  );

  const role = LIVE_ROLE[variant];

  if (page) {
    return (
      <Card
        role={role}
        sx={composeSx(surfaceSx, {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          py: 9,
          px: 3,
        })}
      >
        {content}
      </Card>
    );
  }

  const panel = (
    <Box role={role} sx={{ textAlign: 'center', py: 6, px: 2 }}>
      {content}
    </Box>
  );

  return placement === 'cell' ? cellShell(panel, colSpan) : panel;
}

/* ── Status vocabulary ───────────────────────────────────────────────── */

/**
 * An error / outage spec. It structurally CANNOT carry a create CTA — an
 * outage offering "Add your first holding" is a compile error, not a rule.
 */
export type UnreachableSpec = Omit<Partial<ZeroSpec>, 'primaryAction'>;

/** Precedence, in one place: loading → error → empty → ready. */
export function resolveAsyncStatus(p: {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
}): AsyncStatus {
  if (p.isLoading === true) return 'loading';
  if (p.isError === true) return 'error';
  if (p.isEmpty === true) return 'empty';
  return 'ready';
}

/**
 * Does this state replace the page chrome? Exported so scaffolds agree with it.
 * Only first-run does: a screen with nothing in it yet has no counts to tile, no
 * filters to offer and no rows to export, so every one of those controls would
 * be a dead one. Everything else keeps the page it is standing in.
 */
export function replacesPage(variant: ZeroVariant | null): boolean {
  return variant === 'first-run';
}

/* ── StateSwitch ─────────────────────────────────────────────────────── */

export interface StateSwitchProps {
  isLoading: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** The whole collection's size, BEFORE search and filters. */
  total: number;
  /** What the user can actually see right now. */
  visibleCount: number;
  /** True when a search term or any filter is set. */
  hasActiveQuery: boolean;
  onClearQuery?: () => void;
  /** True when the backend did not answer. total === 0 must NEVER render first-run. */
  isUnreachable?: boolean;
  skeleton: ReactNode;
  firstRun: ZeroSpec;
  noResults?: Omit<Partial<ZeroSpec>, 'primaryAction'>;
  errorState?: UnreachableSpec;
  placement?: ZeroPlacement;
  /** The loaded body. */
  children: ReactNode;
  /**
   * Called with the resolved state so a scaffold knows whether this state
   * REPLACES the page chrome (first-run) or sits inside it.
   */
  onResolve?: (state: {
    status: AsyncStatus;
    variant: ZeroVariant | null;
    replacesPage: boolean;
  }) => void;
}

export function StateSwitch({
  isLoading,
  isError,
  errorMessage,
  onRetry,
  total,
  visibleCount,
  hasActiveQuery,
  onClearQuery,
  isUnreachable,
  skeleton,
  firstRun,
  noResults,
  errorState,
  placement = 'panel',
  children,
  onResolve,
}: StateSwitchProps) {
  /**
   * THE line. An empty collection is a first run only when we know it is
   * empty; when the service did not answer we know nothing, and the honest
   * answer is the outage. `LandPropertiesPage.tsx:375` is missing this clause.
   */
  const outage = isError === true || (total === 0 && isUnreachable === true);

  const variant: ZeroVariant | null = isLoading
    ? null
    : outage
      ? 'error'
      : total === 0
        ? 'first-run'
        : // Not gated on `hasActiveQuery`: whatever excluded the rows — a tab, a
          // chip, a search term — a body showing nothing must still say so.
          visibleCount === 0
          ? 'no-results'
          : null;

  const status: AsyncStatus = isLoading
    ? 'loading'
    : variant === 'error'
      ? 'error'
      : variant === null
        ? 'ready'
        : 'empty';

  /**
   * Reported through an effect, and only when the answer actually changes: a
   * scaffold that stores the report in state hands back a new callback on every
   * render, and reporting on identity would spin. The callback lives in a ref
   * for the same reason.
   */
  const latest = useRef(onResolve);
  useEffect(() => {
    latest.current = onResolve;
  });
  const reported = useRef<string | null>(null);
  useEffect(() => {
    const signature = `${status}|${variant ?? ''}`;
    if (reported.current === signature) return;
    reported.current = signature;
    latest.current?.({ status, variant, replacesPage: replacesPage(variant) });
  }, [status, variant]);

  if (isLoading) return <>{skeleton}</>;

  if (variant === 'error') {
    return (
      <ZeroState
        variant="error"
        placement={placement}
        icon={errorState?.icon ?? OUTAGE_COPY.icon}
        title={errorState?.title ?? OUTAGE_COPY.title}
        body={errorState?.body ?? errorMessage ?? OUTAGE_COPY.body}
        secondaryAction={
          errorState?.secondaryAction ??
          (onRetry !== undefined
            ? { label: OUTAGE_COPY.retryLabel, onClick: onRetry, role: 'secondary' }
            : undefined)
        }
      />
    );
  }

  if (variant === 'first-run') {
    return (
      <ZeroState
        variant="first-run"
        // The contract's state table: first-run IS the page, so it gets the page
        // card. Inside a table body it cannot be — a Card is not a row — so a
        // `cell` caller keeps its cell.
        placement={placement === 'cell' ? 'cell' : 'page'}
        {...firstRun}
      />
    );
  }

  if (variant === 'no-results') {
    return (
      <ZeroState
        variant="no-results"
        placement={placement}
        icon={noResults?.icon ?? NO_RESULTS_COPY.icon}
        title={noResults?.title ?? NO_RESULTS_COPY.title}
        body={noResults?.body ?? NO_RESULTS_COPY.body}
        // Secondary, never primary: the way out of a no-results is back to the
        // rows the reader already has, not a new record they did not ask for.
        // Offered only when there is something to clear.
        secondaryAction={
          noResults?.secondaryAction ??
          (hasActiveQuery && onClearQuery !== undefined
            ? { label: NO_RESULTS_COPY.clearLabel, onClick: onClearQuery, role: 'secondary' }
            : undefined)
        }
      />
    );
  }

  return <>{children}</>;
}

/* ── AsyncPanel ──────────────────────────────────────────────────────── */

/**
 * The fallback when a panel declares no skeleton of its own. It is three grey
 * lines rather than a spinner, and it exists because the alternative — a blank
 * region for the length of the request — is the defect this file is about.
 * Deliberately local: `KitSkeletons` is not in this file's dependency set.
 */
function PanelLoading() {
  return (
    <Box sx={{ py: GAP.block }}>
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="text" />
      <Skeleton variant="text" width="70%" />
    </Box>
  );
}

export interface AsyncPanelProps {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  skeleton?: ReactNode;
  empty: ZeroSpec;
  errorState?: UnreachableSpec;
  placement?: ZeroPlacement;
  children: ReactNode;
}

/**
 * The three-state wrapper for a panel with no filtering (notes, audit, owners,
 * files). `isEmpty` is never consulted while `isLoading` — the four GroupDetail
 * tabs and `PropertyFilesPanel.tsx:189` all announce "no notes yet" during the
 * first request, and a reader who has notes is told they have none until the
 * response lands.
 */
export function AsyncPanel({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  skeleton,
  empty,
  errorState,
  placement = 'panel',
  children,
}: AsyncPanelProps) {
  const status = resolveAsyncStatus({ isLoading, isError, isEmpty });

  if (status === 'loading') {
    if (skeleton !== undefined) return <>{skeleton}</>;
    return placement === 'cell' ? cellShell(<PanelLoading />, 1) : <PanelLoading />;
  }

  if (status === 'error') {
    return (
      <ZeroState
        variant="error"
        placement={placement}
        icon={errorState?.icon ?? OUTAGE_COPY.icon}
        title={errorState?.title ?? OUTAGE_COPY.title}
        body={errorState?.body ?? OUTAGE_COPY.body}
        secondaryAction={
          errorState?.secondaryAction ??
          (onRetry !== undefined
            ? { label: OUTAGE_COPY.retryLabel, onClick: onRetry, role: 'secondary' }
            : undefined)
        }
      />
    );
  }

  // A panel's empty IS its first run — it may legally offer the create action
  // the outage above may not.
  if (status === 'empty') {
    return <ZeroState variant="first-run" placement={placement} {...empty} />;
  }

  return <>{children}</>;
}
