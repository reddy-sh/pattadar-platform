/**
 * Notifications — the sent-message log (email / WhatsApp / SMS) with an
 * All ↔ Failures filter, mirroring the rhub NotificationsView.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import { formatDateTime } from '@pattadar/core';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useNotificationLog } from '../data/hooks';

function channelIcon(channel: string) {
  if (channel === 'whatsapp') return <ChatOutlinedIcon fontSize="small" />;
  if (channel === 'sms') return <SmsOutlinedIcon fontSize="small" />;
  return <EmailOutlinedIcon fontSize="small" />;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : formatDateTime(d);
}

export function NotificationsPage() {
  const { data: log, isSample } = useNotificationLog();
  const [filter, setFilter] = useState<'all' | 'failures'>('all');
  const rows = filter === 'failures' ? log.filter((n) => n.status === 'failed') : log;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Every message the app sent on your behalf — invites, reminders and alerts."
        sample={isSample}
        actions={
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filter}
            onChange={(_, v: 'all' | 'failures' | null) => v && setFilter(v)}
            aria-label="Filter"
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="failures">Failures</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<NotificationsOutlinedIcon />}
            title={filter === 'failures' ? 'No failed messages' : 'Nothing sent yet'}
            description={
              filter === 'failures'
                ? 'Every message went through — nothing to fix here.'
                : 'Invites, reminders and alerts will appear here as they are sent.'
            }
          />
        </Card>
      ) : (
        <Card>
          {rows.map((n, i) => (
            <Box
              key={n.id}
              sx={{
                display: 'flex',
                gap: 1.5,
                px: 2.5,
                py: 1.5,
                borderBottom: i < rows.length - 1 ? 1 : 0,
                borderColor: 'divider',
                alignItems: 'flex-start',
              }}
            >
              <Box sx={{ color: 'text.secondary', mt: '3px' }}>{channelIcon(n.channel)}</Box>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {n.subject}
                  </Typography>
                  {n.status === 'failed' ? (
                    <Chip size="small" color="error" variant="outlined" label="Failed" />
                  ) : (
                    <Chip size="small" color="success" variant="outlined" label="Sent" />
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {n.body}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  To {n.recipient} · {n.channel} · {fmtWhen(n.createdAt)}
                  {n.error ? ` · ${n.error}` : ''}
                </Typography>
              </Box>
            </Box>
          ))}
        </Card>
      )}
    </>
  );
}
