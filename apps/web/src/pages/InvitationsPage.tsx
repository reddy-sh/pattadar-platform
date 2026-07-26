/**
 * Invitations — functional-parity port of the rhub pattadar InvitationsView:
 * invitee / scope / role / status / expiry table, Send-Invitation dialog
 * (scope type + id, role, expiry), Accept / Revoke / Delete row actions and
 * CSV/Excel/PDF export.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
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
import AddIcon from '@mui/icons-material/Add';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { Invitation } from '@pattadar/core';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { ExportMenu } from '../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../export/ExportMenu';
import { fmtLocal } from '../lib/format';
import {
  createInvitation,
  deleteInvitation,
  updateInvitationStatus,
  useInvitationsList,
} from './families/familiesData';

interface Toast {
  msg: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

const STATUS_CHIP: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  pending: { label: 'PENDING', color: 'warning' },
  accepted: { label: 'ACCEPTED', color: 'success' },
  revoked: { label: 'REVOKED', color: 'error' },
  expired: { label: 'EXPIRED', color: 'default' },
};

export function InvitationsPage() {
  const queryClient = useQueryClient();
  const { data: invitations, isSample } = useInvitationsList();
  const [toast, setToast] = useState<Toast | null>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; row: Invitation } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invitation | null>(null);

  // Send-Invitation dialog state.
  const [sendOpen, setSendOpen] = useState(false);
  const [contact, setContact] = useState('');
  const [scopeType, setScopeType] = useState('parcel');
  const [scopeId, setScopeId] = useState('');
  const [role, setRole] = useState('view');
  const [expiry, setExpiry] = useState('');
  const [errors, setErrors] = useState<{ contact?: string; scopeId?: string }>({});

  const notify = (msg: string, severity: Toast['severity'] = 'success') =>
    setToast({ msg, severity });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] });

  const openSend = () => {
    setContact('');
    setScopeType('parcel');
    setScopeId('');
    setRole('view');
    setExpiry('');
    setErrors({});
    setSendOpen(true);
  };

  const handleCreate = async () => {
    const errs: { contact?: string; scopeId?: string } = {};
    if (!contact.trim()) errs.contact = 'Contact is required';
    if (!scopeId.trim()) errs.scopeId = 'Scope ID is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await createInvitation({
        scopeType,
        scopeId: scopeId.trim(),
        role,
        inviteeContact: contact.trim(),
        expiry: expiry || '2026-12-31',
      });
      notify('Invitation sent');
      setSendOpen(false);
      refresh();
    } catch {
      notify('Could not send the invitation', 'error');
    }
  };

  const handleStatus = async (inv: Invitation, status: 'accepted' | 'revoked') => {
    try {
      await updateInvitationStatus(inv.id, status);
      notify(status === 'accepted' ? 'Invitation accepted' : 'Invitation revoked');
      refresh();
    } catch {
      notify('Could not update the invitation', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteInvitation(deleteTarget.id);
      notify('Invitation deleted');
      refresh();
    } catch {
      notify('Could not delete the invitation', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const rowActions = (inv: Invitation) => {
    const acts: { key: string; label: string; danger?: boolean; onClick: () => void }[] = [];
    if (inv.status === 'pending')
      acts.push({ key: 'accept', label: 'Accept', onClick: () => void handleStatus(inv, 'accepted') });
    if (inv.status === 'pending' || inv.status === 'accepted')
      acts.push({ key: 'revoke', label: 'Revoke', onClick: () => void handleStatus(inv, 'revoked') });
    acts.push({ key: 'delete', label: 'Delete', danger: true, onClick: () => setDeleteTarget(inv) });
    return acts;
  };

  const exportCols: ExportCol<Invitation>[] = [
    { key: 'inviteeContact', title: 'Invitee' },
    { key: 'scopeType', title: 'Scope' },
    { key: 'scopeId', title: 'Scope ID' },
    { key: 'role', title: 'Role' },
    { key: 'status', title: 'Status' },
    { key: 'expiry', title: 'Expiry' },
    { key: 'createdAt', title: 'Created', fmt: (v) => fmtLocal(String(v ?? '')) },
  ];
  const exportBrand: ExportBrand = {
    brand: 'Pattadar',
    title: 'Invitations',
    subtitle: 'Access invitations',
    watermark: 'PATTADAR',
  };

  const pending = invitations.filter((i) => i.status === 'pending').length;

  return (
    <>
      <PageHeader
        title="Invitations"
        subtitle={
          pending
            ? `${pending} invitation${pending !== 1 ? 's' : ''} waiting for a response.`
            : 'Invites you send to family members and partners appear here.'
        }
        sample={isSample}
        actions={
          <>
            <ExportMenu filename="pattadar-invitations" brand={exportBrand} cols={exportCols} rows={invitations} />
            <Button variant="contained" startIcon={<AddIcon />} onClick={openSend}>
              Send Invitation
            </Button>
          </>
        }
      />

      {invitations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MailOutlinedIcon />}
            title="No invitations yet"
            description="When you add a family member or partner, we send them a link to confirm their details. Those invites live here."
            action={
              <Button variant="contained" startIcon={<AddIcon />} onClick={openSend}>
                Send Invitation
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Invitee</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Scope ID</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Expiry</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {invitations.map((inv) => {
                  const chip = STATUS_CHIP[inv.status] ?? STATUS_CHIP.pending;
                  return (
                    <TableRow key={inv.id} hover>
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {inv.inviteeContact}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={inv.scopeType} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {inv.scopeId}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" color="info" label={inv.role} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={chip.color === 'default' ? undefined : chip.color}
                          label={chip.label}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {inv.expiry ? fmtLocal(inv.expiry, { dateOnly: true }) : '—'}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtLocal(inv.createdAt)}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          aria-label="Invitation actions"
                          onClick={(e) => setRowMenu({ anchor: e.currentTarget, row: inv })}
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
        </Card>
      )}

      {/* Row-action menu. */}
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

      {/* Send Invitation dialog. */}
      <Dialog open={sendOpen} onClose={() => setSendOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Send Invitation</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            required
            size="small"
            label="Invitee Contact (Mobile / Email)"
            placeholder="9876543210 or email@example.com"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            error={!!errors.contact}
            helperText={errors.contact}
            sx={{ mt: 1 }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 2 }}>
            <TextField
              select
              size="small"
              label="Scope Type"
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value)}
            >
              <MenuItem value="parcel">Parcel</MenuItem>
              <MenuItem value="document">Document</MenuItem>
              <MenuItem value="passbook">Passbook</MenuItem>
            </TextField>
            <TextField
              size="small"
              required
              label="Scope ID"
              placeholder="ID of parcel/document"
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              error={!!errors.scopeId}
              helperText={errors.scopeId}
            />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 2 }}>
            <TextField
              select
              size="small"
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <MenuItem value="view">View</MenuItem>
              <MenuItem value="claim">Claim</MenuItem>
              <MenuItem value="manage">Manage</MenuItem>
            </TextField>
            <TextField
              size="small"
              label="Expiry Date"
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleCreate()}>
            Send
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm. */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete this invitation?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={4000} onClose={() => setToast(null)}>
        <Alert severity={toast?.severity ?? 'success'} onClose={() => setToast(null)}>
          {toast?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
