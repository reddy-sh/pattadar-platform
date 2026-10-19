import { useMemo, useState } from 'react';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import LaunchOutlined from '@mui/icons-material/LaunchOutlined';
import { dayAndTime } from '@pattadar/core';

import {
  useGeographyReference,
  usePortfolio,
  type GeographyRow,
  type ReferenceDataSyncRun,
} from '../api';
import {
  BandSearch, Empty, FacetFilter, Failed, PageHead, SelectAllBox, SelectCell, SelectionBar, TablePager,
  ddmmyyyy, downloadCsv, plural, usePaged, useRowSelection,
} from '../ui';
import { Sk, SkTable } from '../skeletons';
import { SectionHead } from './RecordHead';

type Level = 'state' | 'district' | 'mandal' | 'village';

const NOUN: Record<Level, readonly [string, string]> = {
  state: ['state / UT', 'states / UTs'], district: ['district', 'districts'],
  mandal: ['sub-district', 'sub-districts'], village: ['village', 'villages'],
};

const idOf = (row: GeographyRow) => row.id;
const runIdOf = (run: ReferenceDataSyncRun) => run.id;
const NO_RUNS: ReferenceDataSyncRun[] = [];

const fmtDate = (value: string) => {
  if (!value) return 'Not imported yet';
  return dayAndTime(value);
};

const delta = (run: ReferenceDataSyncRun) => {
  try {
    const entities = Object.values(JSON.parse(run.countsJson || '{}') as Record<string, Record<string, number>>);
    const sum = (key: string) => entities.reduce((total, entity) => total + Number(entity[key] ?? 0), 0);
    return `${sum('inserted')} added, ${sum('updated')} changed, ${sum('retired')} retired`;
  } catch {
    return 'Counts unavailable';
  }
};

export function GeographyAdmin() {
  const portfolio = usePortfolio();
  const allowed = !!portfolio.data?.isSuperAdmin;
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [mandalId, setMandalId] = useState('');
  const [search, setSearch] = useState('');
  const reference = useGeographyReference(stateId, districtId, mandalId, allowed);

  const data = reference.data;
  const level: Level = !stateId ? 'state' : !districtId ? 'district' : !mandalId ? 'mandal' : 'village';
  const levelRows: GeographyRow[] = data ? {
    state: data.states,
    district: data.districts,
    mandal: data.mandals,
    village: data.villages,
  }[level] : [];
  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return levelRows;
    return levelRows.filter((row) => [
      row.name, row.nameLocal, row.code, row.lgdCode, row.census2011Code,
    ].some((value) => String(value ?? '').toLocaleLowerCase().includes(needle)));
  }, [levelRows, search]);
  const narrowed = [stateId, districtId, mandalId, search].join('|');
  const paged = usePaged(rows, { resetKey: narrowed, storeKey: 'pattadar.table.geography' });
  const sel = useRowSelection(rows, idOf, narrowed);
  // The import ledger is a table too (every table selects, 10/10/2026); it
  // follows no filter. One floating bar at a time: ticking one table clears the other.
  const runSel = useRowSelection(data?.runs ?? NO_RUNS, runIdOf);
  const exportRunsCsv = (picked: ReferenceDataSyncRun[]) => downloadCsv('geography-imports.csv', [
    ['Source version', 'Mode', 'Status', 'Delta', 'Finished'],
    ...picked.map((run) => [ddmmyyyy(run.sourceEffectiveAt), run.mode, run.status, delta(run), fmtDate(run.finishedAt)]),
  ]);
  // The same columns the table shows, in its order.
  const exportCsv = (picked: GeographyRow[]) => downloadCsv(`geography-${level}.csv`, [
    ['Name', 'Local name', 'LGD code', ...(level === 'village' ? ['Census 2011'] : []), 'Source version'],
    ...picked.map((row) => [row.name, row.nameLocal, row.lgdCode,
      ...(level === 'village' ? [row.census2011Code] : []), ddmmyyyy(row.sourceEffectiveAt)]),
  ]);

  const chooseState = (value: string) => {
    setStateId(value); setDistrictId(''); setMandalId(''); setSearch('');
  };
  const chooseDistrict = (value: string) => {
    setDistrictId(value); setMandalId(''); setSearch('');
  };
  const chooseMandal = (value: string) => {
    setMandalId(value); setSearch('');
  };
  // The hierarchy is one choice per level, so picking the chosen place again
  // clears it, and a level's choice clears every level under it.
  const toggleLevel = (group: string, value: string) => {
    if (group === 'state') chooseState(stateId === value ? '' : value);
    if (group === 'district') chooseDistrict(districtId === value ? '' : value);
    if (group === 'mandal') chooseMandal(mandalId === value ? '' : value);
  };
  const descend = (row: GeographyRow) => {
    if (level === 'state') chooseState(row.id);
    if (level === 'district') chooseDistrict(row.id);
    if (level === 'mandal') chooseMandal(row.id);
  };

  // Every state draws the same head (design.md § Page head), ⓘ included, so
  // the ⓘ does not appear only once the data arrives.
  const info = 'Canonical state, district, sub-district and village codes with source and change history.';
  const head = <PageHead title="Government geography" info={info} />;
  // A pending read holds the summary's line, as Properties does.
  const pending = <PageHead title="Government geography" info={info} summary={<Sk w="18rem" h="1rem" r="var(--radius-xs)" />} />;
  // The first read draws the page's own shape (design.md § Loading): the
  // count strip with its real labels, the filter band, and the state table.
  const skeleton = (label: string) => (
    <main className="geography-admin">
      {pending}
      <section className="geography-counts" aria-hidden>
        {['States / UTs', 'Districts', 'Sub-districts', 'Villages'].map((name) => (
          <div key={name}><span>{name}</span><strong style={{ height: '1lh', display: 'flex', alignItems: 'center' }}><Sk w="4rem" /></strong></div>
        ))}
      </section>
      <div className="filterbar" aria-hidden><Sk w="22rem" h="2rem" r="var(--radius-pill)" /></div>
      <section className="geography-table-section">
        <SectionHead title="States and union territories" info="Pattadar calls the official LGD sub-district level a mandal." />
        <SkTable label={label} rows={8} minWidth="42rem"
                 cols={[{ head: 'Name' }, { head: 'Local name' }, { head: 'LGD code', w: '4rem' },
                   { head: 'Source version', w: '5rem' }, { head: '', w: '1.125rem' }]} />
      </section>
    </main>
  );
  if (portfolio.isLoading) return skeleton('Checking your administration access');
  if (!allowed) {
    return (
      <main>
        {head}
        <Empty boxed h="24rem" icon="lock" title="Government reference data is restricted">
          Only a super-admin can read source provenance and synchronisation history.
        </Empty>
      </main>
    );
  }
  if (reference.isLoading) return skeleton('Loading government geography');
  if (reference.error || !data) {
    return <main>{head}<Failed what="Government geography" error={reference.error} boxed h="24rem" /></main>;
  }

  const selectedState = data.states.find((row) => row.id === stateId);
  const selectedDistrict = data.districts.find((row) => row.id === districtId);
  const selectedMandal = data.mandals.find((row) => row.id === mandalId);
  const title = {
    state: 'States and union territories',
    district: `Districts in ${selectedState?.name ?? 'the selected state'}`,
    mandal: `Sub-districts in ${selectedDistrict?.name ?? 'the selected district'}`,
    village: `Villages in ${selectedMandal?.name ?? 'the selected sub-district'}`,
  }[level];

  return (
    <main className="geography-admin">
      {/* No eyebrow: "Administration" is the rail group (V2). What the page
          is for is standing guidance, behind the ⓘ; the last import is a
          fact, in the summary. */}
      <PageHead
        title="Government geography"
        info={info}
        summary={data.summary.lastCompletedAt
          ? `Latest successful import: ${fmtDate(data.summary.lastCompletedAt)}` : undefined}
      />

      <section className="geography-counts" aria-label="Active government geography rows">
        {([
          ['States / UTs', data.summary.states], ['Districts', data.summary.districts],
          ['Sub-districts', data.summary.mandals], ['Villages', data.summary.villages],
        ] as const).map(([label, value]) => (
          <div key={label}><span>{label}</span><strong>{value.toLocaleString('en-IN')}</strong></div>
        ))}
      </section>

      {/* The shared filter (design.md § Page head, slot 5; F14): one level
          per group, the page's own search and the tally in the band. */}
      <FacetFilter
        groups={[
          { key: 'state', label: 'State / UT', options: data.states.map((row) => ({ key: row.id, label: row.name })) },
          { key: 'district', label: 'District', options: data.districts.map((row) => ({ key: row.id, label: row.name })) },
          { key: 'mandal', label: 'Mandal / sub-district', options: data.mandals.map((row) => ({ key: row.id, label: row.name })) },
        ]}
        selected={{
          state: stateId ? [stateId] : [],
          district: districtId ? [districtId] : [],
          mandal: mandalId ? [mandalId] : [],
        }}
        onToggle={toggleLevel}
        onClear={() => chooseState('')}
        searchPlaceholder="Search places"
        tally={`${rows.length.toLocaleString('en-IN')} shown`}
        search={(
          <BandSearch value={search} onChange={setSearch}
                      placeholder={`Search ${level === 'mandal' ? 'sub-districts' : `${level}s`}`}
                      label="Search this level by name or code" />
        )}
        ariaLabel="Narrow the geography by place"
      />

      {/* A new level's read keeps the last table, dimmed and inert, until it
          lands (design.md § Loading); its open and export wait with it. */}
      <section className="geography-table-section" aria-busy={reference.isPlaceholderData}
               style={{ opacity: reference.isPlaceholderData ? 0.6 : 1,
                 pointerEvents: reference.isPlaceholderData ? 'none' : undefined,
                 transition: 'opacity var(--dur-fast) var(--ease-out)' }}>
        {/* No sub: the band already tallies what is shown and the table's
            foot totals it (design.md § Page head). */}
        <SectionHead title={title} info="Pattadar calls the official LGD sub-district level a mandal." />
        <div className="scroll-x geography-table-frame">
          <table className="rectable" aria-label={title}>
            <thead><tr>
              <th className="selcol">
                <SelectAllBox total={rows.length} picked={sel.picked.length} noun={NOUN[level]}
                              onToggle={() => { runSel.clear(); sel.toggleAll(); }} />
              </th>
              <th>Name</th><th>Local name</th><th>LGD code</th>
              {level === 'village' && <th>Census 2011</th>}
              <th>Source version</th>{level !== 'village' && <th aria-label="Open next level" />}
            </tr></thead>
            <tbody>
              {paged.shown.map((row) => (
                <tr key={row.id} className={sel.selected.has(row.id) ? 'selected' : undefined}>
                  <SelectCell checked={sel.selected.has(row.id)} label={`Select ${row.name}`}
                              onToggle={() => { runSel.clear(); sel.toggle(row.id); }} />
                  <td><strong>{row.name}</strong></td>
                  <td>{row.nameLocal || '-'}</td>
                  <td className="mono">{row.lgdCode || 'Pending match'}</td>
                  {level === 'village' && <td className="mono">{row.census2011Code || '-'}</td>}
                  <td>{ddmmyyyy(row.sourceEffectiveAt) || 'Bundled transition'}</td>
                  {level !== 'village' && (
                    <td className="geography-next">
                      <button className="iconbtn" type="button" title={`Open ${row.name}`}
                              aria-label={`Open ${row.name}`} onClick={() => descend(row)}>
                        <ChevronRightOutlined sx={{ fontSize: 18 }} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6}>No active rows match this level.</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot><tr>
                <th scope="row" colSpan={6}>{sel.picked.length
                  ? `${plural(sel.picked.length, ...NOUN[level])} selected`
                  : `Total · ${plural(rows.length, ...NOUN[level])}`}</th>
              </tr></tfoot>
            )}
          </table>
        </div>
        <TablePager {...paged} onSize={paged.setSize} label={`${title} pages`} />
        <SelectionBar count={sel.picked.length} noun={NOUN[level]}
                      label="Act on the selected places" onClear={sel.clear}>
          <button type="button" className="btn sm" onClick={() => exportCsv(sel.picked)}>
            <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
          </button>
        </SelectionBar>
      </section>

      <section className="geography-provenance">
        <SectionHead title="Official sources"
                     sub={data.sources.length ? plural(data.sources.length, 'source', 'sources') : undefined} />
        <div className="geography-source-list">
          {data.sources.map((source) => (
            <a key={source.id} href={source.catalogUrl || source.publisherUrl} target="_blank" rel="noreferrer">
              <span><strong>{source.name}</strong><small>{source.authority} · {source.cadence}</small></span>
              <LaunchOutlined sx={{ fontSize: 16 }} aria-hidden />
            </a>
          ))}
        </div>
      </section>

      <section className="geography-history">
        {/* The read asks for the latest 20 runs (api.ts), so a full page is not the whole history. */}
        <SectionHead title="Import history"
                     sub={data.runs.length >= 20 ? `Latest ${data.runs.length} imports`
                       : data.runs.length ? plural(data.runs.length, 'import', 'imports') : undefined}
                     info={'Snapshot imports can retire missing rows; modification imports only apply explicit changes. '
                       + 'Existing internal IDs remain stable during reconciliation.'} />
        <div className="scroll-x geography-table-frame">
          <table className="rectable">
            <thead><tr>
              <th className="selcol">
                <SelectAllBox total={data.runs.length} picked={runSel.picked.length} noun={['import', 'imports']}
                              onToggle={() => { sel.clear(); runSel.toggleAll(); }} />
              </th>
              <th>Source version</th><th>Mode</th><th>Status</th><th>Delta</th><th>Finished</th>
            </tr></thead>
            <tbody>
              {data.runs.map((run) => (
                <tr key={run.id} className={runSel.selected.has(run.id) ? 'selected' : undefined}>
                  <SelectCell checked={runSel.selected.has(run.id)}
                              label={`Select the ${ddmmyyyy(run.sourceEffectiveAt) || run.mode} import`}
                              onToggle={() => { sel.clear(); runSel.toggle(run.id); }} />
                  <td className="mono">{ddmmyyyy(run.sourceEffectiveAt)}</td><td>{run.mode}</td><td>{run.status}</td>
                  <td>{delta(run)}</td><td>{fmtDate(run.finishedAt)}</td>
                </tr>
              ))}
              {!data.runs.length && <tr><td colSpan={6}>No LGD import has run yet.</td></tr>}
            </tbody>
            {data.runs.length > 0 && (
              <tfoot><tr>
                <th scope="row" colSpan={6}>{runSel.picked.length
                  ? `${plural(runSel.picked.length, 'import', 'imports')} selected`
                  : `Total · ${plural(data.runs.length, 'import', 'imports')}`}</th>
              </tr></tfoot>
            )}
          </table>
        </div>
        <SelectionBar count={runSel.picked.length} noun={['import', 'imports']}
                      label="Act on the selected imports" onClear={runSel.clear}>
          <button type="button" className="btn sm" onClick={() => exportRunsCsv(runSel.picked)}>
            <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
          </button>
        </SelectionBar>
      </section>
    </main>
  );
}
