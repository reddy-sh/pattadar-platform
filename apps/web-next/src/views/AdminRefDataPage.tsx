'use client';

/**
 * Admin & Reference Data — functional port of the predecessor AdminView: read-only
 * reference tables for States & UTs, Districts, the 115 AP deed types and the
 * IGRS fee schedule (rates as percentages), plus the Analytics coming-soon
 * tab. Queries are co-located here; each tab has search + export.
 */
import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
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
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import { sampleFeeSchedule } from '@pattadar/core';
import type { FeeScheduleRow } from '@pattadar/core';
import { gql } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { HeaderSkeleton, TableSkeleton } from '../components/Skeletons';
import { stickyHeadSx } from '../components/tableSx';
import { ExportMenu } from '../export/ExportMenu';
import type { ExportBrand, ExportCol } from '../export/ExportMenu';
import { useLiveOrSample } from '../data/useLiveOrSample';

interface CodeRow {
  id: string;
  name: string;
  code: string;
}

interface DeedTypeRow {
  id: string;
  regTypeEn: string;
  regTypeTe: string;
  natureEn: string;
  natureTe: string;
}

interface RefData {
  states: CodeRow[];
  districts: CodeRow[];
  deedTypes: DeedTypeRow[];
  fees: FeeScheduleRow[];
}

function useRefData() {
  return useLiveOrSample<RefData>(
    'admin-ref-data',
    async () => {
      const d = await gql<{
        states: CodeRow[];
        districts: CodeRow[];
        deedTypes: DeedTypeRow[];
        feeSchedule: FeeScheduleRow[];
      }>(`query {
        states { id name code }
        districts { id name code }
        deedTypes { id regTypeEn regTypeTe natureEn natureTe }
        feeSchedule { id regTypeEn natureEn stampRate transferRate regRate userRate }
      }`);
      return {
        states: d.states ?? [],
        districts: d.districts ?? [],
        deedTypes: d.deedTypes ?? [],
        fees: d.feeSchedule ?? [],
      };
    },
    { states: [], districts: [], deedTypes: [], fees: sampleFeeSchedule },
  );
}

const pct = (v: number) => `${(Number(v) * 100).toFixed(2)}%`;

const brand = (title: string): ExportBrand => ({
  brand: 'Pattadar',
  title,
  subtitle: 'Andhra Pradesh / Telangana Land Records',
  watermark: 'PATTADAR',
});

/** Generic searchable read-only reference table with export. */
function RefTable<T extends { id: string }>({
  rows,
  cols,
  exportName,
  exportTitle,
  searchKeys,
}: {
  rows: T[];
  cols: { key: keyof T & string; title: string; render?: (row: T) => string; align?: 'right' }[];
  exportName: string;
  exportTitle: string;
  searchKeys: (keyof T & string)[];
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => searchKeys.map((k) => String(r[k] ?? '')).join(' ').toLowerCase().includes(needle));
  }, [rows, q, searchKeys]);
  const exportCols: ExportCol<T>[] = cols.map((c) => ({
    key: c.key,
    title: c.title,
    fmt: c.render ? (_v, row) => c.render!(row) : undefined,
  }));
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1.5 }}>
        <TextField
          size="small"
          placeholder="Search…"
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
        <ExportMenu filename={exportName} brand={brand(exportTitle)} cols={exportCols} rows={shown} />
      </Box>
      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TableChartOutlinedIcon />}
            title="No rows"
            description="Reference data loads from the live service — nothing matches this search."
          />
        </Card>
      ) : (
        <Card>
          <TableContainer sx={stickyHeadSx}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {cols.map((c) => (
                    <TableCell key={c.key} align={c.align}>
                      {c.title}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.id} hover>
                    {cols.map((c) => (
                      <TableCell key={c.key} align={c.align} sx={c.align === 'right' ? { fontVariantNumeric: 'tabular-nums' } : undefined}>
                        {c.render ? c.render(r) : String(r[c.key] ?? '') || '—'}
                      </TableCell>
                    ))}
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

type AdminTab = 'states' | 'districts' | 'deed_types' | 'fee_schedule' | 'analytics';

export function AdminRefDataPage() {
  const { data, isSample, isLoading } = useRefData();
  const [tab, setTab] = useState<AdminTab>('states');

  // Shaped loading state — never paint the sample dataset uncredited.
  if (isLoading)
    return (
      <>
        <HeaderSkeleton />
        <TableSkeleton rows={8} />
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Admin & Reference Data"
        subtitle="The government reference datasets behind the app — states, districts, deed types and the fee schedule."
        sample={isSample}
      />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" allowScrollButtonsMobile>
        <Tab label={`States (${data.states.length})`} value="states" />
        <Tab label={`Districts (${data.districts.length})`} value="districts" />
        <Tab label={`Deed Types (${data.deedTypes.length})`} value="deed_types" />
        <Tab label={`Fee Schedule (${data.fees.length})`} value="fee_schedule" />
        <Tab label="Analytics" value="analytics" />
      </Tabs>

      {tab === 'states' && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            Andhra Pradesh has full district / mandal / SRO data from the IGRS feed. Other states
            are ready for data as it is onboarded.
          </Alert>
          <RefTable
            rows={data.states}
            cols={[
              { key: 'code', title: 'Code' },
              { key: 'name', title: 'State / UT' },
            ]}
            exportName="pattadar-states"
            exportTitle="States & Union Territories"
            searchKeys={['code', 'name']}
          />
        </>
      )}
      {tab === 'districts' && (
        <RefTable
          rows={data.districts}
          cols={[
            { key: 'code', title: 'Code' },
            { key: 'name', title: 'District Name' },
          ]}
          exportName="pattadar-districts"
          exportTitle="Districts"
          searchKeys={['code', 'name']}
        />
      )}
      {tab === 'deed_types' && (
        <RefTable
          rows={data.deedTypes}
          cols={[
            { key: 'regTypeEn', title: 'Registration Type' },
            { key: 'natureEn', title: 'Nature of Document' },
            { key: 'natureTe', title: 'Nature (Telugu)', render: (r) => r.natureTe || '—' },
          ]}
          exportName="pattadar-deed-types"
          exportTitle="Deed Types"
          searchKeys={['regTypeEn', 'natureEn', 'natureTe']}
        />
      )}
      {tab === 'fee_schedule' && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            Rates are derived from the AP-IGRS sample fee schedule and applied to the higher of
            consideration / market value.
          </Alert>
          <RefTable
            rows={data.fees}
            cols={[
              { key: 'regTypeEn', title: 'Reg Type' },
              { key: 'natureEn', title: 'Nature of Document' },
              { key: 'stampRate', title: 'Stamp Duty', render: (r) => pct(r.stampRate), align: 'right' },
              { key: 'transferRate', title: 'Transfer Duty', render: (r) => pct(r.transferRate), align: 'right' },
              { key: 'regRate', title: 'Registration', render: (r) => pct(r.regRate), align: 'right' },
              { key: 'userRate', title: 'User Charges', render: (r) => pct(r.userRate), align: 'right' },
            ]}
            exportName="pattadar-fee-schedule"
            exportTitle="Fee Schedule"
            searchKeys={['regTypeEn', 'natureEn']}
          />
        </>
      )}
      {tab === 'analytics' && (
        <Card>
          <Box sx={{ p: 3 }}>
            <Alert severity="info">
              <Typography variant="subtitle2">Analytics Dashboard</Typography>
              User engagement analytics, registration volume, and system health metrics — coming in
              a later release.
            </Alert>
          </Box>
        </Card>
      )}
    </>
  );
}
