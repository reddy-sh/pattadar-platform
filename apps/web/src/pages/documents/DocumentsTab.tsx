/**
 * All documents — functional port of the rhub DocumentsView (table mode) +
 * FilesPanel upload pipeline: every classified document with doc-type chips,
 * real My-Drive filenames, preview/download via blob fetch, upload (≤10
 * files / 1 GB per batch) with background AI classification, link-to-parcel /
 * link-to-khata, "Create parcel from this deed", change-type, and the trash
 * flow (storage node DELETE + document row removal).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
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
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
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
import SearchIcon from '@mui/icons-material/Search';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import { sampleDocuments, sampleParcels, samplePassbooks } from '@pattadar/core';
import { apiFetch, gql } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ExportMenu } from '../../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../../export/ExportMenu';
import { fmtLocal } from '../../lib/format';
import { useLiveOrSample } from '../../data/useLiveOrSample';
import {
  DOC_CATEGORIES,
  DEED_GROUP,
  FAMILIES,
  classifierToType,
  familyOfType,
  isDeedType,
  labelOfType,
} from './docTypes';
import {
  downloadBlob,
  fetchFileBlob,
  fetchNodeNames,
  nestUnderPattadar,
  openBlob,
  trashDocuments,
  uploadToDrive,
} from './storage';

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
        `query { documents { id fileRef docType parcelId passbookId propertyId docNo regYear source createdAt } parcels { id surveyNo subdivision passbookId } passbooks { id ref pattadarNo ownerName village } }`,
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
}

type PickerMode = 'parcel' | 'khata' | 'deed' | 'type';

export function DocumentsTab({
  onToast,
}: {
  onToast: (msg: string, severity: 'success' | 'error' | 'info') => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isSample } = useDocumentsFull();
  const [family, setFamily] = useState('All');
  const [search, setSearch] = useState('');
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [classifying, setClassifying] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<{ el: HTMLElement; row: Row } | null>(null);
  const [picker, setPicker] = useState<{ mode: PickerMode; row: Row; sel: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pattadar', 'documents-full'] });

  // Resolve real My Drive filenames from the storage node ids (best-effort).
  useEffect(() => {
    const refs = Array.from(new Set(data.documents.map((d) => d.fileRef).filter(Boolean)));
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
  }, [data.documents]);

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
          fileNames[d.fileRef] ||
          d.docNo ||
          (d.docType === 'photo' ? 'Photo' : titleize(d.docType || 'Document')),
        linkedTo,
      };
    });
  }, [data, fileNames]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (family !== 'All' && familyOfType(r.docType) !== family) return false;
      if (needle && ![r.name, r.docTypeLabel, r.linkedTo, r.source].join(' ').toLowerCase().includes(needle))
        return false;
      return true;
    });
  }, [rows, family, search]);

  // ── preview / download ────────────────────────────────────────────────
  const openFile = async (r: Row) => {
    if (!r.fileRef) return;
    try {
      openBlob(await fetchFileBlob(r.fileRef));
    } catch {
      onToast('Could not open file', 'error');
    }
  };
  const downloadFile = async (r: Row) => {
    if (!r.fileRef) return;
    try {
      downloadBlob(await fetchFileBlob(r.fileRef), r.name);
    } catch {
      onToast('Could not download file', 'error');
    }
  };

  // ── upload + background AI classification (FilesPanel pipeline) ───────
  const uploadOne = async (file: File, notify = true) => {
    const nodeId = await uploadToDrive(file);
    if (!nodeId) throw new Error('upload failed');
    // Videos are typed directly (the AI classifier only reads documents/images);
    // everything else lands as "other" and is reclassified in the background.
    const isVideo = String(file.type || '').startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name || '');
    const created = await gql<{ createDocument: { id: string } | null }>(
      'mutation($parcelId:String!,$passbookId:String!,$docType:String!,$fileRef:String!,$docNo:String!,$sroCode:String!,$regYear:String!,$source:String!,$tags:String!){ createDocument(parcelId:$parcelId,passbookId:$passbookId,docType:$docType,fileRef:$fileRef,docNo:$docNo,sroCode:$sroCode,regYear:$regYear,source:$source,tags:$tags){ id } }',
      {
        parcelId: '',
        passbookId: '',
        docType: isVideo ? 'video' : 'other',
        fileRef: nodeId,
        docNo: '',
        sroCode: '',
        regYear: '',
        source: 'upload',
        tags: isVideo ? 'video' : '',
      },
    );
    const newId = created?.createDocument?.id;
    refresh();
    if (isVideo) {
      if (notify) onToast('File uploaded', 'success');
      return;
    }
    if (newId) setClassifying((s) => new Set(s).add(newId));
    // Background classify → reclassify.
    void (async () => {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const er = await apiFetch('/api/gateway/pattadar/import-registered-document', {
          method: 'POST',
          body: fd,
        });
        if (er.ok && newId) {
          const f = (await er.json())?.fields || {};
          const detected = classifierToType(String(f.doc_type || ''));
          await gql('mutation($id:String!,$t:String!){ updateDocumentType(id:$id,docType:$t){ id } }', {
            id: newId,
            t: detected,
          });
        }
      } catch {
        /* stays Other */
      } finally {
        if (newId)
          setClassifying((s) => {
            const n = new Set(s);
            n.delete(newId);
            return n;
          });
        refresh();
      }
    })();
    if (notify) onToast('File uploaded', 'success');
  };

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
    for (const f of batch) {
      try {
        await uploadOne(f, batch.length === 1);
      } catch {
        onToast(`Upload failed${f?.name ? ` — ${f.name}` : ''}`, 'error');
      }
    }
    setUploading(false);
    if (batch.length > 1) onToast(`${batch.length} files uploaded`, 'success');
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
    await trashDocuments([{ id: confirmDelete.id, fileRef: confirmDelete.fileRef }]);
    onToast('Document deleted', 'success');
    setConfirmDelete(null);
    refresh();
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

  return (
    <>
      {/* Toolbar: family chips + search + upload + export */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        {FAMILIES.map((f) => (
          <Chip
            key={f}
            size="small"
            label={f}
            color={family === f ? 'primary' : 'default'}
            variant={family === f ? 'filled' : 'outlined'}
            onClick={() => setFamily(f)}
          />
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <TextField
          size="small"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
        <ExportMenu filename="pattadar-documents" brand={exportBrand} cols={exportCols} rows={shown} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        PDF / JPG / PNG / MP4 · up to 10 files, 1 GB per upload · type is detected automatically
      </Typography>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DescriptionOutlinedIcon />}
            title={family === 'All' ? 'No documents yet' : `No ${family.toLowerCase()} here yet`}
            description="Upload a deed or passbook photo — it is read automatically and filed under the right parcel."
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Linked to</TableCell>
                  <TableCell>Reg. Year</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: r.fileRef ? 'pointer' : 'default' }}
                        onClick={() => void openFile(r)}
                      >
                        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{docIcon(r.docType)}</Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {r.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {classifying.has(r.id) ? (
                        <Chip size="small" label="Classifying…" color="info" variant="outlined" />
                      ) : (
                        <Chip size="small" variant="outlined" label={r.docTypeLabel} />
                      )}
                    </TableCell>
                    <TableCell>
                      {r.linkedTo ? <Chip size="small" variant="outlined" label={r.linkedTo} /> : '—'}
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
