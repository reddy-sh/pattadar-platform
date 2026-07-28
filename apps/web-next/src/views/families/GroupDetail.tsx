'use client';

/**
 * GroupDetail — in-page detail section for a selected group (the rebuild's
 * routes have no /app/groups/:id, so the predecessor GroupDetailView renders here
 * as a section under the cards). Ports: header + Edit/Delete group, the
 * family inactivity-safeguard alert + notifier priority editor, and the
 * Members / Land / Invitations / Activity tabs with the full member table,
 * PersonDialog add/edit flow, verification invites and reminders.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'src/routes/hooks';
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
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { formatArea } from '@pattadar/core';
import type { Group } from '@pattadar/core';
import { ExportMenu } from '../../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../../export/ExportMenu';
import { avaColor, fmtLocal } from '../../lib/format';
import {
  addMember,
  assignLandToGroup,
  deleteGroup,
  fetchNotifiers,
  groupTypeDef,
  inviteMember,
  memberStatusChip,
  relMeta,
  removeMember,
  setNotifiers,
  updateGroup,
  updateMember,
  updateMemberStatus,
  useGroupActivity,
  useGroupMembers,
  useGroupPassbooks,
  verifyLink,
} from './familiesData';
import type { GroupMember, MemberVars } from './familiesData';
import { PersonDialog } from './PersonDialog';

type Notify = (msg: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;

/** Green tick shown next to a phone/email once that channel is verified. */
function Verified() {
  return (
    <Box component="span" title="Verified" sx={{ color: 'success.main', ml: 0.5, fontWeight: 700 }}>
      ✓
    </Box>
  );
}

const fmtDob = (v?: string) => (v ? fmtLocal(v, { dateOnly: true }) : '—');
const cap = (s?: string) => {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—';
};

interface InviteInfo {
  name: string;
  link: string;
  to: string;
}

export function GroupDetail({ group, notify }: { group: Group; notify: Notify }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] });
  const def = groupTypeDef(group.type);
  const [tab, setTab] = useState<'members' | 'land' | 'invitations' | 'activity'>('members');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [editDesc, setEditDesc] = useState(group.description);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    setEditName(group.name);
    setEditDesc(group.description);
    setTab('members');
  }, [group.id, group.name, group.description]);

  const saveEdit = async () => {
    if (!editName.trim()) return;
    try {
      await updateGroup(group.id, editName.trim(), editDesc || '');
      setEditOpen(false);
      notify('Saved');
      refresh();
    } catch {
      notify('Could not save the group', 'error');
    }
  };
  const doDelete = async () => {
    try {
      await deleteGroup(group.id);
      setDeleteOpen(false);
      notify('Group deleted');
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete the group', 'error');
    }
  };

  return (
    <Card sx={{ p: 2 }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
        <Box component="span" sx={{ fontSize: 30, lineHeight: 1 }}>
          {def.icon}
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" component="h2" noWrap>
              {group.name}
            </Typography>
            <Chip size="small" variant="outlined" label={def.label} />
          </Box>
          <Typography variant="caption" color="text.secondary">
            Your role: {group.myRole || def.primaryRole} · {group.memberCount} member
            {group.memberCount !== 1 ? 's' : ''} · {group.landCount} passbook
            {group.landCount !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => router.push(`/app/parcels?group=${group.id}`)}>
            View holdings ›
          </Button>
          <Button onClick={() => setEditOpen(true)}>Edit</Button>
          <Button color="error" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </Box>
      </Box>

      {/* ── Inactivity safeguard (family groups) ───────────────────── */}
      {def.hasTree && (
        <Alert
          severity="info"
          sx={{ mb: 1.5 }}
          action={
            <Button size="small" color="inherit" onClick={() => setNotifOpen(true)}>
              Configure notifiers
            </Button>
          }
        >
          <b>Inactivity safeguard</b> — if the head of household is inactive for 6 months, all
          family members are notified automatically. You can set an ordered notifier priority
          instead: Priority 1 is alerted first; if there is no response, Priority 2, then 3, and so
          on.
        </Alert>
      )}

      <NotifierConfigDialog
        groupId={group.id}
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notify={notify}
      />

      {/* ── Edit group dialog ──────────────────────────────────────── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit group</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            required
            size="small"
            label="Name"
            placeholder="e.g. Telukutla Family / Reddy & Sons"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            sx={{ mt: 1 }}
          />
          <TextField
            fullWidth
            size="small"
            label="Description (optional)"
            multiline
            minRows={2}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveEdit()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete group confirm ───────────────────────────────────── */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete “{group.name}”?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This removes the group and all its members (names, heirs, verification status). Any
            land assigned to it becomes personal again — passbooks are NOT deleted. This can’t be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void doDelete()}>
            Delete group
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <Tabs value={tab} onChange={(_e, v: typeof tab) => setTab(v)} sx={{ mb: 1.5 }}>
        <Tab value="members" label="Members" />
        <Tab value="land" label="Land" />
        <Tab value="invitations" label="Invitations" />
        <Tab value="activity" label="Activity" />
      </Tabs>
      {tab === 'members' && <MembersTab group={group} notify={notify} onChanged={refresh} />}
      {tab === 'land' && <LandTab group={group} notify={notify} onChanged={refresh} />}
      {tab === 'invitations' && <GroupInvitationsTab group={group} />}
      {tab === 'activity' && <ActivityTab group={group} />}
    </Card>
  );
}

/* ── Members tab ─────────────────────────────────────────────────── */

function MembersTab({
  group,
  notify,
  onChanged,
}: {
  group: Group;
  notify: Notify;
  onChanged: () => void;
}) {
  const { data, isSample } = useGroupMembers(group.id);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GroupMember | null>(null);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; row: GroupMember } | null>(null);

  const people = data.members;
  const beneficiaries = people.filter((p) => p.isBeneficiary);
  const totalShare = beneficiaries.reduce((s, m) => s + (Number(m.sharePct) || 0), 0);
  const hasTree = groupTypeDef(group.type).hasTree;

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (p: GroupMember) => {
    if (p.isSelf) return;
    setEditing(p);
    setDialogOpen(true);
  };

  const submit = useCallback(
    async (vars: MemberVars) => {
      const saved = editing ? await updateMember(editing.id, vars) : await addMember(group.id, vars);
      setDialogOpen(false);
      const becameHeir = vars.isBeneficiary && (!editing || !editing.isBeneficiary);
      if (saved && becameHeir && saved.inviteToken) {
        setInvite({
          name: vars.name,
          link: verifyLink(saved.inviteToken),
          to: saved.isMinor
            ? saved.guardianContact || saved.email || saved.phone
            : saved.email || saved.phone,
        });
      }
      notify(editing ? 'Saved' : 'Added');
      onChanged();
    },
    [editing, group.id, notify, onChanged],
  );

  const doInvite = async (p: GroupMember) => {
    const to = (p.email || p.phone || '').trim();
    if (!to) {
      notify('Add a phone or email first, then invite', 'warning');
      return;
    }
    try {
      await inviteMember(p.id);
      notify(`Invitation sent to ${to}`);
      onChanged();
    } catch {
      notify('Could not send the invitation', 'error');
    }
  };

  const doRevoke = async (p: GroupMember) => {
    try {
      await updateMemberStatus(p.id, 'revoked');
      notify('Revoked');
      onChanged();
    } catch {
      notify('Could not revoke', 'error');
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    try {
      await removeMember(removeTarget.id);
      notify('Removed');
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not remove this member', 'error');
    } finally {
      setRemoveTarget(null);
    }
  };

  const showInviteLink = (p: GroupMember) =>
    setInvite({
      name: p.name,
      link: verifyLink(p.inviteToken),
      to: p.isMinor ? p.guardianContact || p.email || p.phone : p.email || p.phone,
    });

  const rowActions = (p: GroupMember) => {
    const invited = p.inviteStatus === 'invited' || (p.status === 'pending' && !!p.inviteToken);
    const acts: { key: string; label: string; danger?: boolean; onClick: () => void }[] = [
      { key: 'edit', label: 'Edit', onClick: () => openEdit(p) },
    ];
    if (p.isBeneficiary && p.status !== 'verified')
      acts.push({
        key: 'invite',
        label: invited ? 'Send reminder' : 'Send invite',
        onClick: () => void doInvite(p),
      });
    if (p.status === 'pending' && p.inviteToken)
      acts.push({ key: 'link', label: 'Copy invite link', onClick: () => showInviteLink(p) });
    if (p.status && p.status !== 'revoked')
      acts.push({ key: 'revoke', label: 'Revoke', onClick: () => void doRevoke(p) });
    if (!p.isSelf)
      acts.push({ key: 'remove', label: 'Remove', danger: true, onClick: () => setRemoveTarget(p) });
    return acts;
  };

  const exportCols: ExportCol<GroupMember>[] = [
    { key: 'name', title: 'Name' },
    { key: 'relation', title: 'Relationship', fmt: (v) => (hasTree ? relMeta(String(v ?? '')).label : '') },
    { key: 'role', title: 'Role' },
    { key: 'phone', title: 'Contact' },
    { key: 'email', title: 'Email' },
    { key: 'dob', title: 'DOB', fmt: (v) => fmtDob(String(v ?? '')) },
    { key: 'gender', title: 'Gender', fmt: (v) => cap(String(v ?? '')) },
    { key: 'sharePct', title: 'Share %' },
    { key: 'kind', title: 'Type' },
    { key: 'status', title: 'Status' },
  ];
  const exportBrand: ExportBrand = {
    brand: 'Pattadar',
    title: `${group.name} — Members`,
    subtitle: 'Families & Groups',
    watermark: 'PATTADAR',
  };

  const inviteMsg = invite
    ? `Hi ${invite.name}, please verify your co-ownership on Pattadar: ${invite.link}`
    : '';

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {beneficiaries.length} heir{beneficiaries.length === 1 ? '' : 's'} ·{' '}
          <Box
            component="b"
            sx={{ color: totalShare > 100 ? 'error.main' : 'inherit' }}
          >
            {totalShare}% allocated
          </Box>
          {isSample ? ' · sample data' : ''}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <ExportMenu filename="pattadar-family" brand={exportBrand} cols={exportCols} rows={people} />
        <Button variant="contained" startIcon={<PersonAddAltOutlinedIcon />} onClick={openAdd}>
          Add member
        </Button>
      </Box>

      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>{hasTree ? 'Relationship' : 'Role'}</TableCell>
              <TableCell>Contact</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>DOB</TableCell>
              <TableCell>Gender</TableCell>
              <TableCell>Parcel</TableCell>
              <TableCell align="right">Share %</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Aadhaar</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {people.length === 0 && (
              <TableRow>
                <TableCell colSpan={12}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No members yet — click <b>Add member</b>.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {people.map((m) => {
              const st = memberStatusChip(m);
              const parcel = data.parcels.find((pp) => pp.id === m.parcelId);
              const kindLabel =
                m.kind === 'coowner'
                  ? 'Co-owner'
                  : m.kind === 'legalheir'
                    ? 'Legal Heir'
                    : m.kind === 'nominee'
                      ? 'Nominee'
                      : m.kind;
              return (
                <TableRow key={m.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar
                        src={m.photo || undefined}
                        sx={{ width: 26, height: 26, fontSize: 13, bgcolor: avaColor(m.name || '?') }}
                      >
                        {(m.name || '?').slice(0, 1).toUpperCase()}
                      </Avatar>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {m.name}
                      </Typography>
                      {m.isSelf && <Chip size="small" variant="outlined" label="You" />}
                      {m.isBeneficiary && (
                        <Chip size="small" color="success" variant="outlined" label="heir" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={hasTree ? relMeta(m.relation).label : m.role || '—'}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {m.phone ? (
                      <>
                        {m.phone}
                        {m.phoneVerified && <Verified />}
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {m.email ? (
                      <>
                        {m.email}
                        {m.emailVerified && <Verified />}
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDob(m.dob)}</TableCell>
                  <TableCell>{cap(m.gender)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {m.isBeneficiary ? (parcel ? parcel.surveyNo : 'Whole estate') : '—'}
                  </TableCell>
                  <TableCell align="right">{m.isBeneficiary ? `${m.sharePct}%` : '—'}</TableCell>
                  <TableCell>
                    {m.isBeneficiary && kindLabel ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={m.kind === 'coowner' ? 'info' : m.kind === 'legalheir' ? 'secondary' : 'default'}
                        label={kindLabel}
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {m.aadhaarMasked || '—'}
                  </TableCell>
                  <TableCell>
                    {st.label === '—' ? (
                      '—'
                    ) : (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={st.color === 'default' ? undefined : st.color}
                        label={st.label}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {!m.isSelf && (
                      <IconButton
                        className="rowActions"
                        size="small"
                        aria-label="Member actions"
                        onClick={(e) => setRowMenu({ anchor: e.currentTarget, row: m })}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

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

      {/* Add / edit member. */}
      <PersonDialog
        open={dialogOpen}
        editing={editing}
        people={people}
        parcels={data.parcels}
        myAddress={data.myAddress}
        groupType={group.type}
        onCancel={() => setDialogOpen(false)}
        onSubmit={submit}
        notify={notify}
      />

      {/* Remove confirm. */}
      <Dialog open={Boolean(removeTarget)} onClose={() => setRemoveTarget(null)}>
        <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void confirmRemove()}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Verification invite: copy link / WhatsApp / SMS / email. */}
      <Dialog open={Boolean(invite)} onClose={() => setInvite(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Verification invite</DialogTitle>
        <DialogContent>
          {invite && (
            <>
              <DialogContentText>
                Share this link with <b>{invite.name}</b>
                {invite.to ? ` (${invite.to})` : ''} so they can verify:
              </DialogContentText>
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                <TextField size="small" fullWidth value={invite.link} slotProps={{ input: { readOnly: true } }} />
                <Tooltip title="Copy link">
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyOutlinedIcon />}
                    onClick={() => {
                      void navigator.clipboard.writeText(invite.link);
                      notify('Copied');
                    }}
                  >
                    Copy
                  </Button>
                </Tooltip>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  startIcon={<WhatsAppIcon />}
                  component="a"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://wa.me/?text=${encodeURIComponent(inviteMsg)}`}
                >
                  WhatsApp
                </Button>
                <Button
                  size="small"
                  startIcon={<SmsOutlinedIcon />}
                  component="a"
                  href={`sms:${invite.to.startsWith('+') ? invite.to.replace(/\s/g, '') : ''}?&body=${encodeURIComponent(inviteMsg)}`}
                >
                  SMS
                </Button>
                <Button
                  size="small"
                  startIcon={<EmailOutlinedIcon />}
                  component="a"
                  href={`mailto:${invite.to.includes('@') ? invite.to : ''}?subject=${encodeURIComponent('Verify your co-ownership on Pattadar')}&body=${encodeURIComponent(inviteMsg)}`}
                >
                  Email
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvite(null)}>Done</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ── Land tab ────────────────────────────────────────────────────── */

function LandTab({
  group,
  notify,
  onChanged,
}: {
  group: Group;
  notify: Notify;
  onChanged: () => void;
}) {
  const { data: passbooks } = useGroupPassbooks();
  const addr = (p: { village: string; mandal: string; district: string }) =>
    [p.village, p.mandal, p.district].filter(Boolean).join(', ') || '—';

  const assigned = passbooks.filter((p) => p.groupId === group.id);
  const unassigned = passbooks.filter((p) => p.groupId !== group.id);
  const totalExtent = assigned.reduce((s, p) => s + (Number(p.totalExtent) || 0), 0);

  const assign = async (pbId: string, gid: string) => {
    try {
      await assignLandToGroup(pbId, gid);
      notify('Updated');
      onChanged();
    } catch {
      notify('Could not update the assignment', 'error');
    }
  };

  return (
    <>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Land held by {group.name} · {assigned.length} passbook{assigned.length === 1 ? '' : 's'} ·{' '}
        {formatArea(totalExtent)}
      </Typography>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Owner</TableCell>
              <TableCell>Khata</TableCell>
              <TableCell>Address</TableCell>
              <TableCell align="right">Extent</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {assigned.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No passbooks assigned to this group yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {assigned.map((p) => (
              <TableRow key={p.id} hover>
                <TableCell>{p.ownerName || '—'}</TableCell>
                <TableCell>{p.pattadarNo}</TableCell>
                <TableCell>{addr(p)}</TableCell>
                <TableCell align="right">{formatArea(Number(p.totalExtent) || 0)}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => void assign(p.id, '')}>
                    Unassign
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {assigned.length > 0 && (
              <TableRow>
                <TableCell colSpan={3}>
                  <b>Total</b>
                </TableCell>
                <TableCell align="right">
                  <b>{formatArea(totalExtent)}</b>
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {unassigned.length > 0 && (
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            Assign a passbook to this group:
          </Typography>
          <TextField
            select
            size="small"
            value=""
            sx={{ minWidth: 320 }}
            slotProps={{ select: { displayEmpty: true } }}
            onChange={(e) => {
              if (e.target.value) void assign(e.target.value, group.id);
            }}
          >
            <MenuItem value="" disabled>
              Choose a passbook
            </MenuItem>
            {unassigned.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {`Khata ${p.pattadarNo || '—'} · ${addr(p)}`}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      )}
    </>
  );
}

/* ── Invitations tab (pending heirs of this group) ───────────────── */

function GroupInvitationsTab({ group }: { group: Group }) {
  const { data } = useGroupMembers(group.id);
  const rows = data.members.filter((m) => m.isBeneficiary && m.status === 'pending');
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Member</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  No pending invitations.
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {rows.map((m) => (
            <TableRow key={m.id} hover>
              <TableCell>{m.name}</TableCell>
              <TableCell>{m.role || relMeta(m.relation).label}</TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" color="warning" label={String(m.status).toUpperCase()} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/* ── Activity tab ────────────────────────────────────────────────── */

function ActivityTab({ group }: { group: Group }) {
  const { data: events } = useGroupActivity(group.id);
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Action</TableCell>
            <TableCell>Details</TableCell>
            <TableCell>When</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={3}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  No activity yet.
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {events.map((e) => (
            <TableRow key={e.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.action.replace(/_/g, ' ')}</TableCell>
              <TableCell>{e.details}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.timestamp ? fmtLocal(e.timestamp) : ''}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/* ── Notifier priority editor ────────────────────────────────────── */
// Reorder (↑/↓) + remove to build a staggered escalation list, or leave the
// list empty to notify everyone at once. Persists via setNotifiers.

function NotifierConfigDialog({
  groupId,
  open,
  onClose,
  notify,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
  notify: Notify;
}) {
  const [order, setOrder] = useState<{ id: string; name: string; relation: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; relation: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchNotifiers(groupId)
      .then((d) => {
        const configured = d.notifiers.some((n) => n.priority > 0);
        setMembers(
          d.members
            .filter((m) => !m.isSelf)
            .map((m) => ({ id: m.id, name: m.name, relation: m.relation || m.role })),
        );
        setOrder(
          configured
            ? d.notifiers.map((n) => ({ id: n.memberId, name: n.name, relation: n.relation }))
            : [],
        );
      })
      .catch(() => {
        setMembers([]);
        setOrder([]);
      });
  }, [groupId, open]);

  const move = (i: number, dir: number) =>
    setOrder((o) => {
      const n = [...o];
      const j = i + dir;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const removeAt = (i: number) => setOrder((o) => o.filter((_x, x) => x !== i));
  const notInList = members.filter((m) => !order.some((o) => o.id === m.id));
  const addToOrder = (id: string) => {
    const m = members.find((x) => x.id === id);
    if (m) setOrder((o) => [...o, m]);
  };

  const persist = async (ids: string[], okMsg: string) => {
    setSaving(true);
    try {
      await setNotifiers(groupId, ids);
      notify(okMsg);
      onClose();
    } catch {
      notify('Could not save notifier list', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Notifier priority</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 1.5 }}>
          <b>Ordered list = staggered escalation.</b> Priority 1 is alerted first; if they don’t
          respond within a week, Priority 2, then 3… Leave the list empty (or Reset) to notify all
          members at once.
        </Alert>
        <List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 2, py: 0 }}>
          {order.length === 0 && (
            <ListItem>
              <Typography variant="body2" color="text.secondary">
                No order set — everyone is notified at once. Add members below to stagger.
              </Typography>
            </ListItem>
          )}
          {order.map((m, i) => (
            <ListItem
              key={m.id}
              divider={i < order.length - 1}
              secondaryAction={
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <Link component="button" onClick={() => move(i, -1)}>
                    ↑
                  </Link>
                  <Link component="button" onClick={() => move(i, 1)}>
                    ↓
                  </Link>
                  <Link component="button" color="error" onClick={() => removeAt(i)}>
                    Remove
                  </Link>
                </Box>
              }
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip size="small" color="info" variant="outlined" label={`Priority ${i + 1}`} />
                <Typography variant="body2">{m.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {m.relation}
                </Typography>
              </Box>
            </ListItem>
          ))}
        </List>
        {notInList.length > 0 && (
          <TextField
            select
            fullWidth
            size="small"
            value=""
            sx={{ mt: 1.5 }}
            slotProps={{ select: { displayEmpty: true } }}
            onChange={(e) => {
              if (e.target.value) addToOrder(e.target.value);
            }}
          >
            <MenuItem value="" disabled>
              + Add a member to the priority list
            </MenuItem>
            {notInList.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.name}
                {m.relation ? ` — ${m.relation}` : ''}
              </MenuItem>
            ))}
          </TextField>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => void persist([], 'Reset — everyone is notified at once')}
          disabled={saving}
        >
          Reset to everyone
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={saving}
          onClick={() => void persist(order.map((o) => o.id), 'Notifier priority saved')}
        >
          Save order
        </Button>
      </DialogActions>
    </Dialog>
  );
}
