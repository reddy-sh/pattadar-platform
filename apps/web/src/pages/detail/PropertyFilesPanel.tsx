/**
 * Files panel for the record-detail pages — functional port of the rhub
 * pattadar FilesPanel for the `property` and `parcel` scopes: drag-drop +
 * Upload button (≤10 files / 1 GB per batch), files go to My Drive then a
 * createDocument row is linked to the record, background AI classification
 * (import-registered-document → updateDocumentType), real My Drive
 * filenames, image thumbnails, preview/download, Reclassify (guard inside
 * the handler — never a hidden/disabled action) and Delete via the trash
 * flow. Parcel uploads are filed My Drive / Pattadar / Passbook <ref> /
 * Parcel <label> (source parity); property uploads stay unfiled, exactly
 * like the source. When the storage gateway is unreachable (local dev) an
 * upload attempt shows ONE clear inline alert instead of per-file toasts.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import { sampleDocuments } from '@pattadar/core';
import { apiFetch, gql } from '../../api/client';
import { useBlobUrl } from '../../components/holdingCards';
import { ExportMenu } from '../../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../../export/ExportMenu';
import { fmtLocal } from '../../lib/format';
import { useLiveOrSample } from '../../data/useLiveOrSample';
import { DEED_GROUP, DOC_CATEGORIES, classifierToType, labelOfType } from '../documents/docTypes';
import {
  STORAGE_OFFLINE_MSG,
  createDocumentRow,
  downloadBlob,
  fetchFileBlob,
  fetchNodeNames,
  nestUnderPattadar,
  openBlob,
  trashDocuments,
  uploadToDrive,
} from '../documents/storage';

const MAX_BATCH_FILES = 10;
const MAX_BATCH_BYTES = 1024 * 1024 * 1024; // 1 GB per upload batch
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.mp4,.mov,.webm,image/*,video/*';

export interface FilesScope {
  kind: 'property' | 'parcel';
  propertyId?: string;
  parcelId?: string;
  /** Parcel scope: uploads are filed My Drive / Pattadar / Passbook <ref> / Parcel <label>. */
  passbookRef?: string;
  parcelLabel?: string;
}

interface PanelDoc {
  id: string;
  fileRef: string;
  docType: string;
  docNo: string;
  regYear: string;
  source: string;
  tags: string;
  createdAt: string;
}

interface Row extends PanelDoc {
  docTypeLabel: string;
  name: string;
  isClassifying: boolean;
}

const isImageDoc = (d: { docType: string; tags?: string }) => d.docType === 'photo' || d.tags === 'photo';
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

/** 34px tile — image preview (fetched from My Drive) or a doc-type icon. */
function FileThumb({ doc, name, onOpen }: { doc: Row; name: string; onOpen: () => void }) {
  const isImg = isImageDoc(doc);
  const url = useBlobUrl(isImg ? doc.fileRef : undefined);
  return (
    <Box
      onClick={onOpen}
      title={name}
      sx={{
        width: 34,
        height: 34,
        borderRadius: 1.5,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: doc.fileRef ? 'pointer' : 'default',
        bgcolor: 'action.hover',
        color: 'text.secondary',
      }}
    >
      {isImg && url ? (
        <Box component="img" src={url} alt={name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        docIcon(doc.docType)
      )}
    </Box>
  );
}

function sampleFor(scope: FilesScope): PanelDoc[] {
  return sampleDocuments
    .filter((d) =>
      scope.kind === 'property' ? d.propertyId === scope.propertyId : d.parcelId === scope.parcelId,
    )
    .map((d) => ({
      id: d.id,
      fileRef: d.fileRef,
      docType: d.docType,
      docNo: '',
      regYear: '',
      source: 'upload',
      tags: d.tags || '',
      createdAt: d.createdAt,
    }));
}

function usePanelDocs(scope: FilesScope) {
  const scopeId = (scope.kind === 'property' ? scope.propertyId : scope.parcelId) || '';
  return useLiveOrSample<PanelDoc[]>(
    `files:${scope.kind}:${scopeId}`,
    async () => {
      if (scope.kind === 'property') {
        const d = await gql<{ propertyDocuments: PanelDoc[] }>(
          'query($id:String!){ propertyDocuments(propertyId:$id){ id fileRef docType docNo regYear source tags createdAt } }',
          { id: scopeId },
        );
        return d.propertyDocuments ?? [];
      }
      const d = await gql<{ documents: (PanelDoc & { parcelId: string })[] }>(
        'query { documents { id parcelId fileRef docType docNo regYear source tags createdAt } }',
      );
      return (d.documents ?? []).filter((x) => x.parcelId === scopeId);
    },
    sampleFor(scope),
  );
}

interface Toast {
  msg: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

export function PropertyFilesPanel({ scope }: { scope: FilesScope }) {
  const queryClient = useQueryClient();
  const { data: docs, isSample } = usePanelDocs(scope);
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [classifying, setClassifying] = useState<Set<string>>(new Set());
  const [storageDown, setStorageDown] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [menuFor, setMenuFor] = useState<{ el: HTMLElement; row: Row } | null>(null);
  const [reclassify, setReclassify] = useState<{ row: Row; sel: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = (msg: string, severity: Toast['severity'] = 'success') => setToast({ msg, severity });
  // One key invalidates the panel AND the parent detail page (tab counts, photo strip).
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] });

  // Resolve real My Drive filenames from the storage node ids (best-effort).
  useEffect(() => {
    const refs = Array.from(new Set(docs.map((d) => d.fileRef).filter(Boolean)));
    if (!refs.length) {
      setFileNames({});
      return;
    }
    let cancelled = false;
    void fetchNodeNames(refs).then((names) => {
      if (!cancelled) setFileNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [docs]);

  const rows: Row[] = useMemo(
    () =>
      docs.map((d) => ({
        ...d,
        docType: d.docType || 'other',
        docTypeLabel: labelOfType(d.docType),
        name: fileNames[d.fileRef] || d.docNo || (isImageDoc(d) ? 'Photo' : titleize(d.docType || 'Document')),
        isClassifying: classifying.has(d.id),
      })),
    [docs, fileNames, classifying],
  );

  // ── preview / download ────────────────────────────────────────────────
  const openFile = async (r: Row) => {
    if (!r.fileRef) return;
    try {
      openBlob(await fetchFileBlob(r.fileRef));
    } catch {
      notify('Could not open file', 'error');
    }
  };
  const downloadFile = async (r: Row) => {
    if (!r.fileRef) return;
    try {
      downloadBlob(await fetchFileBlob(r.fileRef), r.name);
    } catch {
      notify('Could not download file', 'error');
    }
  };

  // ── upload + background AI classification (FilesPanel pipeline) ───────
  const uploadOne = async (file: File, notifyOne: boolean) => {
    const nodeId = await uploadToDrive(file);
    if (!nodeId) throw new Error('storage-offline');
    // Videos are typed directly (the AI classifier only reads documents/images);
    // everything else lands as "other" and is reclassified in the background.
    const isVideo = String(file.type || '').startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name || '');
    const newId = await createDocumentRow(
      scope.kind === 'property' ? { propertyId: scope.propertyId } : { parcelId: scope.parcelId },
      { docType: isVideo ? 'video' : 'other', fileRef: nodeId, tags: isVideo ? 'video' : '' },
    );
    if (!newId) throw new Error('create failed');
    // Parcel uploads are filed like the source parcel 360; property uploads
    // have no folder-nesting behavior in the source — kept identical.
    if (scope.kind === 'parcel')
      await nestUnderPattadar({ passbookRef: scope.passbookRef || '', parcelLabel: scope.parcelLabel || '' }, nodeId);
    refresh();
    if (isVideo) {
      if (notifyOne) notify('File uploaded');
      return;
    }
    setClassifying((s) => new Set(s).add(newId));
    // Background classify → reclassify.
    void (async () => {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const er = await apiFetch('/api/gateway/pattadar/import-registered-document', { method: 'POST', body: fd });
        if (er.ok) {
          const f = ((await er.json()) as { fields?: { doc_type?: string } })?.fields || {};
          await gql('mutation($id:String!,$t:String!){ updateDocumentType(id:$id,docType:$t){ id } }', {
            id: newId,
            t: classifierToType(String(f.doc_type || '')),
          });
        }
      } catch {
        /* stays Other */
      } finally {
        setClassifying((s) => {
          const n = new Set(s);
          n.delete(newId);
          return n;
        });
        refresh();
      }
    })();
    if (notifyOne) notify('File uploaded');
  };

  const uploadBatch = async (files: File[]) => {
    let batch = files;
    if (batch.length > MAX_BATCH_FILES) {
      notify(`Only the first ${MAX_BATCH_FILES} files will be uploaded — max ${MAX_BATCH_FILES} at a time`, 'warning');
      batch = batch.slice(0, MAX_BATCH_FILES);
    }
    const totalBytes = batch.reduce((s, f) => s + (f.size || 0), 0);
    if (totalBytes > MAX_BATCH_BYTES) {
      notify('Uploads are limited to 1 GB at a time — remove some files and retry', 'error');
      return;
    }
    setUploading(true);
    let done = 0;
    for (const f of batch) {
      try {
        await uploadOne(f, batch.length === 1);
        done += 1;
      } catch (err) {
        if (err instanceof Error && err.message === 'storage-offline') {
          // The storage gateway is unreachable — one clear alert, stop the batch.
          setStorageDown(true);
          break;
        }
        notify(`Upload failed${f?.name ? ` — ${f.name}` : ''}`, 'error');
      }
    }
    setUploading(false);
    if (done > 1) notify(`${done} files uploaded`);
  };

  const onPick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) void uploadBatch(files);
  };

  // ── reclassify / delete ───────────────────────────────────────────────
  const saveReclassify = async () => {
    if (!reclassify?.sel) {
      setReclassify(null);
      return;
    }
    const { row, sel } = reclassify;
    setReclassify(null);
    try {
      await gql('mutation($id:String!,$t:String!){ updateDocumentType(id:$id,docType:$t){ id } }', {
        id: row.id,
        t: sel,
      });
      notify('Category updated');
      refresh();
    } catch {
      notify('Could not update type', 'error');
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    await trashDocuments([{ id: confirmDelete.id, fileRef: confirmDelete.fileRef }]);
    notify('Document deleted');
    setConfirmDelete(null);
    refresh();
  };

  const exportBrand: ExportBrand = {
    brand: 'Pattadar',
    title: 'Documents',
    subtitle: 'Andhra Pradesh / Telangana Land Records',
    watermark: 'PATTADAR',
  };
  const exportCols: ExportCol<Row>[] = [
    { key: 'name', title: 'Name' },
    { key: 'docTypeLabel', title: 'Type' },
    { key: 'regYear', title: 'Reg. Year' },
    { key: 'source', title: 'Source' },
    { key: 'createdAt', title: 'Created', fmt: (v) => fmtLocal(String(v ?? '')) },
  ];

  return (
    <Box>
      {storageDown && (
        <Alert severity="info" onClose={() => setStorageDown(false)} sx={{ mb: 1.5 }}>
          {STORAGE_OFFLINE_MSG}
        </Alert>
      )}

      {/* Drop zone — click to pick or drag files in (source Upload.Dragger). */}
      <Box
        component="label"
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          if (!uploading) onPick(e.dataTransfer.files);
        }}
        sx={{
          display: 'block',
          textAlign: 'center',
          border: '1px dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          bgcolor: dragOver ? 'action.hover' : 'transparent',
          borderRadius: 2,
          px: 2,
          py: 1.5,
          mb: 1.5,
          cursor: uploading ? 'default' : 'pointer',
        }}
      >
        <input type="file" hidden multiple accept={ACCEPT} disabled={uploading} onChange={(e) => {
          onPick(e.target.files);
          e.target.value = '';
        }} />
        <UploadFileOutlinedIcon color="primary" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {uploading ? 'Uploading…' : 'Drop files here, or click to upload'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          PDF / JPG / PNG / MP4 · up to 10 files, 1 GB per upload · type is detected automatically
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, justifyContent: 'flex-end' }}>
        <Button component="label" size="small" variant="contained" startIcon={<UploadFileOutlinedIcon />} disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
          <input type="file" hidden multiple accept={ACCEPT} onChange={(e) => {
            onPick(e.target.files);
            e.target.value = '';
          }} />
        </Button>
        <ExportMenu filename={`pattadar-${scope.kind}-files`} brand={exportBrand} cols={exportCols} rows={rows} />
      </Box>

      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No documents linked yet — drop a deed, photo or receipt above and it is read and classified automatically.
        </Typography>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Reg. Year</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FileThumb doc={r} name={r.name} onOpen={() => void openFile(r)} />
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, cursor: r.fileRef ? 'pointer' : 'default' }}
                          onClick={() => void openFile(r)}
                        >
                          {r.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {r.isClassifying ? (
                        <Chip size="small" label="Classifying…" color="info" variant="outlined" />
                      ) : (
                        <Chip size="small" variant="outlined" label={r.docTypeLabel} />
                      )}
                    </TableCell>
                    <TableCell>{r.regYear || '—'}</TableCell>
                    <TableCell>{r.source || '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtLocal(r.createdAt)}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        aria-label={`Actions for ${r.name}`}
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
            if (menuFor) void openFile(menuFor.row);
            setMenuFor(null);
          }}
        >
          Open
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) void downloadFile(menuFor.row);
            setMenuFor(null);
          }}
        >
          Download
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) {
              if (menuFor.row.isClassifying) {
                notify('Still classifying — try again in a moment.', 'info');
              } else {
                setReclassify({ row: menuFor.row, sel: menuFor.row.docType });
              }
            }
            setMenuFor(null);
          }}
        >
          Reclassify…
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

      {/* Reclassify dialog */}
      <Dialog open={!!reclassify} onClose={() => setReclassify(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Change document type</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            size="small"
            value={reclassify?.sel ?? ''}
            onChange={(e) => setReclassify((t) => (t ? { ...t, sel: e.target.value } : t))}
            sx={{ mt: 1 }}
          >
            {DOC_CATEGORIES.map((c) => (
              <MenuItem key={c.key} value={c.key}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReclassify(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveReclassify()}>
            Save
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

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
