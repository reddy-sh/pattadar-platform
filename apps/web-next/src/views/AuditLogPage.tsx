'use client';

/**
 * Audit — the full activity log (predecessor AuditView): every recorded action with
 * actor, friendly action phrasing, target entity, DD/MM/YYYY timestamp, a
 * details expander per row, search, and CSV/Excel/PDF export.
 */
import { Fragment, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import SearchIcon from '@mui/icons-material/Search';
import type { AuditEvent } from '@pattadar/core';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { HeaderSkeleton, TableSkeleton } from '../components/Skeletons';
import { stickyHeadSx } from '../components/tableSx';
import { ExportMenu } from '../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../export/ExportMenu';
import { fmtLocal, humanEntity } from '../lib/format';
import { useAuditEvents } from '../data/hooks';
import { actionLabel } from '../data/portfolio';

const exportBrand: ExportBrand = {
  brand: 'Pattadar',
  title: 'Audit Log',
  subtitle: 'Andhra Pradesh / Telangana Land Records',
  watermark: 'PATTADAR',
};

const exportCols: ExportCol<AuditEvent>[] = [
  { key: 'actor', title: 'Actor' },
  { key: 'action', title: 'Action' },
  { key: 'target', title: 'Target' },
  { key: 'details', title: 'Details' },
  { key: 'timestamp', title: 'Timestamp', fmt: (v) => fmtLocal(String(v ?? '')) },
];

export function AuditLogPage() {
  const { data: events, isSample, isLoading } = useAuditEvents();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((e) =>
      [e.actor, e.action, actionLabel(e.action), e.target, e.details].join(' ').toLowerCase().includes(needle),
    );
  }, [events, search]);

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
        eyebrow="Activity"
        title="Audit Log"
        subtitle="Every action on your records — who did what, to which entity, and when."
        sample={isSample}
        actions={
          <>
            <TextField
              size="small"
              placeholder="Search actor, action, entity…"
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
            <ExportMenu filename="pattadar-audit-log" brand={exportBrand} cols={exportCols} rows={shown} />
          </>
        }
      />

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HistoryOutlinedIcon />}
            title="No activity recorded"
            description="Actions like creating passbooks, uploading deeds and sending invitations appear here."
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={stickyHeadSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40 }} />
                  <TableCell>Actor</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Entity</TableCell>
                  <TableCell>Timestamp</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((e) => (
                  <Fragment key={e.id}>
                    <TableRow
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => setOpen(open === e.id ? null : e.id)}
                    >
                      <TableCell>
                        <IconButton size="small" aria-label="Expand details">
                          {open === e.id ? (
                            <KeyboardArrowUpIcon fontSize="small" />
                          ) : (
                            <KeyboardArrowDownIcon fontSize="small" />
                          )}
                        </IconButton>
                      </TableCell>
                      <TableCell>{(e.actor || '').split('@')[0] || '—'}</TableCell>
                      <TableCell>
                        <Tooltip title={e.action}>
                          <Chip size="small" variant="outlined" label={actionLabel(e.action)} />
                        </Tooltip>
                      </TableCell>
                      {/* Humanised entity — raw UUIDs stay in the details expander/export only. */}
                      <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {humanEntity(e.target, e.details) || '—'}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtLocal(e.timestamp)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} sx={{ p: 0, border: 0 }}>
                        <Collapse in={open === e.id} unmountOnExit>
                          <Box sx={{ px: 2, py: 1.5, my: 0.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                            <Typography variant="caption" color="text.secondary">
                              Details
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: 12.5 }}
                            >
                              {e.details || '—'}
                            </Typography>
                          </Box>
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
    </>
  );
}
