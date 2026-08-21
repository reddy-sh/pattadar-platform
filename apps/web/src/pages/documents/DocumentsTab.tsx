/**
 * All documents — layer 1 of the vault: every FILE, with its own name, size
 * and type, whether or not anything has read it.
 *
 * Uploading is free. It stores the bytes, writes the row, and stops — no
 * model runs and no credit is spent. (Every upload used to be sent to the AI
 * classifier in the background, whether or not anyone wanted a reading.)
 * Reading is the explicit "Read with AI…" action, and what it finds is shown
 * for a person to accept before any of it is written down.
 *
 * Also here: preview/download via blob fetch, upload (≤10 files / 1 GB per
 * batch), link-to-parcel / link-to-khata, "Create parcel from this deed",
 * change-type, and the trash flow (storage node DELETE + row removal).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import SearchIcon from '@mui/icons-material/Search';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ViewListIcon from '@mui/icons-material/ViewList';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import { sampleDocuments, sampleParcels, samplePassbooks } from '@pattadar/core';
import { apiFetch, gql } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Skeletons';
import { selectionBarSx, stickyHeadSx } from '../../components/tableSx';
import { openFileViewer } from '../../components/FileViewer';
import { ExportMenu } from '../../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../../export/ExportMenu';
import { fmtLocal } from '../../lib/format';
import { useLiveOrSample } from '../../data/useLiveOrSample';
import {
  DOC_CATEGORIES,
  DEED_GROUP,
  DOC_FAMILIES,
  familyBlurb,
  familyLabel,
  familyTint,
  familyOfType,
  isDeedType,
  labelOfType,
} from './docTypes';
import {
  STORAGE_OFFLINE_MSG,
  downloadBlob,
  fetchFileBlob,
  nestUnderPattadar,
  renameNode,
  trashDocument,
} from './storage';
import { archiveName, uniqueNames, zipStore } from '../../lib/zip';
import { PaperTrailDialog } from './PaperTrailDialog';
import type { TrailDoc } from './PaperTrailDialog';
import { StorageOffline, applyReading, readDocument, uploadDocument } from './upload';
import type { Reading } from './upload';

const MAX_BATCH_FILES = 10;
const MAX_BATCH_BYTES = 1024 * 1024 * 1024; // 1 GB per upload batch

interface DocFull {
  id: string;
  fileRef: string;
  docType: string;
  parcelId: string;
  passbookId: string;
  propertyId?: string;
  docNo?: string;
  regYear?: string;
  source?: string;
  createdAt?: string;
  /** The file's own facts, on the row. Before these existed the page made one
   *  storage request PER ROW just to learn its own filenames. */
  name?: string;
  sizeBytes?: number;
  mimeType?: string;
  /** → registered_documents.id; '' while nothing has read this file. */
  readingId?: string;
}

interface ParcelOpt {
  id: string;
  surveyNo: string;
  subdivision: string;
  passbookId: string;
}

interface PassbookOpt {
  id: string;
  ref: string;
  pattadarNo: string;
  ownerName: string;
  village: string;
}

interface DocsData {
  documents: DocFull[];
  parcels: ParcelOpt[];
  passbooks: PassbookOpt[];
}

const docsSample: DocsData = {
  documents: sampleDocuments.map((d) => ({ ...d, docNo: '', regYear: '', source: 'upload' })),
  parcels: sampleParcels.map((p) => ({
    id: p.id,
    surveyNo: p.surveyNo,
    subdivision: p.subdivision,
    passbookId: p.passbookId,
  })),
  passbooks: samplePassbooks.map((b) => ({
    id: b.id,
    ref: b.ref,
    pattadarNo: b.pattadarNo,
    ownerName: b.ownerName,
    village: b.village,
  })),
};

function useDocumentsFull() {
  return useLiveOrSample<DocsData>(
    'documents-full',
    async () => {
      const d = await gql<DocsData>(
        `query { documents { id fileRef docType parcelId passbookId propertyId docNo regYear source createdAt name sizeBytes mimeType readingId } parcels { id surveyNo subdivision passbookId } passbooks { id ref pattadarNo ownerName village } }`,
      );
      return { documents: d.documents ?? [], parcels: d.parcels ?? [], passbooks: d.passbooks ?? [] };
    },
    docsSample,
  );
}

// Same labels the source builds (DocumentsView parcelLabelOf / passbookLabelOf).
const parcelLabelOf = (p: ParcelOpt) => `Survey ${p.surveyNo}${p.subdivision ? '/' + p.subdivision : ''}`;
const passbookLabelOf = (pb: PassbookOpt) =>
  `${pb.ownerName || '—'} · Khata ${pb.pattadarNo || '—'}${pb.village ? ' · ' + pb.village : ''}`;

const titleize = (s: string) =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

function docIcon(docType: string) {
  const t = String(docType || '').toLowerCase();
  if (t === 'video') return <VideocamOutlinedIcon fontSize="small" />;
  if (t === 'photo') return <ImageOutlinedIcon fontSize="small" />;
  if (DEED_GROUP.has(t)) return <PictureAsPdfOutlinedIcon fontSize="small" />;
  if (t === 'fmb' || t === 'map') return <MapOutlinedIcon fontSize="small" />;
  return <DescriptionOutlinedIcon fontSize="small" />;
}

interface Row {
  id: string;
  fileRef: string;
  docType: string;
  docTypeLabel: string;
  regYear: string;
  source: string;
  createdAt: string;
  name: string;
  linkedTo: string;
  family: string;
  sizeBytes: number;
  /** True once a reading has been accepted for this file. */
  isRead: boolean;
}

/** The shared tint NAMES (@pattadar/core) mapped onto MUI palette slots. The
 *  core keeps names rather than hex so each app can honour its own theme while
 *  the two still agree which shelf is which colour. */
const FOLDER_TINT: Record<string, string> = {
  blue: 'info',
  green: 'success',
  cyan: 'info',
  purple: 'secondary',
  orange: 'warning',
  brown: 'warning',
  pink: 'secondary',
  gray: 'primary',
};
const folderTint = (family: string) => FOLDER_TINT[familyTint(family)] ?? 'primary';

/** "1.4 MB". Files are shown in the units a file manager uses — decimal, one
 *  decimal place — because that is what the operating system told them the
 *  file weighed. An unknown size shows as an em dash, never as "0 B". */
function fmtBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3));
  const value = bytes / 1000 ** i;
  return `${i === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

type PickerMode = 'parcel' | 'khata' | 'deed' | 'type';

export function DocumentsTab({
  onToast,
}: {
  onToast: (msg: string, severity: 'success' | 'error' | 'info') => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isSample, isLoading } = useDocumentsFull();
  // The shelf being looked at — a family key from @pattadar/core, or 'all'.
  const [family, setFamily] = useState('all');
  // Folders or a flat list. Remembered, because it is a working preference:
  // somebody filing a stack wants folders, somebody hunting one paper wants
  // the list and the search box.
  const [view, setView] = useState<'folders' | 'list'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('pattadar.vault.view')) === 'list'
      ? 'list'
      : 'folders',
  );
  useEffect(() => {
    try {
      localStorage.setItem('pattadar.vault.view', view);
    } catch {
      /* private browsing — the preference just does not persist */
    }
  }, [view]);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  /// The read-on-request flow: running the reader, then showing what it found
  /// for a person to accept. Nothing is written until they do.
  const [reading, setReading] = useState<{
    row: Row;
    state: 'running' | 'found' | 'saving';
    found?: Reading;
  } | null>(null);
  const [menuFor, setMenuFor] = useState<{ el: HTMLElement; row: Row } | null>(null);
  const [renaming, setRenaming] = useState<{ row: Row; name: string; busy?: boolean } | null>(null);
  const [trailFor, setTrailFor] = useState<TrailDoc | null>(null);
  const [picker, setPicker] = useState<{ mode: PickerMode; row: Row; sel: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  // ── multi-select: checkbox-only (row click keeps opening the viewer) ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulk, setBulk] = useState<{ mode: 'delete' | 'download'; done: number; total: number } | null>(null);
  const lastToggled = useRef<string | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pattadar', 'documents-full'] });

  // (Filenames used to be fetched here, one storage request per row, every
  // render pass. The row carries its own name now — it loads with the list and
  // it is there when the gateway is not.)

  const rows: Row[] = useMemo(() => {
    const parcelById = new Map(data.parcels.map((p) => [p.id, p]));
    const passbookById = new Map(data.passbooks.map((b) => [b.id, b]));
    return data.documents.map((d) => {
      // Same fallbacks as the source: unknown ids read "Parcel" / "Khata".
      const parcel = d.parcelId ? parcelById.get(d.parcelId) : undefined;
      const passbook = d.passbookId ? passbookById.get(d.passbookId) : undefined;
      const linkedTo = d.parcelId
        ? parcel
          ? parcelLabelOf(parcel)
          : 'Parcel'
        : d.passbookId
          ? passbook
            ? passbookLabelOf(passbook)
            : 'Khata'
          : d.propertyId
            ? 'Property'
            : '';
      return {
        id: d.id,
        fileRef: d.fileRef,
        docType: d.docType || 'other',
        docTypeLabel: labelOfType(d.docType),
        regYear: d.regYear || '',
        source: d.source || '',
        createdAt: d.createdAt || '',
        name:
          d.name ||
          d.docNo ||
          (d.docType === 'photo' ? 'Photo' : titleize(d.docType || 'Document')),
        linkedTo,
        family: familyOfType(d.docType || '', d.mimeType || ''),
        sizeBytes: Number(d.sizeBytes || 0),
        isRead: !!d.readingId,
      };
    });
  }, [data]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (family !== 'all' && r.family !== family) return false;
      if (needle && ![r.name, r.docTypeLabel, r.linkedTo, r.source].join(' ').toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [rows, family, search]);

  // How many papers sit on each shelf — the folder cards' counts, and what
  // decides which chips are worth showing. Counted over the SEARCH-filtered
  // rows so the numbers agree with what clicking through would reveal.
  const counts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (needle && ![r.name, r.docTypeLabel, r.linkedTo, r.source].join(' ').toLowerCase().includes(needle))
        continue;
      out[r.family] = (out[r.family] ?? 0) + 1;
    }
    return out;
  }, [rows, search]);

  // Selection only ever spans the rows currently shown — filtering away a
  // selected row deselects it, so bulk actions never touch hidden rows.
  useEffect(() => {
    setSelected((prev) => {
      const shownIds = new Set(shown.map((r) => r.id));
      const next = new Set([...prev].filter((id) => shownIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [shown]);

  // Esc clears the selection — but only when no overlay (dialog / menu /
  // viewer) is open, so overlays keep owning their own Esc.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.MuiDialog-root, .MuiPopover-root')) return;
      setSelected(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected.size]);

  // Standing at the top of the folders, rather than inside one. The grid shows
  // here and the table does not; a search or a selection collapses straight to
  // rows, because both are ways of saying "I mean these documents".
  const atFolderLevel =
    view === 'folders' && family === 'all' && !search.trim() && selected.size === 0;

  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected(allShownSelected ? new Set() : new Set(shown.map((r) => r.id)));
    lastToggled.current = null;
  };
  const toggleRow = (r: Row, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const ids = shown.map((x) => x.id);
      const a = lastToggled.current ? ids.indexOf(lastToggled.current) : -1;
      const b = ids.indexOf(r.id);
      if (shiftKey && a !== -1 && b !== -1 && a !== b) {
        // Shift-click extends the last toggle across the visible range.
        const on = !prev.has(r.id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i += 1) {
          if (on) next.add(ids[i]);
          else next.delete(ids[i]);
        }
      } else if (next.has(r.id)) next.delete(r.id);
      else next.add(r.id);
      return next;
    });
    lastToggled.current = r.id;
  };

  // ── preview / download ────────────────────────────────────────────────
  // Preview opens the in-portal FileViewer over the filtered list (←/→
  // navigation), starting at the clicked row — never a new tab.
  const openFile = (r: Row) => {
    if (!r.fileRef) return;
    const viewable = shown.filter((x) => x.fileRef);
    openFileViewer(
      viewable.map((x) => ({
        name: x.name,
        kind:
          x.docType === 'photo' ? ('image' as const) : x.docType === 'video' ? ('video' as const) : undefined,
        load: () => fetchFileBlob(x.fileRef),
      })),
      Math.max(
        0,
        viewable.findIndex((x) => x.id === r.id),
      ),
    );
  };
  const downloadFile = async (r: Row) => {
    if (!r.fileRef) return;
    try {
      downloadBlob(await fetchFileBlob(r.fileRef), r.name);
    } catch {
      onToast('Could not download file', 'error');
    }
  };

  // ── upload — storage only, no model, no credit ────────────────────────
  // Every uploaded file used to be sent to the AI classifier in the background,
  // whether or not anyone wanted a reading. Uploading is now free and offline-
  // tolerant; reading is the "Read this document" action below.
  const uploadBatch = async (files: File[]) => {
    let batch = files;
    if (batch.length > MAX_BATCH_FILES) {
      onToast(`Only the first ${MAX_BATCH_FILES} files will be uploaded — max ${MAX_BATCH_FILES} at a time`, 'info');
      batch = batch.slice(0, MAX_BATCH_FILES);
    }
    const totalBytes = batch.reduce((s, f) => s + (f.size || 0), 0);
    if (totalBytes > MAX_BATCH_BYTES) {
      onToast('Uploads are limited to 1 GB at a time — remove some files and retry', 'error');
      return;
    }
    setUploading(true);
    let done = 0;
    for (const f of batch) {
      try {
        await uploadDocument(f);
        done += 1;
      } catch (err) {
        // Storage gateway unreachable (local dev) — one clear message, stop the batch.
        if (err instanceof StorageOffline) {
          onToast(STORAGE_OFFLINE_MSG, 'info');
          break;
        }
        onToast(`Upload failed${f?.name ? ` — ${f.name}` : ''}`, 'error');
      }
    }
    setUploading(false);
    refresh();
    if (done === 1) onToast('File uploaded', 'success');
    else if (done > 1) onToast(`${done} files uploaded`, 'success');
  };

  // ── read on request ───────────────────────────────────────────────────
  // The reader runs only when asked, and what it finds is SHOWN before it is
  // written. Nothing about the document changes until Accept.
  const startReading = async (r: Row) => {
    if (!r.fileRef) {
      onToast('This row has no stored file to read', 'info');
      return;
    }
    setReading({ row: r, state: 'running' });
    try {
      const blob = await fetchFileBlob(r.fileRef);
      const found = await readDocument(blob, r.name);
      setReading({ row: r, state: 'found', found });
    } catch (err) {
      setReading(null);
      onToast(err instanceof Error ? err.message : 'The document could not be read', 'error');
    }
  };

  const acceptReading = async () => {
    if (!reading || reading.state !== 'found' || !reading.found) return;
    const { row, found } = reading;
    setReading({ row, state: 'saving', found });
    try {
      await applyReading(row.id, found, row.fileRef);
      setReading(null);
      onToast(`Filed as ${found.docTypeLabel}`, 'success');
      refresh();
    } catch (err) {
      setReading(null);
      onToast(err instanceof Error ? err.message : 'The reading could not be saved', 'error');
    }
  };

  // ── link / reclassify / create-parcel actions ─────────────────────────
  const doLinkParcel = async (row: Row, parcelId: string) => {
    try {
      await gql('mutation($id:String!,$p:String!,$pb:String!){ updateDocumentLink(id:$id,parcelId:$p,passbookId:$pb){ id } }', {
        id: row.id,
        p: parcelId,
        pb: '',
      });
      const p = data.parcels.find((x) => x.id === parcelId);
      const pb = data.passbooks.find((b) => b.id === p?.passbookId);
      await nestUnderPattadar({ passbookRef: pb?.ref || '', parcelLabel: p ? parcelLabelOf(p) : '' }, row.fileRef);
      onToast('Linked to parcel', 'success');
      refresh();
    } catch {
      onToast('Could not link to parcel', 'error');
    }
  };

  const doLinkKhata = async (row: Row, passbookId: string) => {
    try {
      await gql('mutation($id:String!,$p:String!,$pb:String!){ updateDocumentLink(id:$id,parcelId:$p,passbookId:$pb){ id } }', {
        id: row.id,
        p: '',
        pb: passbookId,
      });
      const pb = data.passbooks.find((b) => b.id === passbookId);
      await nestUnderPattadar({ passbookRef: pb?.ref || '' }, row.fileRef);
      onToast('Linked to khata', 'success');
      refresh();
    } catch {
      onToast('Could not link to khata', 'error');
    }
  };

  const doCreateParcelFromDeed = async (row: Row, passbookId: string) => {
    try {
      const blob = await fetchFileBlob(row.fileRef);
      const fd = new FormData();
      fd.append('file', new File([blob], row.name));
      const er = await apiFetch('/api/gateway/pattadar/import-registered-document', { method: 'POST', body: fd });
      const fields = er.ok ? ((await er.json())?.fields || {}) : {};
      const did = (
        await gql<{ createRegisteredDocument: { id: string } | null }>(
          'mutation($fileRef:String!,$payload:String!){ createRegisteredDocument(fileRef:$fileRef,payload:$payload){ id } }',
          { fileRef: row.fileRef, payload: JSON.stringify(fields) },
        )
      )?.createRegisteredDocument?.id;
      const par = (
        await gql<{ createParcelFromDocument: { id: string; ref: string } | null }>(
          'mutation($d:String!,$p:String!){ createParcelFromDocument(documentId:$d,passbookId:$p){ id ref } }',
          { d: did, p: passbookId },
        )
      )?.createParcelFromDocument;
      onToast(`Parcel ${par?.ref || ''} created`, 'success');
      refresh();
      if (par?.id) navigate('/app/parcels');
    } catch {
      onToast('Could not create a parcel from this deed', 'error');
    }
  };

  const doChangeType = async (row: Row, type: string) => {
    try {
      await gql('mutation($id:String!,$t:String!){ updateDocumentType(id:$id,docType:$t){ id } }', {
        id: row.id,
        t: type,
      });
      onToast('Type updated', 'success');
      refresh();
    } catch {
      onToast('Could not update type', 'error');
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    // Honest outcome: the toast reports what the row delete actually did —
    // the My-Drive trash move stays best-effort and never mislabels it.
    const res = await trashDocument({ id: confirmDelete.id, fileRef: confirmDelete.fileRef });
    if (res.ok) onToast('Document deleted', 'success');
    else onToast(`Could not delete the document — ${res.reason}`, 'error');
    setConfirmDelete(null);
    refresh();
  };

  // ── bulk actions over the checkbox selection ──────────────────────────
  const bulkDelete = async () => {
    const targets = shown.filter((r) => selected.has(r.id));
    setConfirmBulk(false);
    if (!targets.length) return;
    setBulk({ mode: 'delete', done: 0, total: targets.length });
    let ok = 0;
    let reason = '';
    for (const r of targets) {
      const res = await trashDocument({ id: r.id, fileRef: r.fileRef });
      if (res.ok) ok += 1;
      else reason = reason || res.reason;
      setBulk((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    setBulk(null);
    setSelected(new Set());
    refresh();
    const failed = targets.length - ok;
    if (failed === 0) onToast(`${ok} deleted`, 'success');
    else onToast(`${ok} deleted, ${failed} failed — ${reason}`, 'error');
  };

  // More than one file arrives as ONE archive. Firing N separate downloads got
  // blocked by the browser after the third and scattered the rest across the
  // downloads folder — a selection is one thing the person asked for.
  const bulkDownload = async () => {
    const targets = shown.filter((r) => selected.has(r.id) && r.fileRef);
    if (!targets.length) {
      onToast('The selected rows have no stored files to download', 'info');
      return;
    }
    setBulk({ mode: 'download', done: 0, total: targets.length });
    const fetched: { row: Row; bytes: Uint8Array }[] = [];
    const failed: string[] = [];
    for (const r of targets) {
      try {
        const blob = await fetchFileBlob(r.fileRef);
        fetched.push({ row: r, bytes: new Uint8Array(await blob.arrayBuffer()) });
      } catch {
        failed.push(r.name);
      }
      setBulk((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    setBulk(null);

    if (!fetched.length) {
      onToast('None of the selected files could be downloaded — the file storage could not be reached', 'error');
      return;
    }
    // One file is that file, not an archive containing it.
    if (fetched.length === 1 && !failed.length) {
      downloadBlob(new Blob([fetched[0].bytes as BlobPart]), fetched[0].row.name);
      onToast('1 file downloaded', 'success');
      return;
    }
    try {
      const names = uniqueNames(fetched.map((f) => f.row.name));
      downloadBlob(
        zipStore(fetched.map((f, i) => ({ name: names[i], bytes: f.bytes }))),
        archiveName(),
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'The archive could not be built', 'error');
      return;
    }
    // A file left out of the archive is named, never silently dropped.
    if (!failed.length) onToast(`${fetched.length} files zipped`, 'success');
    else
      onToast(
        `${fetched.length} zipped, ${failed.length} left out — ${failed.slice(0, 3).join(', ')}${
          failed.length > 3 ? `, +${failed.length - 3} more` : ''
        }`,
        'error',
      );
  };

  // ── rename ────────────────────────────────────────────────────────────
  // Both copies are written: the storage node (so My Drive agrees) and the
  // vault row (so the new name is there offline and without a node lookup).
  const doRename = async () => {
    if (!renaming) return;
    const { row, name } = renaming;
    const wanted = name.trim();
    if (!wanted || wanted === row.name) {
      setRenaming(null);
      return;
    }
    setRenaming({ row, name: wanted, busy: true });
    try {
      const settled = row.fileRef ? await renameNode(row.fileRef, wanted) : wanted;
      await gql('mutation($id:String!,$n:String!){ renameDocument(id:$id,name:$n){ id } }', {
        id: row.id,
        n: settled,
      });
      setRenaming(null);
      // Say so when storage would not take the exact name asked for.
      onToast(settled === wanted ? 'Renamed' : `Renamed to “${settled}” — that name was taken`, 'success');
      refresh();
    } catch {
      setRenaming(null);
      onToast('Could not rename this document', 'error');
    }
  };

  const pickerOk = async () => {
    if (!picker || !picker.sel) {
      setPicker(null);
      return;
    }
    const { mode, row, sel } = picker;
    setPicker(null);
    setBusy(true);
    if (mode === 'parcel') await doLinkParcel(row, sel);
    else if (mode === 'khata') await doLinkKhata(row, sel);
    else if (mode === 'deed') await doCreateParcelFromDeed(row, sel);
    else await doChangeType(row, sel);
    setBusy(false);
  };

  const pickerOptions =
    picker?.mode === 'parcel'
      ? data.parcels.map((p) => ({ value: p.id, label: parcelLabelOf(p) }))
      : picker?.mode === 'khata' || picker?.mode === 'deed'
        ? data.passbooks.map((pb) => ({ value: pb.id, label: passbookLabelOf(pb) }))
        : DOC_CATEGORIES.map((c) => ({ value: c.key, label: c.label }));
  const pickerTitle =
    picker?.mode === 'parcel'
      ? 'Link to parcel'
      : picker?.mode === 'khata'
        ? 'Link to khata'
        : picker?.mode === 'deed'
          ? "Create a parcel — choose the owner's khata"
          : 'Change document type';

  const exportBrand: ExportBrand = {
    brand: 'Pattadar',
    title: 'Documents',
    subtitle: 'Andhra Pradesh / Telangana Land Records',
    watermark: 'PATTADAR',
  };
  const exportCols: ExportCol<Row>[] = [
    { key: 'name', title: 'Name' },
    { key: 'docTypeLabel', title: 'Type' },
    { key: 'linkedTo', title: 'Linked to' },
    { key: 'regYear', title: 'Reg. Year' },
    { key: 'source', title: 'Source' },
    { key: 'createdAt', title: 'Created', fmt: (v) => fmtLocal(String(v ?? '')) },
  ];

  // Shaped loading state — never paint the sample dataset uncredited.
  if (isLoading) return <TableSkeleton />;

  return (
    <>
      {/* Contextual selection toolbar — swaps in over the filter toolbar. */}
      {selected.size > 0 ? (
        <Box sx={selectionBarSx}>
          {bulk ? (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {bulk.mode === 'delete' ? 'Deleting' : 'Collecting'} {Math.min(bulk.done + 1, bulk.total)} of{' '}
                {bulk.total}…
              </Typography>
              <LinearProgress
                color="inherit"
                variant="determinate"
                value={(bulk.done / bulk.total) * 100}
                sx={{ flexGrow: 1, mx: 2, borderRadius: 1 }}
              />
            </>
          ) : (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {selected.size} selected
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Button color="error" onClick={() => setConfirmBulk(true)}>
                Delete
              </Button>
              <Button color="inherit" onClick={() => void bulkDownload()}>
                {selected.size > 1 ? 'Download as zip' : 'Download'}
              </Button>
              <Button color="inherit" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </>
          )}
        </Box>
      ) : (
        <>
          {/* Toolbar: search + upload + export (one action row) */}
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 260 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Box sx={{ flexGrow: 1 }} />
            <Tooltip title="PDF / JPG / PNG / MP4 · up to 10 files, 1 GB per upload · nothing is read until you ask">
              <span>
                <Button component="label" variant="contained" startIcon={<UploadFileOutlinedIcon />} disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    hidden
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.mp4,.mov,.webm,image/*,video/*"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length) void uploadBatch(files);
                      e.target.value = '';
                    }}
                  />
                </Button>
              </span>
            </Tooltip>
            <ExportMenu filename="pattadar-documents" brand={exportBrand} cols={exportCols} rows={shown} />
          </Box>
          {/* The shelves. In folder view this row is a breadcrumb; in list
              view it is the filter it has always been. Either way the names
              are the ones the phone uses. */}
          <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap', alignItems: 'center', color: 'text.secondary' }}>
            {view === 'folders' && family !== 'all' ? (
              <>
                <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => setFamily('all')}>
                  All folders
                </Button>
                <Typography variant="caption" sx={{ opacity: 0.6 }}>/</Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  {familyLabel(family)}
                </Typography>
              </>
            ) : (
              <>
                <FilterAltOutlinedIcon sx={{ fontSize: 18 }} />
                <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 0.6, mr: 0.5 }}>
                  TYPE
                </Typography>
                <Chip
                  size="small"
                  label="All"
                  color={family === 'all' ? 'primary' : 'default'}
                  variant={family === 'all' ? 'filled' : 'outlined'}
                  onClick={() => setFamily('all')}
                />
                {/* Only shelves that hold something get a chip — a filter that
                    can only ever say "nothing matches" is furniture. */}
                {DOC_FAMILIES.filter((f) => counts[f]).map((f) => (
                  <Chip
                    key={f}
                    size="small"
                    label={`${familyLabel(f)} · ${counts[f]}`}
                    color={family === f ? 'primary' : 'default'}
                    variant={family === f ? 'filled' : 'outlined'}
                    onClick={() => setFamily(f)}
                  />
                ))}
              </>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Tooltip title={view === 'folders' ? 'Show one flat list' : 'Show folders'}>
              <IconButton
                size="small"
                aria-label={view === 'folders' ? 'Show one flat list' : 'Show folders'}
                onClick={() => {
                  setView((v) => (v === 'folders' ? 'list' : 'folders'));
                  setFamily('all');
                }}
              >
                {view === 'folders' ? <ViewListIcon fontSize="small" /> : <FolderOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
        </>
      )}

      {/* The folder grid — one card per shelf, with what is on it. Shown only
          at the top level, and never while a search is narrowing things: a
          person typing a survey number wants rows, not folders. */}
      {atFolderLevel ? (
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' },
          }}
        >
          {DOC_FAMILIES.filter((f) => counts[f]).map((f) => (
            <Card
              key={f}
              onClick={() => setFamily(f)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setFamily(f);
              }}
              sx={{
                p: 2,
                cursor: 'pointer',
                display: 'flex',
                gap: 1.5,
                alignItems: 'flex-start',
                transition: 'border-color .15s, transform .15s',
                '&:hover': { borderColor: 'primary.main', transform: 'translateY(-1px)' },
              }}
            >
              <FolderOutlinedIcon sx={{ color: `${folderTint(f)}.main`, mt: 0.25 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {familyLabel(f)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  {counts[f]} {counts[f] === 1 ? 'document' : 'documents'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.5 }}>
                  {familyBlurb(f)}
                </Typography>
              </Box>
            </Card>
          ))}
        </Box>
      ) : null}

      {atFolderLevel ? null : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DescriptionOutlinedIcon />}
            title={family === 'all' ? 'No documents yet' : `Nothing on the ${familyLabel(family).toLowerCase()} shelf yet`}
            description="Upload a deed, a passbook photo, anything. It is kept as it is — ask for a reading when you want one."
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={stickyHeadSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ width: 44 }}>
                    <Checkbox
                      size="small"
                      checked={allShownSelected}
                      indeterminate={selected.size > 0 && !allShownSelected}
                      disabled={isSample}
                      onChange={toggleAll}
                      slotProps={{ input: { 'aria-label': 'Select all documents' } }}
                    />
                  </TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Size</TableCell>
                  <TableCell>Linked to</TableCell>
                  <TableCell>Reg. Year</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.id} hover selected={selected.has(r.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selected.has(r.id)}
                        disabled={isSample}
                        onChange={(e) => toggleRow(r, (e.nativeEvent as MouseEvent).shiftKey === true)}
                        slotProps={{ input: { 'aria-label': `Select ${r.name}` } }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: r.fileRef ? 'pointer' : 'default' }}
                        onClick={() => openFile(r)}
                      >
                        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{docIcon(r.docType)}</Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {r.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {reading?.row.id === r.id && reading.state !== 'found' ? (
                        <Chip size="small" label="Reading…" color="info" variant="outlined" />
                      ) : (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={r.docTypeLabel}
                          // A type nobody has confirmed says so quietly. An
                          // unread file is a normal state, not a problem.
                          color={r.isRead ? 'primary' : 'default'}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                      {fmtBytes(r.sizeBytes) || '—'}
                    </TableCell>
                    <TableCell>
                      {r.linkedTo ? <Chip size="small" variant="outlined" label={r.linkedTo} /> : '—'}
                    </TableCell>
                    <TableCell>{r.regYear || '—'}</TableCell>
                    <TableCell>{r.source || '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtLocal(r.createdAt)}</TableCell>
                    <TableCell align="right">
                      {/* ALWAYS visible — the hover-reveal pattern hid the only
                          way to reach Delete, so ⋮ is permanent. */}
                      <IconButton
                        size="small"
                        aria-label={`Row actions for ${r.name}`}
                        disabled={isSample}
                        onClick={(e) => setMenuFor({ el: e.currentTarget, row: r })}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Row actions menu — guards live inside the handlers, like the source. */}
      <Menu anchorEl={menuFor?.el} open={!!menuFor} onClose={() => setMenuFor(null)}>
        <MenuItem
          onClick={() => {
            if (menuFor) openFile(menuFor.row);
            setMenuFor(null);
          }}
        >
          Open
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) setRenaming({ row: menuFor.row, name: menuFor.row.name });
            setMenuFor(null);
          }}
        >
          Rename…
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) void downloadFile(menuFor.row);
            setMenuFor(null);
          }}
        >
          Download
        </MenuItem>
        {/* Reading is opt-in and says so — it is the one action here that
            spends an extraction, and it never runs on its own. */}
        <MenuItem
          disabled={!menuFor?.row.fileRef}
          onClick={() => {
            if (menuFor) void startReading(menuFor.row);
            setMenuFor(null);
          }}
        >
          {menuFor?.row.isRead ? 'Read again with AI…' : 'Read with AI…'}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) setPicker({ mode: 'parcel', row: menuFor.row, sel: '' });
            setMenuFor(null);
          }}
        >
          Link to parcel…
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) setPicker({ mode: 'khata', row: menuFor.row, sel: '' });
            setMenuFor(null);
          }}
        >
          Link to khata…
        </MenuItem>
        {/* The chain of title. A deed bought from someone who bought it
            themselves cites the earlier deed; this is where that is said. */}
        <MenuItem
          onClick={() => {
            if (menuFor) {
              const r = menuFor.row;
              setTrailFor({ id: r.id, name: r.name, docTypeLabel: r.docTypeLabel, regYear: r.regYear });
            }
            setMenuFor(null);
          }}
        >
          Paper trail…
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) {
              if (!isDeedType(menuFor.row.docType)) {
                onToast('Only deed documents can create a parcel.', 'info');
              } else {
                setPicker({ mode: 'deed', row: menuFor.row, sel: '' });
              }
            }
            setMenuFor(null);
          }}
        >
          Create parcel from this deed…
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) setPicker({ mode: 'type', row: menuFor.row, sel: menuFor.row.docType });
            setMenuFor(null);
          }}
        >
          Change type…
        </MenuItem>
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            if (menuFor) setConfirmDelete(menuFor.row);
            setMenuFor(null);
          }}
        >
          Delete
        </MenuItem>
      </Menu>

      <PaperTrailDialog
        doc={trailFor}
        candidates={rows.map((r) => ({
          id: r.id,
          name: r.name,
          docTypeLabel: r.docTypeLabel,
          regYear: r.regYear,
        }))}
        onClose={() => setTrailFor(null)}
        onToast={onToast}
      />

      {/* Rename — the file's own name, in both places it is kept. */}
      <Dialog open={!!renaming} onClose={() => !renaming?.busy && setRenaming(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename document</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Name"
            value={renaming?.name ?? ''}
            disabled={renaming?.busy}
            onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !renaming?.busy) void doRename();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenaming(null)} disabled={renaming?.busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!renaming?.name.trim() || renaming?.busy}
            onClick={() => void doRename()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* What the reader found, before any of it is written down. A machine's
          reading never becomes a record without a person saying so — the same
          rule the iOS vault keeps. */}
      <Dialog open={!!reading} onClose={() => reading?.state === 'found' && setReading(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {reading?.state === 'found' ? 'Is this right?' : 'Reading the document…'}
        </DialogTitle>
        <DialogContent>
          {reading?.state !== 'found' ? (
            <>
              <DialogContentText sx={{ mb: 2 }}>
                {reading?.state === 'saving' ? 'Filing what it found…' : reading?.row.name}
              </DialogContentText>
              <LinearProgress />
            </>
          ) : (
            <>
              <DialogContentText sx={{ mb: 1.5 }}>
                This is what was read from <strong>{reading.row.name}</strong>. Nothing has been saved yet.
              </DialogContentText>
              <Chip size="small" color="primary" label={reading.found?.docTypeLabel ?? 'Other'} sx={{ mb: 1.5 }} />
              {reading.found?.findings.length ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 0.75, columnGap: 2 }}>
                  {reading.found.findings.map((f) => (
                    <Box key={f.label} sx={{ display: 'contents' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {f.label}
                      </Typography>
                      <Typography variant="body2">{f.value}</Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  It recognised the kind of paper but could not pull out any details. Accepting still files
                  it under that type.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReading(null)} disabled={reading?.state === 'saving'}>
            {reading?.state === 'found' ? 'Discard' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            disabled={reading?.state !== 'found'}
            onClick={() => void acceptReading()}
          >
            Accept
          </Button>
        </DialogActions>
      </Dialog>

      {/* Picker dialog (parcel / khata / deed-owner / type) */}
      <Dialog open={!!picker} onClose={() => setPicker(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{pickerTitle}</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            size="small"
            label="Choose…"
            value={picker?.sel ?? ''}
            onChange={(e) => setPicker((p) => (p ? { ...p, sel: e.target.value } : p))}
            sx={{ mt: 1 }}
          >
            {pickerOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPicker(null)}>Cancel</Button>
          <Button variant="contained" disabled={!picker?.sel || busy} onClick={() => void pickerOk()}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk delete confirm — ONE dialog for the whole selection. */}
      <Dialog open={confirmBulk} onClose={() => setConfirmBulk(false)}>
        <DialogTitle>{`Delete ${selected.size} ${selected.size === 1 ? 'document' : 'documents'}?`}</DialogTitle>
        <DialogContent>
          <DialogContentText>Files move to My Drive Trash.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmBulk(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void bulkDelete()}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm — file goes to My Drive Trash, row is removed. */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete this document?</DialogTitle>
        <DialogContent>
          <DialogContentText>This cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void doDelete()}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
