'use client';

/**
 * Tools — the four utilities live under one section, matching the current
 * rhub pattadar app's ToolsView tabs: Find SRO · Stamp Duty · Market Value ·
 * Area Calculator. Old direct routes (/app/sro, /app/stamp-duty,
 * /app/market-value, /app/calculator) redirect here and land on the matching
 * tab via ?tab=.
 *
 * All four tabs are at functional parity with the rhub source: the SRO
 * directory, the AP fee-schedule stamp-duty calculator, the guideline
 * market-value cascade lookup, and the landcalc-driven area calculator.
 */
import { useState } from 'react';
import { useSearchParams } from 'src/routes/hooks';
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
import SearchIcon from '@mui/icons-material/Search';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { TableSkeleton } from '../components/Skeletons';
import { stickyHeadSx } from '../components/tableSx';
import { useSroOffices } from '../data/hooks';
import { CalculatorTool } from './tools/CalculatorTool';
import { MarketValueTool } from './tools/MarketValueTool';
import { StampDutyTool } from './tools/StampDutyTool';

type ToolTab = 'sro' | 'stamp-duty' | 'market-value' | 'calculator';

const TAB_VALUES: ToolTab[] = ['sro', 'stamp-duty', 'market-value', 'calculator'];

function SroTool() {
  const { data: offices, isSample, isLoading } = useSroOffices();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? offices.filter((o) =>
        [o.code, o.name, o.drZone, o.district, o.mandal].join(' ').toLowerCase().includes(needle),
      )
    : offices;

  if (isLoading) return <TableSkeleton rows={8} />;

  return (
    <>
      <PageHeader
        component="h2"
        variant="h3"
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
          <TableContainer sx={stickyHeadSx}>
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

export function ToolsPage() {
  const searchParams = useSearchParams();
  const initial = searchParams.get('tab') as ToolTab | null;
  const [tab, setTab] = useState<ToolTab>(initial && TAB_VALUES.includes(initial) ? initial : 'sro');

  return (
    <>
      <PageHeader
        eyebrow="Utilities"
        title="Tools"
        subtitle="Everyday land utilities — offices, duty, market value and area conversions."
      />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Find SRO" value="sro" />
        <Tab label="Stamp Duty" value="stamp-duty" />
        <Tab label="Market Value" value="market-value" />
        <Tab label="Area Calculator" value="calculator" />
      </Tabs>
      {tab === 'sro' ? (
        <SroTool />
      ) : tab === 'stamp-duty' ? (
        <StampDutyTool />
      ) : tab === 'market-value' ? (
        <MarketValueTool />
      ) : (
        <CalculatorTool />
      )}
    </>
  );
}
