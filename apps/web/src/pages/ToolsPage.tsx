/**
 * Tools — the four utilities live under one section, matching the current
 * rhub pattadar app's ToolsView tabs: Find SRO · Stamp Duty · Market Value ·
 * Area Calculator. Old direct routes (/app/sro, /app/stamp-duty,
 * /app/market-value, /app/calculator) redirect here and land on the matching
 * tab via ?tab=.
 *
 * The SRO directory is live; the other three tabs are being rebuilt from the
 * rhub source (parts 2-3 fill this page — edit ONLY this file, not routes).
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import Card from '@mui/material/Card';
import InputAdornment from '@mui/material/InputAdornment';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useSroOffices } from '../data/hooks';

type ToolTab = 'sro' | 'stamp-duty' | 'market-value' | 'calculator';

const TAB_VALUES: ToolTab[] = ['sro', 'stamp-duty', 'market-value', 'calculator'];

function SroTool() {
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

function Rebuilding({ title, detail }: { title: string; detail: string }) {
  return (
    <>
      <Typography variant="h2">{title}</Typography>
      <Typography color="text.secondary">{detail}</Typography>
    </>
  );
}

export function ToolsPage() {
  const [searchParams] = useSearchParams();
  const initial = searchParams.get('tab') as ToolTab | null;
  const [tab, setTab] = useState<ToolTab>(initial && TAB_VALUES.includes(initial) ? initial : 'sro');

  return (
    <>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Find SRO" value="sro" />
        <Tab label="Stamp Duty" value="stamp-duty" />
        <Tab label="Market Value" value="market-value" />
        <Tab label="Area Calculator" value="calculator" />
      </Tabs>
      {tab === 'sro' ? (
        <SroTool />
      ) : tab === 'stamp-duty' ? (
        <Rebuilding
          title="Stamp Duty"
          detail="Stamp-duty & registration-fee calculator (AP fee schedule); rebuilt from rhub StampDutyView with calcStampDuty in @pattadar/core."
        />
      ) : tab === 'market-value' ? (
        <Rebuilding
          title="Market Value"
          detail="Guideline market-value lookup by district/mandal/village; rebuilt from rhub MarketValueView in RemoteApp.tsx."
        />
      ) : (
        <Rebuilding
          title="Area Calculator"
          detail="Land-extent unit converter and ground-measurement calculator (rectangle/triangle/quadrilateral, GPS polygon, fence estimate); rebuilt from rhub Calculator.tsx over landcalc.ts + units.ts in @pattadar/core."
        />
      )}
    </>
  );
}
