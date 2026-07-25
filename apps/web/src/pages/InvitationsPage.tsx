/**
 * Invitations — verification invites sent to family members and partners:
 * contact, role, status, expiry, with copy-link and reminder actions.
 */
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { parseISOToDisplay } from '@pattadar/core';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useInvitations } from '../data/hooks';

const STATUS_CHIP: Record<string, { label: string; color: 'success' | 'warning' | 'default' }> = {
  accepted: { label: 'Accepted', color: 'success' },
  pending: { label: 'Waiting', color: 'warning' },
  expired: { label: 'Expired', color: 'default' },
};

export function InvitationsPage() {
  const { data: invitations, isSample } = useInvitations();
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
      />
      {invitations.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MailOutlinedIcon />}
            title="No invitations yet"
            description="When you add a family member or partner, we send them a link to confirm their details. Those invites live here."
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Sent to</TableCell>
                  <TableCell>As</TableCell>
                  <TableCell>Sent</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invitations.map((inv) => {
                  const chip = STATUS_CHIP[inv.status] ?? STATUS_CHIP.pending;
                  const actionable = inv.status === 'pending';
                  return (
                    <TableRow key={inv.id} hover>
                      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{inv.inviteeContact}</TableCell>
                      <TableCell>{inv.role}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{parseISOToDisplay(inv.createdAt)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{parseISOToDisplay(inv.expiry)}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" color={chip.color} label={chip.label} />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title={actionable ? 'Copy invite link' : 'Invite is no longer active'}>
                          <span>
                            <IconButton size="small" disabled={!actionable} aria-label="Copy invite link">
                              <ContentCopyOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={actionable ? 'Send a reminder' : 'Invite is no longer active'}>
                          <span>
                            <IconButton size="small" disabled={!actionable} aria-label="Send reminder">
                              <NotificationsActiveOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </>
  );
}
