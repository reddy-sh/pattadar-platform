import { useMemo, useState } from 'react';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import LaunchOutlined from '@mui/icons-material/LaunchOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

import {
  useGeographyReference,
  usePortfolio,
  type GeographyRow,
  type ReferenceDataSyncRun,
} from '../api';
import { Failed, Loading } from '../ui';

type Level = 'state' | 'district' | 'mandal' | 'village';

const fmtDate = (value: string) => {
  if (!value) return 'Not imported yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN');
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

  const chooseState = (value: string) => {
    setStateId(value); setDistrictId(''); setMandalId(''); setSearch('');
  };
  const chooseDistrict = (value: string) => {
    setDistrictId(value); setMandalId(''); setSearch('');
  };
  const chooseMandal = (value: string) => {
    setMandalId(value); setSearch('');
  };
  const descend = (row: GeographyRow) => {
    if (level === 'state') chooseState(row.id);
    if (level === 'district') chooseDistrict(row.id);
    if (level === 'mandal') chooseMandal(row.id);
  };

  if (portfolio.isLoading) return <main><Loading what="your administration access" h="24rem" /></main>;
  if (!allowed) {
    return (
      <main className="geography-admin">
        <div className="compliance-denied">
          <LockOutlined sx={{ fontSize: 28 }} aria-hidden />
          <h1>Government reference data is restricted</h1>
          <p>Only a super-admin can read source provenance and synchronization history.</p>
        </div>
      </main>
    );
  }
  if (reference.isLoading) return <main><Loading what="government geography" h="24rem" /></main>;
  if (reference.error || !data) {
    return <main><Failed what="Government geography" error={reference.error} boxed h="24rem" /></main>;
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
      <header className="geography-titlebar">
        <div>
          <p className="eyebrow">Administration · Reference data</p>
          <h1>Government geography</h1>
          <p className="lede">Canonical state, district, sub-district and village codes with source and change history.</p>
        </div>
        <div className="geography-freshness">
          <span className="eyebrow">Latest successful import</span>
          <strong>{fmtDate(data.summary.lastCompletedAt)}</strong>
        </div>
      </header>

      <section className="geography-counts" aria-label="Active government geography rows">
        {([
          ['States / UTs', data.summary.states], ['Districts', data.summary.districts],
          ['Sub-districts', data.summary.mandals], ['Villages', data.summary.villages],
        ] as const).map(([label, value]) => (
          <div key={label}><span>{label}</span><strong>{value.toLocaleString('en-IN')}</strong></div>
        ))}
      </section>

      <section className="geography-controls" aria-label="Geography hierarchy filters">
        <div className="field">
          <label htmlFor="ref-state">State / UT</label>
          <select id="ref-state" value={stateId} onChange={(event) => chooseState(event.target.value)}>
            <option value="">All states and UTs</option>
            {data.states.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ref-district">District</label>
          <select id="ref-district" value={districtId} disabled={!stateId}
                  onChange={(event) => chooseDistrict(event.target.value)}>
            <option value="">All districts</option>
            {data.districts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ref-mandal">Mandal / sub-district</label>
          <select id="ref-mandal" value={mandalId} disabled={!districtId}
                  onChange={(event) => chooseMandal(event.target.value)}>
            <option value="">All sub-districts</option>
            {data.mandals.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>
        <label className="geography-search" htmlFor="ref-search">
          <SearchOutlined sx={{ fontSize: 18 }} aria-hidden />
          <input id="ref-search" value={search} onChange={(event) => setSearch(event.target.value)}
                 placeholder={`Search ${level === 'mandal' ? 'sub-districts' : `${level}s`}`} />
        </label>
      </section>

      <section className="geography-table-section">
        <div className="row between geography-table-heading">
          <div><p className="eyebrow">Current level</p><h2>{title}</h2></div>
          <span className="mono">{rows.length.toLocaleString('en-IN')} shown</span>
        </div>
        <div className="scroll-x geography-table-frame">
          <table className="rectable">
            <thead><tr>
              <th>Name</th><th>Local name</th><th>LGD code</th>
              {level === 'village' && <th>Census 2011</th>}
              <th>Source version</th>{level !== 'village' && <th aria-label="Open next level" />}
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.nameLocal || '-'}</td>
                  <td className="mono">{row.lgdCode || 'Pending match'}</td>
                  {level === 'village' && <td className="mono">{row.census2011Code || '-'}</td>}
                  <td>{row.sourceEffectiveAt || 'Bundled transition'}</td>
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
              {!rows.length && <tr><td colSpan={level === 'village' ? 5 : 5}>No active rows match this level.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="geography-provenance">
        <div><p className="eyebrow">Provenance</p><h2>Official sources</h2></div>
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
        <div><p className="eyebrow">ETL ledger</p><h2>Import history</h2></div>
        <div className="scroll-x geography-table-frame">
          <table className="rectable">
            <thead><tr><th>Source version</th><th>Mode</th><th>Status</th><th>Delta</th><th>Finished</th></tr></thead>
            <tbody>
              {data.runs.map((run) => (
                <tr key={run.id}>
                  <td className="mono">{run.sourceEffectiveAt}</td><td>{run.mode}</td><td>{run.status}</td>
                  <td>{delta(run)}</td><td>{fmtDate(run.finishedAt)}</td>
                </tr>
              ))}
              {!data.runs.length && <tr><td colSpan={5}>No LGD import has run yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="geography-note">
        Pattadar calls the official LGD sub-district level a mandal. Snapshot imports can retire missing rows;
        modification imports only apply explicit changes. Existing internal IDs remain stable during reconciliation.
      </footer>
    </main>
  );
}
