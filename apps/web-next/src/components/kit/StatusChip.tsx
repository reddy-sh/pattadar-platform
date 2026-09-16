'use client';

/**
 * The app's one chip vocabulary: tonal for a status, outlined for metadata.
 *
 * Until this file existed the same word was drawn four different ways on one
 * screen. `components/holdingCards.tsx:27-44` kept six raw hexes (`#cf1322`,
 * `#2e7d32`, `#1677ff`, `#8c8c8c`, `#d48806`) and `:77-88` mixed them against
 * a literal `#FFFFFF` and `#16191c` — the bug the founder named, because a
 * colour mixed against a hard-coded white stays a light-mode colour forever,
 * whatever scheme the reader picked. `views/detail/common.tsx:38-56` ran a
 * second and disagreeing map onto MUI's semantic colours, so `sold` was a grey
 * pill on a card and a neutral-filled chip in a table. `LandPropertiesPage`
 * then hand-built a third spelling per site: a filled type chip at `:628`, a
 * `primary.container` Khata chip with its own 8% hover mix at `:642-662`, two
 * outlined chips at `:665` and `:721`, a filled `error` litigation chip at
 * `:742`, and the header count chip at `:449`.
 *
 * The cure is to take the colour decision away from the caller entirely. A
 * caller names a TONE; `tokens.tonalSx` resolves it to the palette's
 * `container` / `onContainer` pair, which is defined once per scheme — so one
 * chip reads correctly on `background.default`, on a `Card`, in dark mode and
 * in highContrast (where the containers are white and `tonalSx` adds the 2px
 * `currentColor` edge that keeps them legible) with no second definition
 * anywhere. `RADIUS.pill` is what finally makes a chip read as a pill rather
 * than borrow the theme's 12px control radius.
 *
 * What this file deliberately does NOT know is domain law. `parcelPill`'s
 * "litigation outranks status" and `stakePill`'s "owned shows no second pill"
 * are rules about holdings, not about chips; they live in
 * `views/holdings/holdingPills.ts` and arrive here as a `PillSpec`. `toneFor`
 * is the opposite of that: a plain word→tone lookup a screen may use or ignore,
 * with no precedence, no fallbacks into other fields, and no opinion about
 * which of two statuses matters more.
 *
 * Two smaller things are load-bearing and easy to undo by accident. The MUI
 * `color` prop is passed even though `sx` paints every colour: without it the
 * chip is `filled` + `default`, and `theme/overrides/components/chip.js:44`
 * hangs an UNGATED `:hover` on that pair which flips a resting, non-clickable
 * chip to `grey[700]` under the pointer — visible today on any `sold` chip.
 * `neutral` is the one tone with no MUI colour to escape into, so it cancels
 * that hover with its own tokens. And `hint` is never only a tooltip: hover is
 * not an affordance a keyboard or a screen reader has, so the same sentence is
 * also mounted as a visually-hidden node that the chip points at through
 * `aria-describedby`.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { isValidElement, useId } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip, { chipClasses } from '@mui/material/Chip';
import type { ChipProps } from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import type { SxProps, Theme } from '@mui/material/styles';

import { pluralise, statusLabel } from './format';
import { RADIUS, focusRingSx, tonalSx } from './tokens';
import type { ChipKind, StatusTone } from './types';

/* ── Words ───────────────────────────────────────────────────────────── */

/**
 * The status words the app actually stores, in the normalised spelling
 * `toneFor` reduces to — hyphen, underscore and space are the same separator
 * as far as a tone is concerned, so `under_purchase` and `under purchase`
 * cannot disagree. `sold` and `watch` are listed rather than left to the
 * fallback because "this is deliberately quiet" and "we have never seen this
 * word" deserve to look different in the source even when they paint alike.
 */
const TONE_BY_WORD: Record<string, StatusTone> = {
  owned: 'success',
  registered: 'success',
  possession: 'success',
  accepted: 'success',
  sent: 'success',
  'for-sale': 'info',
  pending: 'info',
  'under-purchase': 'info',
  agreement: 'info',
  rental: 'info',
  disputed: 'error',
  litigation: 'error',
  failed: 'error',
  revoked: 'error',
  managed: 'warning',
  expired: 'warning',
  stale: 'warning',
  mortgaged: 'warning',
  sold: 'neutral',
  watch: 'neutral',
};

/**
 * Convenience only: a screen that already knows its tone should pass `tone`
 * and never call this. Unknown words go `neutral` on purpose — a status we do
 * not recognise has not earned red, and guessing is how the two predecessor
 * maps ended up disagreeing.
 */
export function toneFor(value: string): StatusTone {
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return TONE_BY_WORD[key] ?? 'neutral';
}

/* ── Shape ───────────────────────────────────────────────────────────── */

/** Tone → the MUI colour whose presence suppresses the theme's default hover. */
const MUI_COLOR: Record<StatusTone, ChipProps['color']> = {
  neutral: 'default',
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
  brand: 'primary',
};

/**
 * The house visually-hidden atom (same object as
 * `components/table/table-head-custom.js:12`): read by assistive technology,
 * out of flow, and — because it is absolutely positioned — not a flex item, so
 * mounting one beside a chip never opens an extra gap in the row around it.
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

/**
 * Everything both chip kinds share, plus the tonal fill for a status chip.
 * Heights are not set here: MUI's own `small` and `medium` are already the
 * spec's 24 and 32, and a second declaration is a second thing to drift.
 */
function chipSx(kind: ChipKind, tone: StatusTone): SxProps<Theme> {
  const shape = {
    borderRadius: RADIUS.pill,
    maxWidth: '100%',
    [`& .${chipClasses.icon}`]: { color: 'inherit' },
    '&:focus-visible': focusRingSx,
  };

  if (kind === 'metadata') {
    return {
      ...shape,
      bgcolor: 'transparent',
      borderColor: 'divider',
      color: 'text.secondary',
    };
  }

  const tonal = tonalSx(tone);
  return [
    shape,
    ...(Array.isArray(tonal) ? tonal : [tonal]),
    // `neutral` is the one tone that must stay MUI colour `default`, so it is
    // also the one that inherits chip.js's ungated filled hover. Pin it back.
    ...(tone === 'neutral'
      ? [{ '&:hover': { bgcolor: 'background.neutral', color: 'text.primary' } }]
      : []),
  ];
}

/* ── Chips ───────────────────────────────────────────────────────────── */

export interface StatusChipProps {
  /** Raw domain value; rendered through format.statusLabel unless `label` is given. */
  value?: string;
  label?: string;
  tone?: StatusTone;
  /** 'status' -> tonal container fill; 'metadata' -> outlined. Default 'status'. */
  kind?: ChipKind;
  icon?: ReactNode;
  /** 24px / 32px per spec. Default 'small'. */
  size?: 'small' | 'medium';
  /** Explains an unobvious status on hover AND as the accessible description. */
  hint?: string;
}

export function StatusChip({
  value,
  label,
  tone,
  kind = 'status',
  icon,
  size = 'small',
  hint,
}: StatusChipProps) {
  const hintId = useId();

  // An omitted tone falls back to the word map rather than to a house colour:
  // <StatusChip value="disputed" /> painting neutral would be a quiet lie.
  const resolved: StatusTone = tone ?? (value === undefined ? 'neutral' : toneFor(value));

  // MUI types the icon slot as an element. A caller who hands over a string or
  // an emoji gets it wrapped rather than silently dropped.
  const iconEl =
    icon === undefined || icon === null ? undefined : isValidElement(icon) ? (
      icon
    ) : (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
        {icon}
      </Box>
    );

  const chip = (
    <Chip
      size={size}
      variant={kind === 'metadata' ? 'outlined' : 'filled'}
      color={kind === 'metadata' ? 'default' : MUI_COLOR[resolved]}
      icon={iconEl}
      label={label ?? statusLabel(value)}
      aria-describedby={hint ? hintId : undefined}
      sx={chipSx(kind, resolved)}
    />
  );

  if (!hint) return chip;

  // `describeChild` keeps the tooltip a DESCRIPTION: left to itself MUI would
  // set aria-label from the title and the chip's accessible name would become
  // the explanation instead of the status. The hidden node carries the same
  // sentence for everyone who never hovers.
  return (
    <>
      <Tooltip title={hint} describeChild>
        {chip}
      </Tooltip>
      <Box component="span" id={hintId} sx={srOnlySx}>
        {hint}
      </Box>
    </>
  );
}

/** Sugar: `<StatusChip kind="metadata" tone="neutral" />`. */
export function MetaChip(props: Omit<StatusChipProps, 'kind'>) {
  return <StatusChip {...props} kind="metadata" tone={props.tone ?? 'neutral'} />;
}

export interface CountChipProps {
  count: number;
  noun: string;
  nounPlural?: string;
}

/**
 * The header count chip ("38 holdings"). It owns its own `Chip` rather than
 * delegating so it can carry `.tnum`: a count that re-renders as the filters
 * move must not jitter, and proportional digits are what makes it jitter.
 */
export function CountChip({ count, noun, nounPlural }: CountChipProps) {
  return (
    <Chip
      className="tnum"
      size="small"
      variant="filled"
      color={MUI_COLOR.brand}
      label={pluralise(count, noun, nounPlural)}
      sx={chipSx('status', 'brand')}
    />
  );
}
