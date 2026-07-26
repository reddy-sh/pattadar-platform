/**
 * Sent notifications — functional-parity port of the rhub pattadar
 * NotificationsView over notificationLog: All ↔ Failures filter with
 * counts, When / Channel / To / Subject / Provider / Status table,
 * one-click send-test dialog, refresh and per-row delete. "stub · not
 * delivered" flags rows recorded before a real provider is wired.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
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
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import type { NotificationEntry } from '@pattadar/core';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { HeaderSkeleton, TableSkeleton } from '../components/Skeletons';
import { stickyHeadSx } from '../components/tableSx';
import { fmtLocal } from '../lib/format';
import {
  deleteNotification,
  sendTestNotification,
  useNotificationLogList,
} from './families/familiesData';

interface Toast {
  msg: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

const CHANNEL_COLOR: Record<string, 'info' | 'success' | 'secondary'> = {
  email: 'info',
  sms: 'success',
  whatsapp: 'secondary',
};

const isFailure = (r: NotificationEntry) => r.status === 'failed' || !!(r.error || '').trim();

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: rows, isSample, isLoading } = useNotificationLogList();
  const [scope, setScope] = useState<'all' | 'failures'>('all');
  const [toast, setToast] = useState<Toast | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotificationEntry | null>(null);

  // Send-test dialog.
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [sending, setSending] = useState(false);

  const notify = (msg: string, severity: Toast['severity'] = 'success') =>
    setToast({ msg, severity });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] });

  const failureCount = useMemo(() => rows.filter(isFailure).length, [rows]);
  const shown = useMemo(() => (scope === 'failures' ? rows.filter(isFailure) : rows), [rows, scope]);

  const sendTest = async () => {
    if (!testTo.trim()) {
      notify('Enter an email or phone', 'warning');
      return;
    }
    setSending(true);
    try {
      const res = await sendTestNotification(testTo.trim());
      notify(
        res.provider === 'stub'
          ? 'Recorded (stub — no provider wired yet)'
          : `Sent via ${res.provider || 'provider'} (${res.channel || '—'})`,
      );
      setTestOpen(false);
      setTestTo('');
      refresh();
    } catch {
      notify('Could not send the test', 'error');
    } finally {
      setSending(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteNotification(deleteTarget.id);
      notify('Notification deleted');
      refresh();
    } catch {
      notify('Could not delete the notification', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Shaped loading state — never paint the sample dataset uncredited.
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <TableSkeleton />
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="Messages"
        title="Notifications"
        subtitle="Invites, verification, and inactivity alerts. “stub · not delivered” means it was recorded but no provider is wired yet."
        sample={isSample}
        actions={
          <>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={scope}
              onChange={(_e, v: 'all' | 'failures' | null) => v && setScope(v)}
              aria-label="Filter"
            >
              <ToggleButton value="all">All ({rows.length})</ToggleButton>
              <ToggleButton value="failures">Failures ({failureCount})</ToggleButton>
            </ToggleButtonGroup>
            <Button onClick={() => setTestOpen(true)}>Send test</Button>
            <Button onClick={refresh}>Refresh</Button>
          </>
        }
      />

      {/* Section title — the log itself. */}
      <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>
        Sent notifications
      </Typography>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<NotificationsOutlinedIcon />}
            title={scope === 'failures' ? 'No failed messages' : 'Nothing sent yet'}
            description={
              scope === 'failures'
                ? 'Every message went through — nothing to fix here.'
                : 'Invites, reminders and alerts will appear here as they are sent.'
            }
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={stickyHeadSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Channel</TableCell>
                  <TableCell>To</TableCell>
                  <TableCell>Subject / message</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((n) => (
                  <TableRow key={n.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtLocal(n.createdAt)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={CHANNEL_COLOR[n.channel]}
                        label={String(n.channel || '').toUpperCase()}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{n.recipient || '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 340 }}>
                      {n.subject ? (
                        <Typography variant="body2" noWrap>
                          {n.subject}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {(n.body || '').slice(0, 70) || '—'}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {n.provider === 'stub' ? (
                        <Chip size="small" variant="outlined" label="stub · not delivered" />
                      ) : (
                        <Chip size="small" variant="outlined" color="success" label={n.provider} />
                      )}
                    </TableCell>
                    <TableCell>
                      {n.error ? (
                        <Tooltip title={n.error}>
                          <Chip size="small" variant="outlined" color="error" label="failed" />
                        </Tooltip>
                      ) : (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={n.status === 'sent' ? 'success' : undefined}
                          label={String(n.status || '—')}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Delete">
                        <IconButton
                          className="rowActions"
                          size="small"
                          aria-label="Delete notification"
                          onClick={() => setDeleteTarget(n)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Send test dialog. */}
      <Dialog open={testOpen} onClose={() => setTestOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Send a test notification</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter an email address or phone number. It routes through the same seam as invites —
            delivered for real once a provider is configured, otherwise recorded here as stub.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="name@example.com or +91 98765 43210"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sendTest();
            }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void sendTest()} disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm. */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete this notification?</DialogTitle>
        <DialogContent>
          <DialogContentText>This cannot be undone.</DialogContentText>
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
