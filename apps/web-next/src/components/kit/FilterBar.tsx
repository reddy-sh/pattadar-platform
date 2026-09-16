'use client';

/**
 * A filter, declared once.
 *
 * On the canonical screen a single filter is currently written out five times:
 * an option builder (`LandPropertiesPage.tsx:413-417`), a control in the panel
 * (`:539-566`), a branch in the collapsed chip row (`:569-605`), a slot in the
 * count array (`:254`) and a line in the reset (`:255-261`). Nothing holds the
 * five copies together, so they drift — which is why the passbook chip has to
 * re-scan `data.passbooks` inside an inline IIFE at `:590-593` to recover the
 * label its own option builder already computed twelve lines earlier. Here a
 * screen states `FilterField` once and the panel, the chips, the count, Clear
 * and the cascade are all read off that one statement.
 *
 * The defect this file exists to kill, though, is `flabel` (`:377-385`): a
 * detached `Typography` painted above the control, tied to it by proximity and
 * nothing else. Five comboboxes on the busiest screen in the app therefore have
 * no accessible name at all — a screen reader announces five identical
 * "combobox"es and the user has to guess. `flabel` is deleted rather than
 * ported; every control here is a real `TextField label=…`, so the name is the
 * label, structurally, and cannot be lost again. (`shrink` is pinned because
 * the placeholder `MenuItem` renders at `value=""`, and an unshrunk MUI label
 * would sit on top of it.)
 *
 * `undefined` stays the only no-filter value. `''` belongs to the placeholder
 * option and is converted at the boundary — `e.target.value || undefined`,
 * `:400` — because two spellings of "no filter" is how a filter ends up
 * un-clearable.
 *
 * Hiding a control is NOT clearing it, and the distinction is load-bearing:
 * Properties hides Kind off the All tab (`:542`) and Passbook on the Properties
 * tab (`:560`) while both stay applied to the rows. So `visible(ctx)` governs
 * the control and `clearWhenHidden` — default FALSE — governs the value, and
 * the chip row deliberately keeps showing an applied-but-hidden filter, since a
 * filter you cannot see and cannot remove is worse than one you can.
 *
 * Two smaller inversions. The trigger is never `contained`: at `:517-524` it
 * flips to filled the moment a filter is active and lands a second filled
 * button beside the filled Add — so a state control started competing with the
 * page's one decision. It is `tertiary` when clean and tonal when active, and
 * it finally carries the `aria-expanded` / `aria-controls` pair that makes it a
 * disclosure rather than a mystery. And `FilterShortcutChip` — the card chip
 * that sets a page filter, `:642-674` — renders genuinely inert without
 * `onActivate`, because today an empty-passbook Khata chip lights up under the
 * pointer and does nothing at all.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FilterListIcon from '@mui/icons-material/FilterList';
import type { SxProps, Theme } from '@mui/material/styles';

import type { ChipProps } from '@mui/material/Chip';

import { Action, LinkAction } from './Action';
import { GAP, RADIUS, TOUCH, focusRingSx, quietSurfaceSx, stateLayer, tonalSx } from './tokens';
import type {
  FilterField,
  FilterOption,
  FilterValues,
  KitMouseHandler,
  StatusTone,
} from './types';

/**
 * Tone → the MUI colour whose mere presence suppresses the theme's ungated
 * `default + filled` hover rule (`theme/overrides/components/chip.js:33-45`).
 * `StatusChip` declares the same six pairs privately; neither is exported,
 * because the kit contract closes `StatusChip`'s API at its five components and
 * the barrel re-exports everything a leaf exports. The map is a restatement of
 * the palette's own role names, not a second source of truth for the fill — the
 * visible colour is always `tonalSx`'s, pinned in `sx`.
 */
const MUI_COLOR: Record<StatusTone, ChipProps['color']> = {
  neutral: 'default',
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
  brand: 'primary',
};

/* ── Reading a declaration ───────────────────────────────────────────── */

/**
 * The one test for "this filter is applied". `''` is the placeholder option's
 * value, never a filter, so it is rejected here rather than at each call site.
 */
function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

export function activeFilterCount(values: FilterValues): number {
  return Object.values(values).filter(isSet).length;
}

/** Static options or a builder over the screen's own dataset — same shape out. */
export function resolveFilterOptions<Ctx>(field: FilterField<Ctx>, ctx: Ctx): FilterOption[] {
  return typeof field.options === 'function' ? field.options(ctx) : field.options;
}

/**
 * The collapsed chip's text. A declared `chipLabel` wins; otherwise the label
 * the option already carries is reused — which is the whole reason the chip row
 * no longer re-derives anything from the raw dataset. Falling back to the raw
 * value keeps a stale deep link readable instead of blank.
 */
export function filterChipLabel<Ctx>(field: FilterField<Ctx>, value: string, ctx: Ctx): string {
  if (field.chipLabel) return field.chipLabel(value, ctx);
  return resolveFilterOptions(field, ctx).find((option) => option.value === value)?.label ?? value;
}

function isVisible<Ctx>(field: FilterField<Ctx>, ctx: Ctx): boolean {
  return field.visible ? field.visible(ctx) : true;
}

/**
 * Every write to the filter state, in one pass, so the panel and the chip row
 * cannot cascade differently: set the changed key, reset the keys it `clears`
 * (district → mandal → village, where the narrower value is now meaningless),
 * then drop any field that has gone invisible AND asked to be cleared. Removing
 * a chip runs the same pass for the same reason — clearing a district while its
 * village survives is exactly the state the cascade exists to prevent.
 */
function applyFilter<Ctx>(
  fields: FilterField<Ctx>[],
  values: FilterValues,
  ctx: Ctx,
  key: string,
  value: string | undefined,
): FilterValues {
  const next: FilterValues = { ...values, [key]: value };
  for (const cleared of fields.find((field) => field.key === key)?.clears ?? []) {
    next[cleared] = undefined;
  }
  for (const field of fields) {
    if (field.clearWhenHidden === true && !isVisible(field, ctx)) next[field.key] = undefined;
  }
  return next;
}

/* ── Panel ───────────────────────────────────────────────────────────── */

/**
 * MUI's select renders its display as a `combobox`; the fallbacks cover the
 * Clear button on a panel whose every field is hidden on the current tab.
 */
const FIRST_CONTROL = '[role="combobox"], .MuiSelect-select, button';

export interface FilterPanelProps<Ctx> {
  fields: FilterField<Ctx>[];
  values: FilterValues;
  ctx: Ctx;
  /** Receives the FULL next values object, with cascades already applied. */
  onChange: (next: FilterValues) => void;
  onClear: () => void;
  open: boolean;
  onClose: () => void;
  /** Must match FilterTrigger's `controls`. */
  id: string;
}

export function FilterPanel<Ctx>({
  fields,
  values,
  ctx,
  onChange,
  onClear,
  open,
  onClose,
  id,
}: FilterPanelProps<Ctx>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(open);
  const count = activeFilterCount(values);

  // Only on the false→true transition. A panel that is open at mount because
  // the URL said so has not been "opened" by anyone, and stealing focus from
  // the top of a freshly loaded page is a worse bug than the one this fixes.
  useEffect(() => {
    const opened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opened) return;
    rootRef.current?.querySelector<HTMLElement>(FIRST_CONTROL)?.focus();
  }, [open]);

  const shown = fields.filter((field) => isVisible(field, ctx));

  return (
    <Collapse
      in={open}
      ref={rootRef}
      id={id}
      role="group"
      aria-label="Filters"
      // Escape inside an open select is stopped by MUI's own modal handler, so
      // this only ever sees the panel's own Escape and never closes both.
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        // Closing hides the panel with `visibility: hidden`, which blurs
        // whatever was focused inside it to <body> and drops the keyboard user
        // at the top of the tab order. The trigger is found by the back
        // reference it already has to declare — `aria-controls={id}` — so the
        // return path needs no extra prop and cannot go stale against one.
        document.querySelector<HTMLElement>(`[aria-controls="${id}"]`)?.focus();
        onClose();
      }}
    >
      <Box sx={{ ...quietSurfaceSx, mb: GAP.cluster }}>
        <Box
          sx={{
            display: 'flex',
            gap: GAP.cluster,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          {shown.map((field) => (
            <Box key={field.key} sx={{ minWidth: field.minWidth ?? 170, flex: 1 }}>
              <TextField
                select
                size="small"
                fullWidth
                label={field.label}
                value={values[field.key] ?? ''}
                onChange={(event) =>
                  onChange(
                    applyFilter(fields, values, ctx, field.key, event.target.value || undefined),
                  )
                }
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">{field.placeholder}</MenuItem>
                {resolveFilterOptions(field, ctx).map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          ))}
          <Action role="quiet" label="Clear" onClick={onClear} disabled={count === 0} />
        </Box>
      </Box>
    </Collapse>
  );
}

/* ── Trigger ─────────────────────────────────────────────────────────── */

export interface FilterTriggerProps {
  activeCount: number;
  open: boolean;
  onToggle: () => void;
  controls: string;
}

/**
 * NEVER contained — it is a state control, not a decision. `tertiary` when
 * clean, `secondary` (tonal) when filters are active.
 *
 * It is an `Action` like every other button in the kit: `ActionProps` carries
 * `aria-expanded` / `aria-controls` (`Action.tsx:395-397`), so the second
 * spelling of the role → variant/color mapping this used to need is gone, and
 * with it the hole it left — a toolbar control outside the claim registry, the
 * composed focus ring, the compact hit box and the on-dark hero spelling.
 * `aria-haspopup` is deliberately NOT set: the panel is a `role="group"`
 * disclosure, and `haspopup` would announce a menu that does not exist.
 */
export function FilterTrigger({ activeCount, open, onToggle, controls }: FilterTriggerProps) {
  const active = activeCount > 0;
  return (
    <Action
      role={active ? 'secondary' : 'tertiary'}
      label={`Filters${active ? ` (${activeCount})` : ''}`}
      icon={<FilterListIcon />}
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
    />
  );
}

/* ── Collapsed summary ───────────────────────────────────────────────── */

const neutralFill = tonalSx('neutral');

/**
 * `Action`'s `COMPACT_HIT_BOX` (`Action.tsx:131-137`) applied to a chip: a small
 * MUI chip is pinned to 24px, so an invisible band, centred on it and
 * full-width, restores the 44x44 target without touching the pill's height.
 * Mounted ONLY where the chip is pressable — a resting `StatusChip` and an
 * inert shortcut chip are not targets and must not claim the space of one —
 * and neither is a removable chip's BODY, which is why that chip grows its ✕
 * instead (`REMOVE_HIT_BOX` below).
 */
const TOUCH_BAND = {
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: '50% 0 0 0',
    transform: 'translateY(-50%)',
    height: TOUCH,
  },
} as const;

/**
 * The removable chip. It is neutral-tonal rather than MUI's filled default,
 * which the donor theme paints `text.primary` with white text
 * (`theme/overrides/components/chip.js:37-56`) — a near-black pill on a quiet
 * surface, an accident of `filled` meeting `default` rather than a decision.
 * That same rule hangs an ungated `:hover` on the pair, so the resting colours
 * are pinned back the way `StatusChip` pins them.
 *
 * The pill stays 24px tall — spec "Chips" pins the two sizes at 24/32 — and the
 * body stays INERT: on the reference screen (`:569-605`) only the ✕ removes a
 * filter, and a pill that deletes wherever you touch it is a trap with no undo.
 * So the target grows on the ✕ alone: 16px of glyph in a 44 × 32 hit box, made
 * of padding (`content-box`, or the border-box width would eat the icon) with
 * the negative margins that cancel it, so the pill's geometry is unchanged to
 * the pixel. It grows LEFT, over the chip's own inert label, and stops at the
 * pill's right edge, so it never reaches a neighbouring chip; vertically it
 * takes the 8px the row leaves between wrapped lines and no more, so two rows
 * of chips meet without overlapping. 32 is short of the 44px gate — a 24px pill
 * 8px from its neighbour cannot hold 44 without stealing the neighbour's taps —
 * and the shortfall is the pill height the spec pins, recorded here rather than
 * papered over with a band that deletes the wrong filter.
 */
const REMOVE_HIT_BOX = {
  '& .MuiChip-deleteIcon': {
    boxSizing: 'content-box',
    padding: '8px 4px 8px 24px',
    margin: '-8px 0 -8px -28px',
  },
} as const;

const removableChipSx: SxProps<Theme> = [
  { borderRadius: RADIUS.pill, maxWidth: '100%', '&:focus-visible': { ...focusRingSx } },
  ...(Array.isArray(neutralFill) ? neutralFill : [neutralFill]),
  { '&:hover': { bgcolor: 'background.neutral', color: 'text.primary' } },
  REMOVE_HIT_BOX,
];

export interface FilterChipRowProps<Ctx> {
  fields: FilterField<Ctx>[];
  values: FilterValues;
  ctx: Ctx;
  onChange: (next: FilterValues) => void;
  onClear: () => void;
  /** Opens the panel; renders the "Edit" affordance. */
  onEdit?: () => void;
  /** Show even while the panel is open. Default true — the summary must not vanish. */
  alwaysVisible?: boolean;
  /** Extra non-field chips, e.g. the live search term. */
  extra?: Array<{ key: string; label: string; onDelete: () => void }>;
}

/**
 * Every chip derived from the same `fields` + `values` the panel reads, which
 * is what retires the five bespoke branches at `:569-605`. A chip is named for
 * what removing it does — "Status: for sale, remove filter" — because "for
 * sale" alone tells a screen-reader user neither which filter it belongs to nor
 * that it can be taken off.
 */
export function FilterChipRow<Ctx>({
  fields,
  values,
  ctx,
  onChange,
  onClear,
  onEdit,
  alwaysVisible = true,
  extra,
}: FilterChipRowProps<Ctx>) {
  // The row is not told whether the panel is open, so this is the only
  // visibility decision it can make: false means the caller is presenting the
  // active filters itself. It is never passed by the scaffolds.
  if (!alwaysVisible) return null;

  const chips: Array<{ key: string; label: string; name: string; onDelete: () => void }> = [];

  for (const field of fields) {
    const value = values[field.key];
    // Deliberately not gated on `visible(ctx)`: a filter that is applied but
    // whose control is hidden on this tab must still be visible and removable.
    if (!isSet(value)) continue;
    const text = filterChipLabel(field, value, ctx);
    chips.push({
      key: field.key,
      label: text,
      name: `${field.label}: ${text}, remove filter`,
      onDelete: () => onChange(applyFilter(fields, values, ctx, field.key, undefined)),
    });
  }

  for (const item of extra ?? []) {
    chips.push({
      key: `extra:${item.key}`,
      label: item.label,
      name: `${item.label}, remove filter`,
      onDelete: item.onDelete,
    });
  }

  if (chips.length === 0) return null;

  return (
    <Box
      sx={{
        ...quietSurfaceSx,
        px: GAP.cluster,
        py: GAP.control,
        mb: GAP.cluster,
        display: 'flex',
        alignItems: 'center',
        gap: GAP.control,
        flexWrap: 'wrap',
      }}
    >
      <Typography variant="caption" color="text.secondary">
        Filtered by
      </Typography>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          size="small"
          label={chip.label}
          aria-label={chip.name}
          // `onDelete` and nothing else. A deletable MUI chip is focusable and
          // answers Backspace and Delete, so the accessible name's promise is
          // keyboard-reachable; adding `onClick` would also make the whole pill
          // a remove target, which is neither what the reference does nor what
          // anyone pointing at a label expects.
          onDelete={chip.onDelete}
          sx={removableChipSx}
        />
      ))}
      <Box sx={{ ml: 'auto', display: 'flex', gap: GAP.cluster }}>
        {onEdit && <LinkAction label="Edit" trailingChevron onClick={onEdit} />}
        <LinkAction label="Clear all" onClick={onClear} />
      </Box>
    </Box>
  );
}

/* ── Shortcut chip ───────────────────────────────────────────────────── */

const unnamedShortcuts = new Set<string>();

/** Dev-time only, once per label: a nameless shortcut is unusable by keyboard. */
function warnUnnamedShortcut(label: string): void {
  if (process.env.NODE_ENV === 'production' || unnamedShortcuts.has(label)) return;
  unnamedShortcuts.add(label);
  console.error(
    `FilterShortcutChip "${label}" sets a filter but has no actionLabel: name what pressing it does, e.g. "Filter by khata 1234".`,
  );
}

function shortcutChipSx(
  tone: StatusTone,
  variant: 'tonal' | 'outlined',
  interactive: boolean,
  pressed: boolean,
): SxProps<Theme> {
  const tonal = tonalSx(tone);
  return [
    { borderRadius: RADIUS.pill, maxWidth: '100%', '&:focus-visible': { ...focusRingSx } },
    ...(variant === 'outlined'
      ? [{ bgcolor: 'transparent', borderColor: 'divider', color: 'text.secondary' }]
      : [...(Array.isArray(tonal) ? tonal : [tonal]), { fontWeight: 600 }]),
    // The hover is the ONLY affordance, so it is mounted only where there is
    // something to press — the inert chip keeps the resting fill and the
    // default cursor MUI already gives a non-clickable chip. The 44px band
    // rides with it for the same reason: nothing to press, nothing to target.
    ...(interactive
      ? [
          TOUCH_BAND,
          (t: Theme) => ({
            transition: t.transitions.create(['background-color', 'box-shadow'], {
              duration: t.transitions.duration.shorter,
            }),
            '&:hover': { backgroundColor: stateLayer('primary', 8)(t) },
          }),
        ]
      : []),
    // An inset ring rather than a heavier fill: it reads as "on" against the
    // tonal and the outlined variant alike, and in all three schemes.
    ...(pressed
      ? [(t: Theme) => ({ boxShadow: `inset 0 0 0 2px ${(t.vars ?? t).palette.primary.main}` })]
      : []),
  ];
}

export interface FilterShortcutChipProps {
  label: string;
  /** Sets a filter from inside a card or row. Calls stopPropagation for you. */
  onActivate?: () => void;
  /** Already the active filter — renders pressed, with aria-pressed. */
  pressed?: boolean;
  tone?: StatusTone;
  variant?: 'tonal' | 'outlined';
  /** Names what pressing it does: "Filter by khata 1234". REQUIRED with onActivate. */
  actionLabel?: string;
}

/**
 * The card-chip-sets-a-page-filter pattern, made honest. `stopPropagation` is
 * handled here because every one of these sits inside a card that is itself a
 * link, and forgetting it navigates away instead of filtering.
 */
export function FilterShortcutChip({
  label,
  onActivate,
  pressed,
  tone = 'brand',
  variant = 'tonal',
  actionLabel,
}: FilterShortcutChipProps) {
  const activate = onActivate;
  if (activate && !actionLabel) warnUnnamedShortcut(label);

  const handleClick: KitMouseHandler | undefined = activate
    ? (event) => {
        event.stopPropagation();
        activate();
      }
    : undefined;

  return (
    <Chip
      size="small"
      variant={variant === 'outlined' ? 'outlined' : 'filled'}
      // The tone's real MUI colour, which is what keeps a filled chip out of the
      // donor theme's `default + filled` branch: that rule paints the pill
      // `text.primary` and hangs an UNGATED `:hover` on it
      // (`theme/overrides/components/chip.js:33-45`), so without a colour an
      // inert chip turns near-black under a pointer it does not answer.
      // `StatusChip` escapes it the same way, and `neutral` is the one tone
      // that must stay `default` there too. The visible fill is unchanged — it
      // is `tonalSx`'s, pinned in `sx`.
      color={variant === 'outlined' ? 'default' : MUI_COLOR[tone]}
      label={label}
      aria-label={activate ? actionLabel : undefined}
      aria-pressed={activate && pressed !== undefined ? pressed : undefined}
      onClick={handleClick}
      sx={shortcutChipSx(tone, variant, activate !== undefined, pressed === true)}
    />
  );
}
