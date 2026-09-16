'use client';

/**
 * Export, with the columns taken from the table the reader is looking at.
 *
 * `ExportMenu` asks for its columns as a second, unrelated argument, so every
 * screen that wants a download writes its table twice. Land & Properties is the
 * proof: ten columns as an `exportCols` literal (`LandPropertiesPage.tsx:283-294`)
 * and the same ten again as hand-written head and body cells (`:694-704`,
 * `:710-752`) — two lists that had already drifted in shape and in order, with
 * nothing in the type system to notice. Here the caller passes the SAME
 * `Column<T>[]` the table renders and `toExportCols()` derives the rest, so a
 * column added to the screen cannot be missing from the spreadsheet.
 *
 * The scope line exists because the export has always silently obeyed the
 * filters. `:525` hands `rows={shown}`, which is correct — a reader who has
 * narrowed a list to three villages wants three villages in the PDF — but
 * nothing on screen says so, and a file that quietly contains 24 of 1,900 rows
 * is a document somebody will forward. One caption above the formats states the
 * scope before the download starts, rather than leaving it to be discovered
 * afterwards.
 *
 * Three smaller repairs travel with the move. The trigger no longer goes dead
 * when a list is empty: it disables WITH a reason, so "why is Export grey?" is
 * answered on hover and on focus instead of guessed at. A branded PDF over a
 * few thousand rows takes seconds inside jsPDF, and the old button accepted the
 * click and then sat there — it now shows `Exporting…` and refuses a second
 * click, so nobody starts three of them. And the failure message leaves the
 * component: `ExportMenu` mounted its own `Snackbar` at the same bottom-centre
 * anchor as the page's, so a failed export could land on top of the message
 * that was already there. Failures go to `useToast()` like everything else,
 * where an error stays until it is dismissed.
 *
 * The format icons lose their three hardcoded brand hexes (Adobe red, Excel
 * green, a grey) — colour that carried no meaning the label did not already
 * carry, in a palette nobody here controls, and unreadable in the
 * high-contrast scheme.
 *
 * The popup wiring is passed as props: `Action` forwards `aria-haspopup`,
 * `aria-expanded` and `aria-controls` to its `Button`, so nothing here writes
 * those attributes onto the DOM behind React's back — two writers on one node
 * is how a disclosure state stops being deterministic. The menu takes its
 * accessible name from `aria-label` rather than from an id on the trigger,
 * because `Action` carries no `id` prop and the trigger's own name IS the
 * label. The trigger stays a plain `role="tertiary"` Action — one vocabulary,
 * one place — instead of growing a menu-shaped variant of it.
 *
 * Extracted from `src/export/ExportMenu.tsx:36-90` (the whole component — the
 * outlined trigger and its `disabled={!rows.length}`, the three menu items, the
 * private `Snackbar` and the date-stamped filename at `:42`, which is a
 * user-visible convention and is preserved byte for byte);
 * `src/views/LandPropertiesPage.tsx:283-294` (`exportCols`), `:295-300`
 * (`exportBrand`, now `PATTADAR_BRAND` + the per-screen title), `:301-302` (the
 * per-tab filename) and `:525` (`rows={shown}`).
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useCallback, useId, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TextSnippetOutlinedIcon from '@mui/icons-material/TextSnippetOutlined';

import type { Column, ExportBrand } from './types';
import { toExportCols } from './columns';
import { Action } from './Action';
import { useToast } from './ToastProvider';
import { pluralise } from './format';
import { TOUCH } from './tokens';

/** The brand literal, written once instead of five times. */
export const PATTADAR_BRAND: Pick<ExportBrand, 'brand' | 'subtitle' | 'watermark'> = {
  brand: 'Pattadar',
  subtitle: 'Andhra Pradesh / Telangana Land Records',
  watermark: 'PATTADAR',
};

/**
 * `exportBrand('Land & Properties Register')` → a complete `ExportBrand`. The
 * title is the only part a screen ever decides; everything else is the same
 * masthead on every report the app produces.
 */
export function exportBrand(title: string): ExportBrand {
  return { ...PATTADAR_BRAND, title };
}

/** A disabled control still owes the reader an explanation. */
const NOTHING_TO_EXPORT = 'There is nothing to export yet.';

/**
 * MUI drops `MenuItem` to its content height above `sm`, which lands a format
 * row under the 44px gate on exactly the pointer that is hardest to aim.
 */
const itemSx = { minHeight: TOUCH } as const;

export interface ExportActionProps<T> {
  /** Base name; the date stamp is appended by the component. */
  filename: string;
  brand: ExportBrand;
  /** Pass the SAME array the DataTable renders. toExportCols() does the rest. */
  columns: Column<T>[];
  rows: T[];
  /** "Exports the 24 rows currently shown" — tells the user filters apply. */
  scopeNote?: string;
  disabledReason?: string;
  /** Trigger label. Default 'Export'. */
  label?: string;
}

export function ExportAction<T>({
  filename,
  brand,
  columns,
  rows,
  scopeNote,
  disabledReason = NOTHING_TO_EXPORT,
  label = 'Export',
}: ExportActionProps<T>) {
  const toast = useToast();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const menuId = useId();

  const open = anchor !== null;
  const isEmpty = rows.length === 0;

  const openMenu = useCallback(() => {
    // The wrapper is `inline-flex` around the one button, so it shrinks to
    // exactly the control's box and the menu lines up the same way whether or
    // not `Action`'s tooltip spelling is in play — its sr-only reason node is
    // absolutely positioned and adds nothing to the wrapper's size. `Action`
    // forwards no ref of its own and calls `onClick()` with no event, so this
    // wrapper is the nearest real element the menu can hang off.
    setAnchor(triggerRef.current);
  }, []);

  const closeMenu = useCallback(() => setAnchor(null), []);

  const run = useCallback(
    async (kind: 'pdf' | 'excel' | 'csv') => {
      setAnchor(null);
      // `ExportMenu.tsx:42`, verbatim. The stamp is a filing convention: these
      // files land in shared drives and are sorted by name.
      const base = `${filename}-${new Date().toISOString().slice(0, 10)}`;
      const cols = toExportCols(columns);
      // CSV is a string join and returns within the frame; a workbook or a
      // watermarked A4 report is seconds of work that must not look idle.
      if (kind !== 'csv') setBusy(true);
      try {
        // jsPDF and xlsx already load on demand inside the writers; importing
        // the module itself late keeps its share of the data prep out of the
        // chunk every list screen pays for.
        const { exportCsv, exportExcel, exportPdf } = await import('../../export/exporters');
        if (kind === 'csv') exportCsv(`${base}.csv`, cols, rows);
        else if (kind === 'excel') await exportExcel(`${base}.xlsx`, brand, cols, rows);
        else await exportPdf(`${base}.pdf`, brand, cols, rows);
      } catch (error) {
        toast.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [brand, columns, filename, rows, toast],
  );

  const note = scopeNote ?? `Exports the ${pluralise(rows.length, 'row')} currently shown`;

  return (
    <>
      <Box component="span" ref={triggerRef} sx={{ display: 'inline-flex' }}>
        <Action
          role="tertiary"
          label={label}
          icon={<FileDownloadOutlinedIcon />}
          onClick={openMenu}
          disabled={isEmpty}
          disabledReason={disabledReason}
          busy={busy}
          busyLabel="Exporting…"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
        />
      </Box>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={closeMenu}
        slotProps={{
          // Named by the trigger's own word, which is the name the trigger
          // announces: `Action` has no `id` prop to point `aria-labelledby` at.
          list: { 'aria-label': label },
          // A caller's own scope sentence may be long; the menu wraps it rather
          // than pushing the viewport sideways on a 400px screen.
          paper: { sx: { maxWidth: 'min(320px, calc(100vw - 32px))' } },
        }}
      >
        <MenuItem disabled sx={{ opacity: 1, whiteSpace: 'normal' }}>
          <Typography variant="caption" color="text.secondary">
            {note}
          </Typography>
        </MenuItem>
        <MenuItem onClick={() => void run('pdf')} sx={itemSx}>
          <ListItemIcon>
            <PictureAsPdfOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText>PDF</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => void run('excel')} sx={itemSx}>
          <ListItemIcon>
            <GridOnOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText>Excel (.xlsx)</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => void run('csv')} sx={itemSx}>
          <ListItemIcon>
            <TextSnippetOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText>CSV</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
