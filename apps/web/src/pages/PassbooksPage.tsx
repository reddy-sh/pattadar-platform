/**
 * Passbooks — functional-parity port of the rhub pattadar app's
 * PassbooksView: "<n> khatas" header, extent/villages/parcels subtitle,
 * stat cards (Passbooks / Total Extent / Villages / Acquisition Cost),
 * search, List/Grid toggle, CSV/Excel/PDF export, khata cards and the
 * New-Passbook AI import flow.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
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
import Link from '@mui/material/Link';
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
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import ViewListOutlinedIcon from '@mui/icons-material/ViewListOutlined';
import { formatArea } from '@pattadar/core';
import type { Passbook } from '@pattadar/core';
import { CardActionsMenu, StatCard, EmptyLanding } from '../components/holdingCards';
import { ExportMenu } from '../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../export/ExportMenu';
import { usePassbooks } from '../data/hooks';
import { deletePassbook } from '../data/pattadarActions';
import { avaColor, fmtLocal } from '../lib/format';
import { PassbookCreateDialog } from './passbooks/PassbookCreateDialog';

interface Toast {
  msg: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

export function PassbooksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isSample, isLoading } = usePassbooks();
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Passbook | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; row: Passbook } | null>(null);

  const notify = (msg: string, severity: Toast['severity'] = 'success') => setToast({ msg, severity });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] });

  const groupName = useMemo(() => new Map(data.groups.map((g) => [g.id, g.name])), [data.groups]);

  // Per-passbook parcel count + acquisition cost (from parcels.purchasePrice).
  const parcelAgg = useMemo(() => {
    const agg = new Map<string, { count: number; cost: number }>();
    for (const p of data.parcels) {
      const a = agg.get(p.passbookId || '') || { count: 0, cost: 0 };
      a.count += 1;
      a.cost += Number(p.purchasePrice) || 0;
      agg.set(p.passbookId || '', a);
    }
    return agg;
  }, [data.parcels]);
  const acqCost = useMemo(
    () => [...parcelAgg.values()].reduce((s, a) => s + a.cost, 0),
    [parcelAgg],
  );

  const totalExtent = data.passbooks.reduce((s, p) => s + (Number(p.totalExtent) || 0), 0);
  const villageCount = new Set(data.passbooks.map((p) => p.village).filter(Boolean)).size;
  const totalParcels = [...parcelAgg.values()].reduce((s, a) => s + a.count, 0);

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      !q
        ? data.passbooks
        : data.passbooks.filter((b) =>
            [
              b.ownerName,
              b.fatherHusbandName,
              b.pattadarNo,
              b.village,
              b.mandal,
              b.district,
              b.state,
              groupName.get(b.groupId || '') || '',
            ]
              .join(' ')
              .toLowerCase()
              .includes(q),
          ),
    [data.passbooks, groupName, q],
  );

  const exportCols: ExportCol<Passbook>[] = [
    { key: 'ownerName', title: 'Owner' },
    { key: 'fatherHusbandName', title: 'Father / Husband' },
    { key: 'pattadarNo', title: 'Khata No.' },
    { key: 'totalExtent', title: 'Total Extent', fmt: (v) => formatArea(Number(v) || 0) },
    { key: 'village', title: 'Village' },
    { key: 'mandal', title: 'Mandal' },
    { key: 'district', title: 'District' },
    { key: 'state', title: 'State' },
    { key: 'createdAt', title: 'Created', fmt: (v) => fmtLocal(String(v ?? '')) },
  ];
  const exportBrand: ExportBrand = {
    brand: 'Pattadar',
    title: 'Passbook Register',
    subtitle: 'Andhra Pradesh / Telangana Land Records',
    watermark: 'PATTADAR',
  };

  const openParcels = (b: Passbook) => navigate(`/app/parcels?pb=${b.id}`);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePassbook(deleteTarget.id);
      notify('Passbook deleted — its files moved to Trash');
      refresh();
    } catch {
      notify("Couldn't delete this passbook — try again", 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const rowActions = (b: Passbook) => [
    { key: 'open', label: 'Open land parcels', onClick: () => openParcels(b) },
    { key: 'record', label: 'Passbook record', onClick: () => navigate(`/app/passbooks/${b.id}`) },
    { key: 'delete', label: 'Delete', danger: true, onClick: () => setDeleteTarget(b) },
  ];

  const firstRun = !isLoading && data.passbooks.length === 0;

  const chip = (icon: string, text?: string) =>
    text ? (
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          bgcolor: '#EEF8F1',
          border: '1px solid #E5E7EB',
          borderRadius: 999,
          px: 1.25,
          py: 0.25,
          fontSize: 12,
          color: '#1A1A1A',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {icon} {text}
      </Box>
    ) : null;

  return (
    <>
      {firstRun ? (
        <EmptyLanding
          icon="📗"
          title="Start your land record"
          body="Your pattadar passbook is the foundation. Upload a passbook, Meebhoomi or 1-B — photo or PDF, English or Telugu — and the khata, owner and land parcels are read automatically."
          ctaText="＋ Add your first passbook"
          onCta={() => setCreateOpen(true)}
          secondary={
            <Typography variant="caption" color="text.secondary">
              Up to 5 documents at once · or enter the details manually
            </Typography>
          }
        />
      ) : (
        <>
          {/* Header: title + khata chip + extent subtitle. */}
          <Box sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h2" component="h1">
                Passbooks
              </Typography>
              <Chip
                size="small"
                color="primary"
                label={`${data.passbooks.length} khata${data.passbooks.length !== 1 ? 's' : ''}`}
              />
              {isSample && (
                <Tooltip title="The live service is not reachable — showing bundled sample data.">
                  <Chip size="small" variant="outlined" color="secondary" label="Sample data" />
                </Tooltip>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {formatArea(totalExtent)} across {villageCount} village{villageCount !== 1 ? 's' : ''} ·{' '}
              {totalParcels} land parcel{totalParcels !== 1 ? 's' : ''}
              {acqCost > 0 ? ` · ₹${acqCost.toLocaleString('en-IN')} invested` : ''}.
            </Typography>
          </Box>

          {/* Stat cards. */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
            <StatCard label="Passbooks" value={data.passbooks.length} />
            <StatCard label="Total Extent" value={formatArea(totalExtent)} />
            <StatCard label="Villages" value={villageCount} />
            <StatCard label="Acquisition Cost" value={`₹${acqCost.toLocaleString('en-IN')}`} />
          </Box>

          {/* Toolbar: search · view toggle · export · new passbook. */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
            <TextField
              size="small"
              placeholder="Search passbooks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 220 }}
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
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_e, val) => val && setView(val)}
              aria-label="View mode"
            >
              <ToggleButton value="list" aria-label="List view">
                <ViewListOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} /> List
              </ToggleButton>
              <ToggleButton value="grid" aria-label="Grid view">
                <GridViewOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} /> Grid
              </ToggleButton>
            </ToggleButtonGroup>
            <ExportMenu filename="pattadar-passbooks" brand={exportBrand} cols={exportCols} rows={shown} />
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              New Passbook
            </Button>
          </Box>

          {view === 'grid' ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
                gap: 1.5,
              }}
            >
              {shown.map((b) => {
                const agg = parcelAgg.get(b.id) || { count: 0, cost: 0 };
                const acres = Number(b.totalExtent) || 0;
                const gname = groupName.get(b.groupId || '') || '';
                return (
                  <Card
                    key={b.id}
                    onClick={() => openParcels(b)}
                    sx={{ cursor: 'pointer', position: 'relative', p: 1.5 }}
                  >
                    <CardActionsMenu actions={rowActions(b)} />
                    {/* Emerald passbook banner. */}
                    <Box
                      sx={{
                        height: 72,
                        borderRadius: 2.5,
                        background: 'linear-gradient(135deg, #1E7A46 0%, #35996B 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 34,
                      }}
                    >
                      📗
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mt: 0.75 }}>
                      <Avatar
                        src={b.photo || undefined}
                        sx={{ width: 46, height: 46, bgcolor: avaColor(b.ownerName || '?'), flexShrink: 0 }}
                      >
                        {(b.ownerName || '?').slice(0, 1).toUpperCase()}
                      </Avatar>
                      <Typography
                        sx={{
                          minWidth: 0,
                          fontWeight: 700,
                          fontSize: 18,
                          lineHeight: 1.25,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {b.ownerName || '(owner not set)'}
                      </Typography>
                    </Box>
                    <Box sx={{ mt: 1.75 }}>
                      <Box component="span" sx={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>
                        {acres.toFixed(2).replace(/\.00$/, '')}
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'text.secondary',
                          ml: 0.75,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        Acres
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
                      {chip('📍', b.village)}
                      {chip('👨', b.fatherHusbandName)}
                      {chip('👪', gname)}
                      {chip('🌾', `${agg.count} parcel${agg.count !== 1 ? 's' : ''}`)}
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 1,
                        mt: 1.75,
                        pt: 1.5,
                        borderTop: '1px solid #E5E7EB',
                        fontSize: 11.5,
                        color: 'text.secondary',
                      }}
                    >
                      <Box
                        component="span"
                        sx={{
                          bgcolor: '#EEF8F1',
                          border: '1px solid #1E7A4633',
                          color: '#1E7A46',
                          fontWeight: 700,
                          fontSize: 13,
                          borderRadius: 2,
                          px: 1.25,
                          py: 0.25,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Khata {b.pattadarNo}
                      </Box>
                      <Box component="span" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Updated {fmtLocal(b.createdAt, { dateOnly: true })}
                      </Box>
                    </Box>
                  </Card>
                );
              })}
            </Box>
          ) : (
            <TableContainer component={Card}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Owner</TableCell>
                    <TableCell>Father / Husband</TableCell>
                    <TableCell>Khata No.</TableCell>
                    <TableCell>Total Extent</TableCell>
                    <TableCell>Village</TableCell>
                    <TableCell>Mandal</TableCell>
                    <TableCell>District</TableCell>
                    <TableCell>State</TableCell>
                    <TableCell>Family / Group</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shown.map((b) => {
                    const gname = groupName.get(b.groupId || '') || '';
                    return (
                      <TableRow key={b.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar
                              variant="rounded"
                              src={b.photo || undefined}
                              sx={{ width: 28, height: 28, bgcolor: avaColor(b.ownerName || '?'), fontSize: 13 }}
                            >
                              {(b.ownerName || '?').slice(0, 1).toUpperCase()}
                            </Avatar>
                            {b.ownerName ? (
                              <Link component="button" underline="hover" onClick={() => openParcels(b)}>
                                {b.ownerName}
                              </Link>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                —
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>{b.fatherHusbandName || '—'}</TableCell>
                        <TableCell>{b.pattadarNo}</TableCell>
                        <TableCell>{formatArea(Number(b.totalExtent) || 0)}</TableCell>
                        <TableCell>{b.village}</TableCell>
                        <TableCell>{b.mandal}</TableCell>
                        <TableCell>{b.district}</TableCell>
                        <TableCell>{b.state}</TableCell>
                        <TableCell>
                          {gname ? (
                            <Chip size="small" variant="outlined" color="secondary" label={`👪 ${gname}`} />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>{fmtLocal(b.createdAt)}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            aria-label="Row actions"
                            onClick={(e) => setRowMenu({ anchor: e.currentTarget, row: b })}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Row-action menu (list view). */}
      <Menu anchorEl={rowMenu?.anchor ?? null} open={Boolean(rowMenu)} onClose={() => setRowMenu(null)}>
        {rowMenu &&
          rowActions(rowMenu.row).map((a) => (
            <MenuItem
              key={a.key}
              onClick={() => {
                setRowMenu(null);
                a.onClick();
              }}
              sx={a.danger ? { color: 'error.main' } : undefined}
            >
              {a.label}
            </MenuItem>
          ))}
      </Menu>

      {/* Delete confirmation (files → My Drive Trash, then the row). */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete this passbook?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Its land parcels, their ownership history and documents are also removed — files go to My Drive
            Trash. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <PassbookCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          refresh();
        }}
        notify={notify}
      />

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
