/**
 * Registered deeds — functional port of the rhub RegisteredDocsView +
 * RegisteredDocDetailView (inline expander instead of a detail route, since
 * /app/deeds redirects into Documents): list of AI-imported registered
 * documents, expandable row with parties / property & boundaries / fees /
 * chain, "Add as Parcel" (createParcelFromDocument) and "Link to Passbook"
 * (linkDocumentPassbook) actions, delete, CSV/Excel/PDF export and the
 * Register-a-Deed import dialog.
 */
import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { formatINR, parseISOToDisplay, sampleRegisteredDocuments } from '@pattadar/core';
import type { RegisteredDocument } from '@pattadar/core';
import { gql } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Skeletons';
import { stickyHeadSx } from '../../components/tableSx';
import { ExportMenu } from '../../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../../export/ExportMenu';
import { fmtLocal } from '../../lib/format';
import { useLiveOrSample } from '../../data/useLiveOrSample';
import { DeedImportDialog } from './DeedImportDialog';

interface PassbookOpt {
  id: string;
  ref: string;
  pattadarNo: string;
  ownerName: string;
  village: string;
}

interface DeedsData {
  deeds: RegisteredDocument[];
  passbooks: PassbookOpt[];
}

function useRegisteredDeeds() {
  return useLiveOrSample<DeedsData>(
    'registered-documents',
    async () => {
      const d = await gql<DeedsData & { registeredDocuments: RegisteredDocument[] }>(
        `query { registeredDocuments { id ref docType documentNo regYear sro surveyNo plotNo consideration village district passbookId parcelId createdAt } passbooks { id ref pattadarNo ownerName village } }`,
      );
      return { deeds: d.registeredDocuments ?? [], passbooks: d.passbooks ?? [] };
    },
    { deeds: sampleRegisteredDocuments, passbooks: [] },
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface DeedDetail {
  registrationDate?: string;
  executionDate?: string;
  bookNo?: string;
  scanningId?: string;
  stampDuty?: number;
  transferDuty?: number;
  registrationFee?: number;
  userCharges?: number;
  totalFee?: number;
  extent?: string;
  classification?: string;
  mandal?: string;
  boundaryNorth?: string;
  boundarySouth?: string;
  boundaryEast?: string;
  boundaryWest?: string;
  priorDocument?: string;
  gpaDocument?: string;
  parties?: { role: string; name: string; parentage: string; age?: number; address?: string; isGpa?: boolean }[];
}

/** Expanded row body — the RegisteredDocDetailView content, inline. */
function DeedExpanded({
  deed,
  passbooks,
  onToast,
  onChanged,
}: {
  deed: RegisteredDocument;
  passbooks: PassbookOpt[];
  onToast: (msg: string, severity: 'success' | 'error' | 'info') => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [linkPb, setLinkPb] = useState('');
  const [busy, setBusy] = useState(false);
  const detailQ = useQuery({
    queryKey: ['pattadar', 'registered-document', deed.id],
    queryFn: async (): Promise<DeedDetail> => {
      try {
        const d = await gql<{ registeredDocument: DeedDetail | null }>(
          `query($id: String!) { registeredDocument(id: $id) { registrationDate executionDate bookNo scanningId stampDuty transferDuty registrationFee userCharges totalFee extent classification mandal boundaryNorth boundarySouth boundaryEast boundaryWest priorDocument gpaDocument parties { role name parentage age address isGpa } } }`,
          { id: deed.id },
        );
        return d.registeredDocument ?? {};
      } catch {
        // Sample rows carry parties/stampDuty enrichments in the list shape.
        return { parties: undefined, stampDuty: deed.stampDuty };
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  const det = detailQ.data ?? {};

  const addToParcel = async () => {
    if (!linkPb) {
      onToast('Pick a passbook first', 'info');
      return;
    }
    setBusy(true);
    try {
      const data = await gql<{ createParcelFromDocument: { id: string; ref: string } | null }>(
        'mutation($d: String!, $p: String!) { createParcelFromDocument(documentId: $d, passbookId: $p) { id ref } }',
        { d: deed.id, p: linkPb },
      );
      if (data?.createParcelFromDocument?.id) {
        onToast(`Parcel ${data.createParcelFromDocument.ref} created & linked`, 'success');
        onChanged();
        navigate('/app/parcels');
      } else onToast('Could not create parcel', 'error');
    } catch {
      onToast('Could not create parcel', 'error');
    }
    setBusy(false);
  };

  const addToPassbook = async () => {
    if (!linkPb) {
      onToast('Pick a passbook first', 'info');
      return;
    }
    setBusy(true);
    try {
      const data = await gql<{ linkDocumentPassbook: { id: string } | null }>(
        'mutation($d: String!, $p: String!) { linkDocumentPassbook(documentId: $d, passbookId: $p) { id } }',
        { d: deed.id, p: linkPb },
      );
      if (data?.linkDocumentPassbook?.id) {
        onToast('Linked to passbook', 'success');
        onChanged();
      } else onToast('Could not link', 'error');
    } catch {
      onToast('Could not link', 'error');
    }
    setBusy(false);
  };

  const sampleParties = !det.parties && deed.parties ? deed.parties : '';
  const fee = (label: string, v?: number) => (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {v ? formatINR(v) : '—'}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', borderRadius: 2, my: 1 }}>
      {detailQ.isPending ? (
        <CircularProgress size={18} />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Parties
            </Typography>
            {(det.parties || []).length === 0 && !sampleParties ? (
              <Typography variant="body2" color="text.secondary">
                No parties on record
              </Typography>
            ) : sampleParties ? (
              <Typography variant="body2">{sampleParties}</Typography>
            ) : (
              (det.parties || []).map((p, i) => (
                <Box key={i} sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Chip
                      size="small"
                      label={p.role}
                      color={p.role === 'buyer' ? 'success' : 'warning'}
                      variant="outlined"
                    />
                    {p.isGpa && <Chip size="small" label="GPA" variant="outlined" />}
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {p.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.parentage}
                      {p.age ? `, ${p.age}y` : ''}
                    </Typography>
                  </Box>
                  {p.address && (
                    <Typography variant="caption" color="text.secondary">
                      {p.address}
                    </Typography>
                  )}
                </Box>
              ))
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Registered {det.registrationDate ? parseISOToDisplay(det.registrationDate) : '—'} ·
              Executed {det.executionDate ? parseISOToDisplay(det.executionDate) : '—'} · Book{' '}
              {det.bookNo || '—'} · Scanning ID {det.scanningId || '—'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Property & Boundaries
            </Typography>
            <Typography variant="body2">
              Survey / Plot: {deed.surveyNo || '—'}
              {deed.plotNo ? ` / ${deed.plotNo}` : ''} · Extent: {det.extent || '—'}
              {det.classification ? ` · ${det.classification}` : ''}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {[deed.village, det.mandal, deed.district].filter(Boolean).join(', ') || '—'}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              N: {det.boundaryNorth || '—'} · S: {det.boundarySouth || '—'} · E:{' '}
              {det.boundaryEast || '—'} · W: {det.boundaryWest || '—'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2.5, mt: 1.25, flexWrap: 'wrap' }}>
              {fee('Consideration', deed.consideration)}
              {fee('Stamp Duty', det.stampDuty ?? deed.stampDuty)}
              {fee('Transfer Duty', det.transferDuty)}
              {fee('Reg Fee', det.registrationFee)}
              {fee('User Charges', det.userCharges)}
              {fee('Total', det.totalFee)}
            </Box>
            {(det.priorDocument || det.gpaDocument) && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                Chain — prior: {det.priorDocument || '—'} · GPA: {det.gpaDocument || '—'}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Link this deed to your holdings */}
      <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
        {deed.parcelId ? (
          <Alert severity="success">A parcel was created from this deed and linked to a passbook.</Alert>
        ) : (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              select
              size="small"
              label="Choose one of your passbooks"
              value={linkPb}
              onChange={(e) => setLinkPb(e.target.value)}
              sx={{ minWidth: 280 }}
            >
              {passbooks.length === 0 && <MenuItem value="">No passbooks yet</MenuItem>}
              {passbooks.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.ref || p.pattadarNo} · {p.ownerName || p.village || ''}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="contained" size="small" disabled={busy} onClick={() => void addToParcel()}>
              Add as Parcel
            </Button>
            <Button variant="outlined" size="small" disabled={busy} onClick={() => void addToPassbook()}>
              Link to Passbook
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function RegisteredDeedsTab({
  onToast,
}: {
  onToast: (msg: string, severity: 'success' | 'error' | 'info') => void;
}) {
  const { data, isSample, isLoading } = useRegisteredDeeds();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RegisteredDocument | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['pattadar', 'registered-documents'] });
    void queryClient.invalidateQueries({ queryKey: ['pattadar', 'documents-full'] });
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await gql('mutation($id: String!) { deleteRegisteredDocument(id: $id) }', { id: confirmDelete.id });
      onToast('Registered deed deleted', 'success');
      refresh();
    } catch {
      onToast('Could not delete the deed', 'error');
    }
    setConfirmDelete(null);
  };

  const exportBrand: ExportBrand = {
    brand: 'Pattadar',
    title: 'Registered Deeds',
    subtitle: 'Andhra Pradesh / Telangana Land Records',
    watermark: 'PATTADAR',
  };
  const exportCols: ExportCol<RegisteredDocument>[] = [
    { key: 'ref', title: 'Doc ID' },
    { key: 'docType', title: 'Type' },
    { key: 'documentNo', title: 'Doc No.', fmt: (_v, r) => `${r.documentNo || '—'}${r.regYear ? '/' + r.regYear : ''}` },
    { key: 'sro', title: 'SRO' },
    { key: 'surveyNo', title: 'Survey / Plot', fmt: (_v, r) => `${r.surveyNo || '—'}${r.plotNo ? ' / ' + r.plotNo : ''}` },
    { key: 'consideration', title: 'Consideration', fmt: (v) => (v ? formatINR(Number(v)) : '—') },
    { key: 'village', title: 'Village' },
    { key: 'createdAt', title: 'Added', fmt: (v) => fmtLocal(String(v ?? ''), { dateOnly: true }) },
  ];

  // Shaped loading state — never paint the sample dataset uncredited.
  if (isLoading) return <TableSkeleton />;

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1.5 }}>
        <ExportMenu filename="pattadar-registered-deeds" brand={exportBrand} cols={exportCols} rows={data.deeds} />
        {/* One filled action per region: the empty state owns it when the list is empty. */}
        <Button
          variant={data.deeds.length === 0 ? 'tonal' : 'contained'}
          startIcon={<AddIcon />}
          onClick={() => setImportOpen(true)}
        >
          Register a Deed
        </Button>
      </Box>

      {data.deeds.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HistoryEduOutlinedIcon />}
            title="No registered deeds yet"
            description="Upload a scanned sale/gift/partition deed — the AI reads the legal details for you to review and save."
            action={
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setImportOpen(true)}>
                Register a Deed
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={stickyHeadSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40 }} />
                  <TableCell>Doc ID</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Doc No.</TableCell>
                  <TableCell>SRO</TableCell>
                  <TableCell>Survey / Plot</TableCell>
                  <TableCell align="right">Consideration</TableCell>
                  <TableCell>Village</TableCell>
                  <TableCell>Linked</TableCell>
                  <TableCell>Added</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.deeds.map((r) => (
                  <Fragment key={r.id}>
                    <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <TableCell>
                        <IconButton size="small" aria-label="Expand deed">
                          {open === r.id ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{r.ref}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={r.docType || '—'} />
                      </TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {r.documentNo || '—'}
                        {r.regYear ? `/${r.regYear}` : ''}
                      </TableCell>
                      <TableCell>{r.sro || '—'}</TableCell>
                      <TableCell>
                        {r.surveyNo || '—'}
                        {r.plotNo ? ` / ${r.plotNo}` : ''}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {r.consideration ? formatINR(r.consideration) : '—'}
                      </TableCell>
                      <TableCell>{r.village || '—'}</TableCell>
                      <TableCell>
                        {r.parcelId ? (
                          <Chip size="small" label="parcel" color="success" variant="outlined" />
                        ) : r.passbookId ? (
                          <Chip size="small" label="passbook" color="info" variant="outlined" />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtLocal(r.createdAt, { dateOnly: true })}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          aria-label={`Delete deed ${r.ref}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(r);
                          }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={11} sx={{ p: 0, border: 0 }}>
                        <Collapse in={open === r.id} unmountOnExit>
                          <DeedExpanded deed={r} passbooks={data.passbooks} onToast={onToast} onChanged={refresh} />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
      {isSample && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Sample data — the live service is not reachable.
        </Typography>
      )}

      <DeedImportDialog open={importOpen} onClose={() => setImportOpen(false)} onSaved={refresh} onToast={onToast} />

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete this registered deed?</DialogTitle>
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
