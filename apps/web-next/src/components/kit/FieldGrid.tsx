'use client';

/**
 * The record-detail content vocabulary: one label/value pair, the grid that
 * arranges them, the "at a glance" counters above them, and the compact
 * two-column readout a spec sheet or a calculator result wants.
 *
 * Three things drove it out of the pages and in here.
 *
 * FORMATTING BELONGS TO THE KIT, NOT THE CALLER. The parcel page printed
 * `p.regDate` raw and its near-twin printed the same field through `fmtDMY`,
 * so one registration date read `2024-03-11` and the other `11/03/2024` on two
 * screens a user opens minutes apart. A `format` prop moves that decision to
 * one place: the caller says what a value *is*, never what it should look
 * like, and a register stops telling two stories about the same date.
 *
 * `minmax(0, 1fr)` IS THE MECHANISM, NOT A FLOURISH. A bare `1fr` track has a
 * min-content floor — the longest unbreakable run in it — so one long document
 * number or a survey string with no spaces pushed the whole grid wider than
 * the phone and took the page's horizontal scroll with it. `minmax(0, …)` is
 * what lets a track actually shrink, and `overflowWrap: 'anywhere'` on the
 * value is what makes the text break rather than the layout. Neither is
 * optional; removing either re-opens the 400px overflow.
 *
 * A COUNTER THAT NAVIGATES IS A CONTROL. The glance figures were `div`s
 * carrying an `onClick` — no tab stop, no focus ring, no name, nothing at all
 * for a keyboard or a screen reader. Here an item with an `onActivate` is a
 * real button with a 44px target and the name `"3 Owners on record"`; an item
 * without one is inert markup rather than a control that only a mouse can find.
 *
 * The label is the type system's label role (`overline`), which is also why
 * the old hard-coded `'label:'` colon is gone — a colon is punctuation doing a
 * typographic job the scale already does.
 *
 * Extracted from `src/views/detail/common.tsx:90-101` (`Field`) and `:103-116`
 * (`FieldGrid`); the byte-identical `glance` helpers at
 * `src/views/detail/ParcelDetailPage.tsx:789-796` and
 * `src/views/detail/PropertyDetailPage.tsx:548-555`; the raw-ISO dates at
 * `ParcelDetailPage.tsx:873,885-888` against the same fields formatted at
 * `PropertyDetailPage.tsx:620-629`; and the label/figure readout of
 * `src/views/tools/CalculatorTool.tsx:60-71` (`AreaResult`), whose `<Table>`
 * was never a table of data.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

import type { FieldFormat, FieldSpec, GlanceItem } from './types';
import { GAP, RADIUS, TOUCH, focusRingSx, quietSurfaceSx } from './tokens';
import { areaOrDash, dash, dmy, inrOrDash, numOrDash } from './format';

/* ── Value rendering ─────────────────────────────────────────────────── */

/** The formats that produce a figure, and therefore earn tabular numerals. */
const FIGURE_FORMATS: readonly FieldFormat[] = ['money', 'number', 'area'];

function tnumClass(format?: FieldFormat): string | undefined {
  return format !== undefined && FIGURE_FORMATS.includes(format) ? 'tnum' : undefined;
}

/**
 * Absent the way a reader means it — nothing was recorded. Zero is a figure
 * and renders as one; only null, undefined and the empty string are absence.
 */
function isBlank(value: FieldSpec['value']): boolean {
  return value === null || value === undefined || value === '';
}

/** A value the kit may still format, as opposed to a node the caller built. */
function isRaw(value: FieldSpec['value']): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * A figure, or `null` when the value is prose. A numeric string is a figure —
 * the API hands several of them over as strings — but "Not disclosed" is not,
 * and must survive rather than collapse into an em-dash.
 */
function asFigure(value: string | number): number | null {
  const n = typeof value === 'number' ? value : Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * The format applied once, here. `date` goes through `dmy`, which returns an
 * unparseable string unchanged rather than `Invalid Date`; the three figure
 * formats fall back to the caller's own text when the value is not a number.
 */
function formatted(value: FieldSpec['value'], format?: FieldFormat): ReactNode {
  if (isBlank(value)) return dash;
  if (!isRaw(value)) return value;
  switch (format) {
    case 'date':
      return dmy(String(value));
    case 'money': {
      const n = asFigure(value);
      return n === null ? value : inrOrDash(n);
    }
    case 'area': {
      const n = asFigure(value);
      return n === null ? value : areaOrDash(n);
    }
    case 'number': {
      const n = asFigure(value);
      return n === null ? value : numOrDash(n);
    }
    default:
      // 'phone', 'text' and undefined: the value as the caller gave it.
      return value;
  }
}

/* ── Field ───────────────────────────────────────────────────────────── */

export interface FieldProps extends FieldSpec {
  /** A labelled action beside the value (Edit, Copy). */
  action?: ReactNode;
}

/**
 * One label/value pair. Stacked rather than inline because `overline` is the
 * label role, not a prefix — which is what retired the `'label:'` colon.
 */
export function Field({ label, value, format, span, hint, action }: FieldProps) {
  return (
    <Box
      sx={{
        minWidth: 0,
        // Below md the grid has ONE track, and `span 2` there would conjure an
        // implicit second column — the overflow the minmax tracks exist to stop.
        gridColumn: span !== undefined && span > 1 ? { xs: 'auto', md: `span ${span}` } : undefined,
      }}
    >
      <Typography variant="overline" color="text.secondary" component="div" sx={{ mb: GAP.tight }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: GAP.control, minWidth: 0 }}>
        <Typography
          variant="body2"
          component="div"
          className={tnumClass(format)}
          sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
        >
          {formatted(value, format)}
        </Typography>
        {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
      </Box>
      {hint ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: GAP.tight }}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

/* ── FieldGrid ───────────────────────────────────────────────────────── */

export interface FieldGridProps {
  fields: FieldSpec[];
  /** Columns at md+. Always 1 below sm. Default 2. */
  columns?: 1 | 2 | 3;
  /** Drop empty fields rather than printing a column of dashes. Default false. */
  hideEmpty?: boolean;
}

/** A span can never exceed the tracks that exist to hold it. */
function clampSpan(span: 1 | 2 | 3 | undefined, columns: 1 | 2 | 3): 1 | 2 | 3 | undefined {
  if (span === undefined) return undefined;
  return span <= columns ? span : columns;
}

/**
 * The definition grid. The caller owns the array and its order — a deed's
 * fields are in a legal sequence, and no rule about which of them exist or
 * where they sit belongs in here.
 */
export function FieldGrid({ fields, columns = 2, hideEmpty = false }: FieldGridProps) {
  const shown = hideEmpty ? fields.filter((f) => !isBlank(f.value)) : fields;
  if (shown.length === 0) return null;
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
      {shown.map((field, i) => (
        <Field
          key={`${field.label}-${i}`}
          {...field}
          span={clampSpan(field.span, columns)}
        />
      ))}
    </Box>
  );
}

/* ── GlanceRow ───────────────────────────────────────────────────────── */

/**
 * Shared metrics so a row of mixed items — some navigating, some not — still
 * lines up. `as const satisfies` keeps the literal type, which is what lets
 * the interactive variant spread it and add a hover layer.
 */
const glanceItemSx = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: GAP.tight,
  minWidth: 84,
  minHeight: TOUCH,
  px: GAP.control,
  py: GAP.tight,
  borderRadius: RADIUS.control,
  textAlign: 'left',
  '&:focus-visible': focusRingSx,
} as const satisfies SxProps<Theme>;

interface GlanceRowProps {
  items: GlanceItem[];
}

/**
 * "At a glance" counters. An item with `onActivate` is a `ButtonBase` — a real
 * tab stop with a real name — and an item without one is a plain `div`. There
 * is deliberately no third case: a `div` with an `onClick` is what this
 * component exists to delete.
 *
 * The `${count} ${label}` name is the button's alone. A plain item is a `div`,
 * whose implicit `generic` role ARIA forbids naming, so an `aria-label` there
 * is discarded rather than announced; its two children already read "3" then
 * "Owners on record", which is the same sentence.
 */
export function GlanceRow({ items }: GlanceRowProps) {
  if (items.length === 0) return null;
  return (
    <Box sx={{ ...quietSurfaceSx, display: 'flex', flexWrap: 'wrap', gap: GAP.page }}>
      {items.map((item) => {
        const name = `${item.count} ${item.label}`;
        const body = (
          <>
            <Typography
              className="tnum"
              component="div"
              sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}
            >
              {item.count}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              {item.label}
            </Typography>
          </>
        );
        return item.onActivate ? (
          <ButtonBase
            key={item.key}
            onClick={item.onActivate}
            aria-label={name}
            sx={{ ...glanceItemSx, '&:hover': { bgcolor: 'action.hover' } }}
          >
            {body}
          </ButtonBase>
        ) : (
          <Box key={item.key} sx={glanceItemSx}>
            {body}
          </Box>
        );
      })}
    </Box>
  );
}

/* ── KeyValueList ────────────────────────────────────────────────────── */

interface KeyValueListProps {
  rows: Array<{ label: string; value: ReactNode; format?: FieldFormat }>;
}

/**
 * The compact readout — spec sheets, unit conversions, calculator results.
 * A real `<dl>`, because that is what the `<Table>` at `CalculatorTool.tsx:60`
 * was pretending to be: term and definition, not rows of data. The value track
 * is `minmax(0, auto)` so a long figure shrinks instead of shoving the label
 * off the phone.
 */
export function KeyValueList({ rows }: KeyValueListProps) {
  if (rows.length === 0) return null;
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto)',
        columnGap: GAP.block,
        rowGap: GAP.tight,
        alignItems: 'baseline',
      }}
    >
      {rows.map((row, i) => (
        <Fragment key={`${row.label}-${i}`}>
          <Typography
            component="dt"
            variant="body2"
            color="text.secondary"
            sx={{ minWidth: 0, overflowWrap: 'anywhere' }}
          >
            {row.label}
          </Typography>
          <Typography
            component="dd"
            variant="body2"
            className={tnumClass(row.format)}
            sx={{
              m: 0,
              fontWeight: 600,
              textAlign: 'right',
              minWidth: 0,
              overflowWrap: 'anywhere',
            }}
          >
            {formatted(row.value, row.format)}
          </Typography>
        </Fragment>
      ))}
    </Box>
  );
}
