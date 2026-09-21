/**
 * Admin & Reference Data — functional port of the rhub AdminView: read-only
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
  lgdCode: string;
  sourceId: string;
  sourceUrl: string;
  sourceEffectiveAt: string;
  active: boolean;
}

interface ReferenceSourceRow {
  id: string;
  name: string;
  authority: string;
  description: string;
  catalogUrl: string;
  publisherUrl: string;
  licenseName: string;
  licenseUrl: string;
  cadence: string;
  updatedAt: string;
}

interface SyncRunRow {
  id: string;
  sourceId: string;
  mode: string;
  status: string;
  sourceEffectiveAt: string;
  startedAt: string;
  finishedAt: string;
  countsJson: string;
}

interface ReferenceSummary {
  states: number;
  districts: number;
  mandals: number;
  villages: number;
  lastCompletedAt: string;
  sourceName: string;
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
  sources: ReferenceSourceRow[];
  runs: SyncRunRow[];
  summary: ReferenceSummary;
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
        referenceDataSources: ReferenceSourceRow[];
        referenceDataSyncRuns: SyncRunRow[];
        referenceDataSummary: ReferenceSummary;
        deedTypes: DeedTypeRow[];
        feeSchedule: FeeScheduleRow[];
      }>(`query {
        states { id name code lgdCode sourceId sourceUrl sourceEffectiveAt active }
        districts { id name code lgdCode sourceId sourceUrl sourceEffectiveAt active }
        referenceDataSources {
          id name authority description catalogUrl publisherUrl licenseName licenseUrl cadence updatedAt
        }
        referenceDataSyncRuns(limit: 20) {
          id sourceId mode status sourceEffectiveAt startedAt finishedAt countsJson
        }
        referenceDataSummary { states districts mandals villages lastCompletedAt sourceName }
        deedTypes { id regTypeEn regTypeTe natureEn natureTe }
        feeSchedule { id regTypeEn natureEn stampRate transferRate regRate userRate }
      }`);
      return {
        states: d.states ?? [],
        districts: d.districts ?? [],
        sources: d.referenceDataSources ?? [],
        runs: d.referenceDataSyncRuns ?? [],
        summary: d.referenceDataSummary,
        deedTypes: d.deedTypes ?? [],
        fees: d.feeSchedule ?? [],
      };
    },
    {
      states: [], districts: [], sources: [], runs: [],
      summary: {
        states: 0, districts: 0, mandals: 0, villages: 0,
        lastCompletedAt: '', sourceName: 'Local Government Directory (LGD)',
      },
      deedTypes: [], fees: sampleFeeSchedule,
    },
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

type AdminTab = 'states' | 'districts' | 'geography' | 'deed_types' | 'fee_schedule' | 'analytics';

const sourceLabel = (row: CodeRow) => row.sourceId === 'gov-in-lgd' ? 'LGD' : 'Bundled transition';

const runCounts = (value: string) => {
  try {
    const entities = Object.values(JSON.parse(value || '{}') as Record<string, Record<string, number>>);
    const total = (key: string) => entities.reduce((sum, item) => sum + Number(item[key] ?? 0), 0);
    return `+${total('inserted')} · ${total('updated')} changed · ${total('retired')} retired`;
  } catch {
    return 'Counts unavailable';
  }
};

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
        <Tab label="Geography source & sync" value="geography" />
        <Tab label={`Deed Types (${data.deedTypes.length})`} value="deed_types" />
        <Tab label={`Fee Schedule (${data.fees.length})`} value="fee_schedule" />
        <Tab label="Analytics" value="analytics" />
      </Tabs>

      {tab === 'states' && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            Canonical national codes come from the Ministry of Panchayati Raj Local Government
            Directory. Rows marked Bundled transition remain until the first matching LGD import.
          </Alert>
          <RefTable
            rows={data.states}
            cols={[
              { key: 'code', title: 'Code' },
              { key: 'lgdCode', title: 'LGD Code', render: (r) => r.lgdCode || 'Pending match' },
              { key: 'name', title: 'State / UT' },
              { key: 'sourceId', title: 'Source', render: sourceLabel },
            ]}
            exportName="pattadar-states"
            exportTitle="States & Union Territories"
            searchKeys={['code', 'lgdCode', 'name', 'sourceId']}
          />
        </>
      )}
      {tab === 'districts' && (
        <RefTable
          rows={data.districts}
          cols={[
              { key: 'code', title: 'Code' },
              { key: 'lgdCode', title: 'LGD Code', render: (r) => r.lgdCode || 'Pending match' },
              { key: 'name', title: 'District Name' },
              { key: 'sourceId', title: 'Source', render: sourceLabel },
          ]}
          exportName="pattadar-districts"
          exportTitle="Districts"
          searchKeys={['code', 'lgdCode', 'name', 'sourceId']}
        />
      )}
      {tab === 'geography' && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            Mandal is Pattadar's product label for the official LGD sub-district level, including
            tahsil, taluk and equivalent state terms. Snapshot imports may retire missing rows;
            modification-only imports never infer retirement from absence.
          </Alert>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>
            {([
              ['States / UTs', data.summary.states],
              ['Districts', data.summary.districts],
              ['Mandals', data.summary.mandals],
              ['Villages', data.summary.villages],
            ] as const).map(([label, value]) => (
              <Card key={label} sx={{ p: 2 }}>
                <Typography variant="overline" color="text.secondary">{label}</Typography>
                <Typography variant="h5">{value.toLocaleString('en-IN')}</Typography>
              </Card>
            ))}
          </Box>
          {data.sources.map((source) => (
            <Alert key={source.id} severity={source.id === 'gov-in-lgd' ? 'success' : 'warning'} sx={{ mb: 2 }}>
              <Typography variant="subtitle2">{source.name}</Typography>
              <Typography variant="body2">{source.authority} · {source.cadence}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{source.description}</Typography>
              {source.catalogUrl && (
                <a href={source.catalogUrl} target="_blank" rel="noreferrer">Open official catalog</a>
              )}
              {source.licenseUrl && <> · <a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.licenseName}</a></>}
            </Alert>
          ))}
          <Typography variant="h6" sx={{ mb: 1 }}>Import history</Typography>
          <RefTable
            rows={data.runs}
            cols={[
              { key: 'sourceEffectiveAt', title: 'Source version' },
              { key: 'mode', title: 'Mode' },
              { key: 'status', title: 'Status' },
              { key: 'countsJson', title: 'Delta', render: (r) => runCounts(r.countsJson) },
              { key: 'finishedAt', title: 'Finished' },
            ]}
            exportName="pattadar-geography-sync-history"
            exportTitle="Government Geography Import History"
            searchKeys={['sourceEffectiveAt', 'mode', 'status']}
          />
        </>
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
