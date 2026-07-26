/**
 * Groups & members — typed groups (family, partnership, company, HUF, trust)
 * own land; the member table shows DOB, gender, contact, verification state,
 * heir flag, nominated share and masked Aadhaar. Invite CTA per group.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import BalanceOutlinedIcon from '@mui/icons-material/BalanceOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import { formatArea, parseISOToDisplay } from '@pattadar/core';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useGroups } from '../data/hooks';

const GROUP_META: Record<string, { label: string; icon: ReactElement }> = {
  family: { label: 'Family', icon: <Diversity3OutlinedIcon /> },
  partnership: { label: 'Partnership', icon: <HandshakeOutlinedIcon /> },
  company: { label: 'Company / LLP', icon: <CorporateFareOutlinedIcon /> },
  huf: { label: 'HUF', icon: <AccountBalanceOutlinedIcon /> },
  trust: { label: 'Trust / Society', icon: <BalanceOutlinedIcon /> },
};

export function FamiliesGroupsPage() {
  const { data, isSample } = useGroups();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.groups.find((g) => g.id === selectedId) ?? data.groups[0];
  const members = selected ? data.members.filter((m) => m.groupId === selected.id) : [];

  return (
    <>
      <PageHeader
        title="Groups & members"
        subtitle="Who holds your land together — and who inherits it. Nominate heirs and keep every member verified."
        sample={isSample}
      />

      {data.groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GroupsOutlinedIcon />}
            title="No groups yet"
            description="Create a family group to nominate heirs, or a partnership to hold land together."
            action={<Button variant="contained">Create a group</Button>}
          />
        </Card>
      ) : (
        <>
          {/* ── Typed group cards ─────────────────────────────────────── */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
              gap: 1.5,
              mb: 2.5,
            }}
          >
            {data.groups.map((g) => {
              const meta = GROUP_META[g.type] ?? GROUP_META.family;
              const isSelected = selected?.id === g.id;
              return (
                <Card
                  key={g.id}
                  sx={{
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    borderWidth: isSelected ? 2 : 1,
                  }}
                >
                  <CardActionArea onClick={() => setSelectedId(g.id)}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 2,
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: 'action.hover',
                            color: 'primary.main',
                          }}
                        >
                          {meta.icon}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
                            {g.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {meta.label} · you are {g.myRole}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                        <Chip size="small" variant="outlined" label={`${g.memberCount} members`} />
                        <Chip size="small" variant="outlined" label={`${g.landCount} holdings`} />
                        {g.totalExtent > 0 && (
                          <Chip size="small" variant="outlined" label={formatArea(g.totalExtent)} />
                        )}
                        <Chip
                          size="small"
                          variant="outlined"
                          color={g.totalShare >= 100 ? 'success' : 'warning'}
                          label={`${g.totalShare}% shares nominated`}
                        />
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              );
            })}
          </Box>

          {/* ── Member table for the selected group ───────────────────── */}
          {selected && (
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, pb: 1 }}>
                <Box>
                  <Typography variant="h4" component="h2">
                    {selected.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {members.length} member{members.length !== 1 ? 's' : ''} · created {parseISOToDisplay(selected.createdAt)}
                  </Typography>
                </Box>
                <Button variant="contained" startIcon={<PersonAddAltOutlinedIcon />}>
                  Invite a member
                </Button>
              </CardContent>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Relation</TableCell>
                      <TableCell>Date of birth</TableCell>
                      <TableCell>Gender</TableCell>
                      <TableCell>Contact</TableCell>
                      <TableCell>Aadhaar</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Heir share</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {m.name}
                            </Typography>
                            {m.isSelf && <Chip size="small" label="You" variant="outlined" />}
                          </Box>
                        </TableCell>
                        <TableCell>{m.relation || m.role}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {m.dob ? parseISOToDisplay(m.dob) : '—'}
                        </TableCell>
                        <TableCell>{m.gender || '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {m.phone || m.email || '—'}
                          {(m.phoneVerified || m.emailVerified) && (
                            <Tooltip title="Contact verified">
                              <CheckCircleOutlinedIcon
                                sx={{ fontSize: 15, color: 'success.main', ml: 0.5, verticalAlign: 'text-bottom' }}
                              />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {m.aadhaarMasked || '—'}
                        </TableCell>
                        <TableCell>
                          {m.isSelf ? (
                            <Chip size="small" color="success" variant="outlined" label="Active" />
                          ) : m.status === 'verified' ? (
                            <Chip
                              size="small"
                              color="success"
                              variant="outlined"
                              icon={<CheckCircleOutlinedIcon />}
                              label="Active"
                            />
                          ) : (
                            <Chip size="small" color="warning" variant="outlined" label="Invited" />
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {m.isBeneficiary ? (
                            <Chip size="small" color="primary" variant="outlined" label={`Heir · ${m.sharePct}%`} />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          )}
        </>
      )}
    </>
  );
}
