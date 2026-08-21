/**
 * ExportMenu — "Export ▾" dropdown offering CSV / Excel / branded PDF
 * (functional port of the rhub design-system ExportMenu, MUI edition).
 * Pass `cols` (with optional per-column `fmt`), `rows` and a `brand`
 * (used for the PDF/Excel header + watermark — NOT shown in the menu).
 */
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TextSnippetOutlinedIcon from '@mui/icons-material/TextSnippetOutlined';
import { exportCsv, exportExcel, exportPdf } from './exporters';
import type { ExportBrand, ExportCol } from './exporters';

export type { ExportBrand, ExportCol };

export interface ExportMenuProps<T> {
  filename: string;
  brand: ExportBrand;
  cols: ExportCol<T>[];
  rows: T[];
  /** Trigger button label. Defaults to "Export". */
  label?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ExportMenu<T = any>({ filename, brand, cols, rows, label = 'Export' }: ExportMenuProps<T>) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [error, setError] = useState('');

  const run = async (fmt: 'pdf' | 'excel' | 'csv') => {
    setAnchor(null);
    const base = `${filename}-${new Date().toISOString().slice(0, 10)}`;
    try {
      if (fmt === 'csv') exportCsv(`${base}.csv`, cols, rows);
      else if (fmt === 'excel') await exportExcel(`${base}.xlsx`, brand, cols, rows);
      else await exportPdf(`${base}.pdf`, brand, cols, rows);
      setError('');
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<FileDownloadOutlinedIcon />}
        disabled={!rows.length}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {label}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => void run('pdf')}>
          <ListItemIcon>
            <PictureAsPdfOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText>PDF</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => void run('excel')}>
          <ListItemIcon>
            <GridOnOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText>Excel (.xlsx)</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => void run('csv')}>
          <ListItemIcon>
            <TextSnippetOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </ListItemIcon>
          <ListItemText>CSV</ListItemText>
        </MenuItem>
      </Menu>
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError('')}>
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
