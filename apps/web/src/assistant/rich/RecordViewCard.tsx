import { memo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { exportCsv, exportExcel, exportMarkdownPdf, exportPdf, pdfSafe } from '../../export/exporters';
import type { ExportBrand, ExportCol } from '../../export/exporters';
import { Markdown } from '../markdown/LazyMarkdown';
import { tableSx } from '../markdown/MarkdownLite';
import { VIEW_PREVIEW_ROWS, WRAPPED_COLUMNS, confidenceLevel, formatCell, isConfidence, isNumeric } from '../format';
import type { RecordView, ViewCell } from '../types';
import { RateChart, isRateView } from './RateChart';
import { SummaryCards } from './SummaryCards';

/**
 * The record table: the shared markdown table plus row hover and a sticky
 * header that stays opaque. Fixed layout with reader-sized columns: a cell
 * keeps to one line and ends in an ellipsis (full text in its title), so rows
 * never stretch and the table scrolls sideways instead of clipping.
 */
const viewTableSx = {
  ...tableSx,
  tableLayout: 'fixed',
  '& th, & td': { ...tableSx['& th, & td'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& th': { ...tableSx['& th'], boxShadow: (theme: { palette: { divider: string } }) => `inset 0 -1px 0 ${theme.palette.divider}` },
  '& tbody tr': { transition: 'background-color 120ms ease' },
  '& tbody tr:hover': { bgcolor: 'action.selected' },
  '@media (prefers-reduced-motion: reduce)': { '& tbody tr': { transition: 'none' } },
} as const;

/** macOS-style overlay scrollbar on every platform: a thin rounded thumb
 *  that shows while the pointer is over the table or it is scrolled by
 *  keyboard, and stays out of the way otherwise. */
const macScrollbarSx = {
  scrollbarWidth: 'thin',
  scrollbarColor: 'transparent transparent',
  '&:hover, &:focus-within': { scrollbarColor: (theme: { palette: { text: { disabled: string } } }) => `${theme.palette.text.disabled} transparent` },
  '&::-webkit-scrollbar': { width: 8, height: 8 },
  '&::-webkit-scrollbar-track': { background: 'transparent' },
  '&::-webkit-scrollbar-thumb': { background: 'transparent', borderRadius: 8 },
  '&:hover::-webkit-scrollbar-thumb, &:focus-within::-webkit-scrollbar-thumb': { bgcolor: 'text.disabled' },
} as const;

export const EXPORT_BRAND_SUBTITLE = 'Historical public records - reference only, may contain errors; not proof of identity, ownership or title';

export function exportBase(view: RecordView): string {
  const slug = view.title.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `pattadar-${slug || 'records'}-${new Date().toISOString().slice(0, 10)}`;
}

/** Export columns for one view; the PDF's built-in fonts cannot draw ₹. */
export function exportColumns(view: RecordView, forPdf: boolean): ExportCol<Record<string, ViewCell>>[] {
  return (view.columns ?? []).map((column) => ({
    key: column.key,
    title: column.label.replace('₹', forPdf ? 'Rs.' : '₹'),
    fmt: (value: ViewCell) => {
      const text = formatCell(column.key, value);
      return forPdf ? pdfSafe(text === '—' ? '' : text) : text === '—' ? '' : text;
    },
  }));
}

export async function exportView(view: RecordView, format: 'pdf' | 'excel' | 'csv') {
  const brand: ExportBrand = {
    brand: 'Pattadar',
    title: pdfSafe(view.title),
    subtitle: EXPORT_BRAND_SUBTITLE.replace('·', '-'),
    watermark: 'PATTADAR',
  };
  const base = exportBase(view);
  if (view.kind === 'report') {
    await exportMarkdownPdf(`${base}.pdf`, brand, view.markdown ?? '');
  } else if (format === 'csv') {
    exportCsv(`${base}.csv`, exportColumns(view, false), view.rows ?? []);
  } else if (format === 'excel') {
    await exportExcel(`${base}.xlsx`, { ...brand, title: view.title }, exportColumns(view, false), view.rows ?? []);
  } else {
    await exportPdf(`${base}.pdf`, brand, exportColumns(view, true), view.rows ?? []);
  }
}

export function ViewExportMenu({ view }: { view: RecordView }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);
  const run = (format: 'pdf' | 'excel' | 'csv') => {
    setAnchor(null);
    exportView(view, format).then(() => setFailed(false), () => setFailed(true));
  };
  const formats: Array<['pdf' | 'excel' | 'csv', string]> =
    view.kind === 'report' ? [['pdf', 'PDF']] : [['pdf', 'PDF'], ['excel', 'Excel (.xlsx)'], ['csv', 'CSV']];
  return (
    <>
      <Tooltip title={failed ? 'Download failed — try again' : 'Download'}>
        <IconButton
          size="small"
          aria-label={`Download ${view.title}`}
          aria-haspopup="menu"
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ p: 0.25, color: failed ? 'error.main' : undefined }}
        >
          <DownloadOutlinedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {formats.map(([format, label]) => (
          <MenuItem key={format} dense onClick={() => run(format)}>{label}</MenuItem>
        ))}
      </Menu>
    </>
  );
}

const COLUMN_MIN = 64;
const COLUMN_MAX = 640;
const COLUMN_STEP = 16;

/** A column's starting width: long text gets room, numbers and match scores less. */
/** Wide enough for the column's longest value (and its label), so an id like
 *  a RID shows whole; long free text stays capped and ends in an ellipsis. */
function defaultColumnWidth(key: string, label: string, rows: Array<Record<string, ViewCell>>): number {
  const longest = Math.max(label.length, ...rows.map((row) => formatCell(key, row[key]).length));
  const cap = WRAPPED_COLUMNS.has(key) ? 240 : 320;
  return Math.min(Math.max(Math.ceil(longest * 7.5) + 28, 72), cap);
}

/** The drag handle on a header cell's right edge: pointer, arrow keys, Home/End, double-click resets. */
function ColumnResizer({ label, width, onWidth, onReset }: {
  label: string; width: number; onWidth: (width: number) => void; onReset: () => void;
}) {
  const [drag, setDrag] = useState<{ x: number; width: number } | null>(null);
  const set = (value: number) => onWidth(Math.round(Math.min(Math.max(value, COLUMN_MIN), COLUMN_MAX)));
  return (
    <Box
      component="span"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={width}
      aria-valuemin={COLUMN_MIN}
      aria-valuemax={COLUMN_MAX}
      tabIndex={0}
      onPointerDown={(event: ReactPointerEvent<HTMLSpanElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ x: event.clientX, width });
      }}
      onPointerMove={(event: ReactPointerEvent<HTMLSpanElement>) => drag && set(drag.width + event.clientX - drag.x)}
      onPointerUp={(event: ReactPointerEvent<HTMLSpanElement>) => {
        if (!drag) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
      onDoubleClick={onReset}
      onKeyDown={(event: ReactKeyboardEvent<HTMLSpanElement>) => {
        const next = event.key === 'ArrowRight' ? width + COLUMN_STEP : event.key === 'ArrowLeft' ? width - COLUMN_STEP
          : event.key === 'Home' ? COLUMN_MIN : event.key === 'End' ? COLUMN_MAX : null;
        if (next === null) return;
        event.preventDefault();
        set(next);
      }}
      sx={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 8, cursor: 'col-resize', touchAction: 'none',
        '&::after': {
          content: '""', position: 'absolute', top: 4, bottom: 4, right: 0, width: 2,
          bgcolor: drag ? 'primary.main' : 'transparent', transition: 'background-color 120ms',
        },
        '&:hover::after, &:focus-visible::after': { bgcolor: 'primary.main' },
        '&:focus-visible': { outline: 'none' },
        '@media (prefers-reduced-motion: reduce)': { '&::after': { transition: 'none' } },
      }}
    />
  );
}

const ADD_WIDTH = 64;

/** A record result drawn by the browser, so the model never has to retype it. */
function RecordViewCardView({ view, onAdd }: { view: RecordView; onAdd?: (row: Record<string, ViewCell>) => void }) {
  const [expanded, setExpanded] = useState(false);
  // The RID leads: it is what names one deed when you ask about or add it.
  const columns = [...(view.columns ?? [])].sort((a, b) => Number(b.key === 'rid') - Number(a.key === 'rid'));
  const labelOf = (key: string) => columns.find((column) => column.key === key)?.label ?? key;
  const rows = view.rows ?? [];
  const shown = expanded ? rows : rows.slice(0, VIEW_PREVIEW_ROWS);
  const total = view.total ?? rows.length;
  // Reader-set column widths for this view; a new result starts from the defaults.
  const [widths, setWidths] = useState<Record<string, number>>({});
  const widthOf = (key: string) => widths[key] ?? defaultColumnWidth(key, labelOf(key), rows);
  const addable = !!onAdd && rows.some((row) => row.rid);
  return (
    <Box
      component="section"
      aria-label={view.title}
      sx={{ mt: 1.25, border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden', whiteSpace: 'normal' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75, minHeight: 40, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, flexGrow: 1, minWidth: 0 }} noWrap title={view.title}>
          {view.title}
        </Typography>
        {view.kind === 'table' && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {total > rows.length ? `${rows.length} of ${total.toLocaleString('en-IN')}` : `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
            </Typography>
          </>
        )}
        <ViewExportMenu view={view} />
      </Box>
      {view.note && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.25, py: 0.5, bgcolor: 'action.hover' }}>
          {view.note}
        </Typography>
      )}
      {view.summary && <SummaryCards summary={view.summary} />}
      {isRateView(view) && <RateChart view={view} />}
      {view.kind === 'report' ? (
        <Box sx={{ px: 1.25, py: 1, maxHeight: expanded ? 'none' : 420, overflowY: expanded ? 'visible' : 'auto', fontSize: '0.875rem' }}>
          <Markdown text={view.markdown ?? ''} />
        </Box>
      ) : (
        <Box
          sx={{
            overflow: 'auto',
            maxHeight: expanded ? 'none' : 480,
            overscrollBehaviorX: 'contain',
            WebkitOverflowScrolling: 'touch',
            ...macScrollbarSx,
          }}
        >
          <Box component="table" sx={viewTableSx} style={{ width: `max(100%, ${columns.reduce((sum, column) => sum + widthOf(column.key), addable ? ADD_WIDTH : 0)}px)` }}>
            <colgroup>
              {addable && <col style={{ width: ADD_WIDTH }} />}
              {/* The last column takes any spare room, so the others render at
                  exactly their set widths and a drag follows the pointer. */}
              {columns.map((column, i) => (
                <col key={column.key} style={i < columns.length - 1 ? { width: widthOf(column.key) } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {addable && <th aria-label="Add to my properties" />}
                {columns.map((column) => (
                  <th
                    key={column.key}
                    // Names the header by its label alone, not "… Resize … column".
                    aria-label={column.label}
                    className={rows.some((row) => isNumeric(row[column.key])) && !isConfidence(column.key) ? 'num' : undefined}
                    title={isConfidence(column.key) ? 'How closely the name in the deed matches your search. Not proof it is the same person.' : column.label}
                  >
                    {column.label}
                    <ColumnResizer
                      label={column.label}
                      width={widthOf(column.key)}
                      onWidth={(width) => setWidths((previous) => ({ ...previous, [column.key]: width }))}
                      onReset={() => setWidths(({ [column.key]: _reset, ...rest }) => rest)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {addable && (
                    <td>
                      {row.rid ? (
                        <Button
                          size="small"
                          onClick={() => onAdd?.(row)}
                          aria-label={`Add deed ${String(row.rid)} to my properties`}
                          sx={{ minWidth: 0, px: 1, py: 0, fontWeight: 700 }}
                        >
                          Add
                        </Button>
                      ) : null}
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={isNumeric(row[column.key]) && !isConfidence(column.key) ? 'num' : undefined}
                      title={formatCell(column.key, row[column.key])}
                    >
                      {isConfidence(column.key) && typeof row[column.key] === 'number' ? (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                          <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: confidenceLevel(row[column.key] as number).color }} />
                          {formatCell(column.key, row[column.key])}
                        </Box>
                      ) : formatCell(column.key, row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      )}
      {(view.kind === 'table' ? rows.length > VIEW_PREVIEW_ROWS : (view.markdown?.length ?? 0) > 2_000) && (
        <Button size="small" fullWidth onClick={() => setExpanded((value) => !value)} sx={{ borderTop: 1, borderColor: 'divider', borderRadius: 0 }}>
          {expanded ? 'Show less' : view.kind === 'table' ? `Show all ${rows.length}` : 'Show full report'}
        </Button>
      )}
    </Box>
  );
}

/** Memoised: a streamed token re-renders the panel, never an unchanged RecordViewCard. */
export const RecordViewCard = memo(RecordViewCardView);
