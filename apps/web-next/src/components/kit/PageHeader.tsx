'use client';

/**
 * The header every screen starts with, and the one chip that admits the
 * service did not answer.
 *
 * Its predecessor (`components/PageHeader.tsx`) already won the important
 * argument: twelve screens share one title block, so the eyebrow, the headline
 * scale, the action alignment and the 24px drop to the content below it are
 * decided once. What it could not do was tell the truth. Its outage flag was
 * named `sample`, so the prop said "this screen is showing the bundled demo
 * dataset" while the chip it rendered said "Service unreachable" — two
 * different claims about the same fact, and the reason `WalletPage` paints a
 * red outage chip beside "Coming soon" on a screen whose service was never
 * called. `dataState` replaces it with the vocabulary in `types.ts` that the
 * whole kit shares, so a list, a record page and a tool tab all say the one
 * thing the same way.
 *
 * The other three additions are slots the screens were hand-rolling anyway.
 * `subtitle` is a `ReactNode` because `LandPropertiesPage.tsx:450` had to build
 * its composition line as a template literal — pluralisation, separators and
 * all — purely because the prop was typed `string`; a node can carry the chips
 * and links that line wants. `back` and `breadcrumbs` exist because all three
 * record pages ended up with a `← Back to …` written as
 * `<Link component="button">` (`PassbookDetailPage.tsx:532`,
 * `PropertyDetailPage.tsx:732`, `ParcelDetailPage.tsx:1043`) — a control that
 * looks like a link, is announced as a link, and navigates nowhere; here it is
 * a real `Action`, and a real anchor whenever an `href` is given. `media` is
 * the avatar slot `PassbookDetailPage` builds by hand.
 *
 * `below` is the quiet one that matters most. Properties renders its tab strip
 * and toolbar as a sibling row at `LandPropertiesPage.tsx:486-536` and picks
 * its own `mb`; Passbooks picks a different one; Documents picks a third. With
 * the slot here, the header owns the whole header → tabs → toolbar → content
 * rhythm — 12px above the controls, 24px below them — and no screen re-declares
 * it. The row's own bottom margin therefore steps down to that 12px gap
 * whenever something is in the slot, so the two never sum into a 36px gutter
 * that is on nobody's scale.
 *
 * Extracted from `components/PageHeader.tsx:7-25` (the props) and `:32-79`
 * (the body, whose `variant` mapped `'h2'`→`h4` / `'h3'`→`h6` and whose
 * `sample` chip lived at `:63-67`), with the consumer at
 * `views/LandPropertiesPage.tsx:445-451` as the parity reference. The chip's
 * label and its tooltip sentence are carried over byte-for-byte to preserve
 * the service-unreachable copy contract.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useId } from 'react';
import type { ElementType, ReactNode } from 'react';
import NextLink from 'next/link';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Chip, { chipClasses } from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import type { SxProps, Theme } from '@mui/material/styles';

import { Action, ActionRow } from './Action';
import { GAP, RADIUS, focusRingSx } from './tokens';
import type { DataState, HeaderLevel } from './types';

const NOOP = () => {};

/**
 * The house visually-hidden atom — the same object `Action.tsx` mounts for a
 * disabled control's reason and `StatusChip.tsx` for a chip's hint. It is
 * declared here rather than imported because it is private to each of those
 * files: the kit contract closes their APIs, and the barrel re-exports whatever
 * a leaf exports, so sharing it would put a styling atom on the public surface.
 * Absolutely positioned, so mounting one beside a chip never opens a gap in the
 * row around it.
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

/* ── ServiceStateChip ────────────────────────────────────────────────── */

/**
 * Both strings are preserved verbatim from `components/PageHeader.tsx:64-66`.
 * They are named constants rather than inline literals so the next person to
 * reword a chip has to walk past the reason they may not.
 */
const UNREACHABLE_LABEL = 'Service unreachable';
const UNREACHABLE_HINT =
  'The live service is not reachable — nothing is shown until it responds.';

/**
 * The chip keeps the contract-locked `outlined` + `error` spelling it was
 * lifted with (`components/PageHeader.tsx:63-67`); only the ink is
 * scheme-aware. MUI paints an outlined colour chip's label in
 * `palette.error.main`, which reads as a fill but not as 13px text on a light
 * ground — #FF5630 on `background.paper` is 3.17:1, below AA, on the one chip
 * in the kit whose whole job is reporting a failure. The light scheme
 * therefore takes `error.dark` (6.56:1); dark (4.53:1 on paper) and
 * highContrast (8.02:1) already clear AA with `error.main` and are left alone.
 * Same measurement, same answer as `Action.tsx`'s destructive ink.
 *
 * The outline is deliberately NOT repainted: MUI derives it from
 * `alpha(error.main, 0.7)` independently of `color`, so the chip keeps the
 * shape, size and edge the reference screen draws and changes only the one
 * value that failed.
 */
function unreachableInkSx(t: Theme) {
  return {
    color: (t.vars ?? t).palette.error.dark,
    ...t.applyStyles('dark', { color: (t.vars ?? t).palette.error.main }),
    ...t.applyStyles('highContrast', { color: (t.vars ?? t).palette.error.main }),
  };
}

export interface ServiceStateChipProps {
  state: DataState;
  /**
   * Tightens the label inset for a row that has no header around it to
   * breathe in — a tool tab strip, a panel caption. Nothing else changes:
   * the words, the outline and the tone are the same chip either way.
   */
  compact?: boolean;
}

/**
 * The single outage indicator, exported on its own because three tool tabs
 * have a body but no header and were each inventing a different sentence for
 * the same silence.
 *
 * `'live'` renders nothing at all — an outage is news, a working service is
 * not, and a green "everything is fine" badge beside every title is noise that
 * teaches readers to stop looking at the spot where the bad news appears.
 *
 * The sentence is carried twice on purpose. A `Chip` with no `onClick` and no
 * `onDelete` is not focusable, and MUI's `Tooltip` opens on hover or focus
 * only, so a tooltip alone would tell the outage to pointer users and to
 * nobody else — on the one chip whose entire job is explaining a failure. The
 * visually hidden sibling below is the same node `StatusChip` mounts for its
 * own `hint`, and it is the carrier that keyboard and assistive-technology
 * users actually get.
 */
export function ServiceStateChip({ state, compact }: ServiceStateChipProps) {
  const hintId = useId();

  if (state !== 'unreachable') return null;

  // `describeChild` keeps the tooltip a DESCRIPTION: left to itself MUI would
  // set `aria-label` from the title, and the chip's accessible name would
  // become the explanation instead of "Service unreachable".
  return (
    <>
      <Tooltip title={UNREACHABLE_HINT} describeChild>
        <Chip
          size="small"
          variant="outlined"
          color="error"
          label={UNREACHABLE_LABEL}
          aria-describedby={hintId}
          sx={(t) => ({
            // The theme pins every chip to the 12px control radius
            // (`overrides/components/chip.js:124`); the spec's chips are pills,
            // and this one sits inline with `StatusChip`s that already are.
            borderRadius: RADIUS.pill,
            maxWidth: '100%',
            ...unreachableInkSx(t),
            ...(compact ? { [`& .${chipClasses.label}`]: { px: GAP.control } } : null),
          })}
        />
      </Tooltip>
      <Box component="span" id={hintId} sx={srOnlySx}>
        {UNREACHABLE_HINT}
      </Box>
    </>
  );
}

/* ── PageHeader ──────────────────────────────────────────────────────── */

export interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  /** ReactNode, not string — composition lines carry chips and links. */
  subtitle?: ReactNode;
  titleChips?: ReactNode;
  /**
   * Replaces the old `sample` boolean. ONE vocabulary for every screen, list
   * and record alike.
   */
  dataState?: DataState;
  /** Extra status chips ("Coming soon"). Must never contradict dataState. */
  status?: ReactNode;
  back?: { label: string; href: string } | { label: string; onClick: () => void };
  breadcrumbs?: Array<{ label: string; href?: string }>;
  /** Avatar / record icon slot, left of the title. */
  media?: ReactNode;
  /**
   * Right-aligned. The header is its own ActionRegion, and it inherits: a
   * page-level header has nothing above it and keeps its filled button, while a
   * `level="section"` header nested inside another region — GroupDetail's
   * header inside the families page — demotes, which is exactly what stops
   * `Add member` landing filled beside `Create Group`.
   */
  actions?: ReactNode;
  /** 'page' -> h1 at the h4 scale, mb 24. 'section' -> h2 at the h6 scale, mb 16. */
  level?: HeaderLevel;
  /** Override the heading ELEMENT only; semantics and visual size stay separable. */
  component?: ElementType;
  /**
   * Tabs + toolbar, rendered beneath with the standard 12px rhythm above.
   *
   * The slot owns the 24px gutter BENEATH it as well, so what you pass must
   * not carry a bottom margin of its own — the two add up to a 36px gap that
   * is on nobody's scale. `TabStrip level="section"` (`mb: 0`) is the pattern;
   * anything hand-rolled here drops its own `mb` and lets the slot space it.
   */
  below?: ReactNode;
  id?: string;
}

/**
 * One `h1` per page is a hard contract: `level="page"` emits it at the `h4`
 * scale and `level="section"` emits an `h2`, so an in-page section header is a
 * `PageHeader` rather than the hand-rolled `Box` + `Typography` that
 * `GroupDetail.tsx:141-167` and three of the four tool tabs each grew their own
 * version of. `component` overrides the ELEMENT alone, which is how a record
 * surface nested under a page keeps the right outline depth without shrinking
 * its type.
 */
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  titleChips,
  dataState,
  status,
  back,
  breadcrumbs,
  media,
  actions,
  level = 'page',
  component,
  below,
  id,
}: PageHeaderProps) {
  const isPage = level === 'page';

  /* Visual size and outline depth are separate decisions: the scale follows
   * `level`, the element follows `component` when the caller states one. */
  const headingEl: ElementType = component ?? (isPage ? 'h1' : 'h2');

  const trail =
    breadcrumbs && breadcrumbs.length > 0 ? (
      <Breadcrumbs>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          // The current page is never a link to itself, however it was passed.
          return crumb.href !== undefined && !isLast ? (
            <Link
              key={`${index}-${crumb.label}`}
              component={NextLink}
              href={crumb.href}
              variant="body2"
              underline="hover"
              color="text.secondary"
              sx={{ '&:focus-visible': { ...focusRingSx } }}
            >
              {crumb.label}
            </Link>
          ) : (
            <Typography
              key={`${index}-${crumb.label}`}
              variant="body2"
              color="text.primary"
              aria-current={isLast ? 'page' : undefined}
            >
              {crumb.label}
            </Typography>
          );
        })}
      </Breadcrumbs>
    ) : null;

  /* `href` routes through `Action`, which renders a `Button component={NextLink}`
   * — a real anchor with a real destination. The `onClick` form is the fallback
   * for a router push that has no URL of its own. Neither is a `Link
   * component="button"`. */
  const backLink = back ? (
    <Action
      role="quiet"
      size="compact"
      label={back.label}
      icon={<ChevronLeftIcon fontSize="small" />}
      href={'href' in back ? back.href : undefined}
      onClick={'onClick' in back ? back.onClick : NOOP}
    />
  ) : null;

  const headings = (
    <>
      {eyebrow ? (
        <Typography variant="overline" color="text.secondary" component="div" sx={{ mb: 0.25 }}>
          {eyebrow}
        </Typography>
      ) : null}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <Typography variant={isPage ? 'h4' : 'h6'} component={headingEl}>
          {title}
        </Typography>
        {titleChips}
        {dataState ? <ServiceStateChip state={dataState} /> : null}
        {status}
      </Box>
      {subtitle ? (
        // `component="div"`: the subtitle is a node now, and a chip or a list
        // inside a `<p>` is invalid markup that React re-parents on hydration.
        <Typography
          variant="body2"
          color="text.secondary"
          component="div"
          sx={{ mt: 0.5, maxWidth: 720 }}
        >
          {subtitle}
        </Typography>
      ) : null}
    </>
  );

  /* With `media` the left column becomes a row so the avatar sits beside the
   * title block; without it the markup stays exactly the predecessor's single
   * column, which is what keeps twelve migrated screens pixel-identical. */
  const leftSx: SxProps<Theme> = {
    minWidth: 0,
    flexGrow: 1,
    ...(media ? { display: 'flex', alignItems: 'center', gap: GAP.cluster } : null),
  };

  return (
    <Box id={id}>
      {trail || backLink ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: GAP.tight,
            mb: GAP.control,
          }}
        >
          {trail}
          {backLink}
        </Box>
      ) : null}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: GAP.cluster,
          // The slot owns the whole rhythm when it is filled: 12px from the
          // header to the controls here, and 24px from the slot to the content
          // beneath it (the `mb: GAP.page` wrapper further down). Both gutters
          // belong to the header, so whatever is passed as `below` must NOT
          // carry a bottom margin of its own — `TabStrip level="section"`
          // (`mb: 0`) is the pattern. A child that keeps its own `mb` sums with
          // the wrapper's 24 into a 36px gap that is on nobody's scale.
          mb: below ? GAP.cluster : isPage ? GAP.page : GAP.block,
        }}
      >
        <Box sx={leftSx}>
          {media ? (
            <>
              <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{media}</Box>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>{headings}</Box>
            </>
          ) : (
            headings
          )}
        </Box>
        {actions ? <ActionRow name={`${title} header`}>{actions}</ActionRow> : null}
      </Box>

      {below ? <Box sx={{ mb: GAP.page }}>{below}</Box> : null}
    </Box>
  );
}
