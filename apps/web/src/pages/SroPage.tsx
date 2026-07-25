/**
 * SRO Offices — Sub-Registrar Office directory (AP-IGRS reference data)
 * with a plain search box.
 */
import { useState } from 'react';
import Card from '@mui/material/Card';
import InputAdornment from '@mui/material/InputAdornment';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useSroOffices } from '../data/hooks';

export function SroPage() {
  const { data: offices, isSample } = useSroOffices();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? offices.filter((o) =>
        [o.code, o.name, o.drZone, o.district, o.mandal].join(' ').toLowerCase().includes(needle),
      )
    : offices;

  return (
    <>
      <PageHeader
        title="SRO Offices"
        subtitle="Find the Sub-Registrar Office for your village before you plan a registration visit."
        sample={isSample}
        actions={
          <TextField
            size="small"
            placeholder="Search office, district, mandal…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
        }
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AccountBalanceOutlinedIcon />}
            title="No offices match"
            description="Try a district or mandal name — for example Guntur, Gannavaram or Kurnool."
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell>
                  <TableCell>Office</TableCell>
                  <TableCell>DR zone</TableCell>
                  <TableCell>District</TableCell>
                  <TableCell>Mandal</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id} hover>
                    <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{o.code}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{o.name}</TableCell>
                    <TableCell>{o.drZone}</TableCell>
                    <TableCell>{o.district}</TableCell>
                    <TableCell>{o.mandal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </>
  );
}
