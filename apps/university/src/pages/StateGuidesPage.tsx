import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageMeta } from '../components/PageMeta';
import {
  landRecordAvailabilityLabels,
  stateLandRecordProfiles,
} from '../data/stateLandRecords';
import type { JurisdictionKind } from '../domain/types';
import { buildStateDirectoryStructuredData } from '../seo/stateSeo';

type KindFilter = JurisdictionKind | 'all';

const directoryStructuredData = buildStateDirectoryStructuredData();

function isKindFilter(value: string | null): value is KindFilter {
  return value === 'all' || value === 'state' || value === 'union-territory';
}

export function StateGuidesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const requestedKind = searchParams.get('kind');
  const kind: KindFilter = isKindFilter(requestedKind) ? requestedKind : 'all';
  const paramsKey = searchParams.toString();
  const pendingParams = useRef(new URLSearchParams(paramsKey));
  const committedParams = useRef(paramsKey);
  if (committedParams.current !== paramsKey) {
    committedParams.current = paramsKey;
    pendingParams.current = new URLSearchParams(paramsKey);
  }

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return stateLandRecordProfiles.filter((profile) => {
      const matchesKind = kind === 'all' || profile.kind === kind;
      const haystack = [
        profile.name,
        profile.code,
        profile.primaryRecordLabel,
        profile.summary,
        ...profile.localTerms,
      ].join(' ').toLocaleLowerCase();
      return matchesKind && (!term || haystack.includes(term));
    });
  }, [kind, query]);

  const updateParam = (key: 'q' | 'kind', value: string) => {
    const next = new URLSearchParams(pendingParams.current);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    pendingParams.current = next;
    setSearchParams(next, { replace: true });
  };

  return (
    <main className="page-shell interior-page state-directory-page">
      <PageMeta
        title="India Land Records by State and Union Territory | Pattadar University"
        description="Official land-record guides for all 28 Indian states and 8 union territories, including local record names, mutation, maps, registration, and evidence limits."
        path="/states"
        structuredData={directoryStructuredData}
      />
      <header className="page-heading state-directory-heading">
        <span className="context-line">India jurisdiction library</span>
        <h1>State land-record guides</h1>
        <p>Learn the record names, official systems, and evidence boundaries used across all 28 states and 8 union territories.</p>
      </header>

      <dl className="jurisdiction-summary" aria-label="Directory coverage">
        <div><dt>States</dt><dd>28</dd></div>
        <div><dt>Union territories</dt><dd>8</dd></div>
        <div><dt>Government sources only</dt><dd>Yes</dd></div>
        <div><dt>Source review</dt><dd>20 Sep 2026</dd></div>
      </dl>

      <section className="state-directory-boundary" aria-labelledby="directory-boundary-title">
        <h2 id="directory-boundary-title">One country, many record systems</h2>
        <p>Land administration is state managed. A Jamabandi, 7/12, Patta, Parcha, RTC, or Record of Rights can have a different form, authority, coverage, and legal use. Portal data is a starting point, not an automated title certificate.</p>
      </section>

      <section className="state-directory-controls" aria-label="Filter state guides">
        <label className="state-search" htmlFor="state-guide-search">
          <span>Search guides</span>
          <span className="state-search__control">
            <SearchRounded />
            <input
              id="state-guide-search"
              type="search"
              value={query}
              placeholder="State, record name, or portal"
              onChange={(event) => updateParam('q', event.target.value)}
            />
          </span>
        </label>
        <label className="filter-select" htmlFor="state-guide-kind">
          <span>Jurisdiction type</span>
          <select id="state-guide-kind" value={kind} onChange={(event) => updateParam('kind', event.target.value)}>
            <option value="all">All jurisdictions</option>
            <option value="state">States</option>
            <option value="union-territory">Union territories</option>
          </select>
        </label>
        <span className="state-directory-count" aria-live="polite">{visible.length} of {stateLandRecordProfiles.length} guides</span>
      </section>

      {visible.length ? (
        <div className="state-guide-list" aria-live="polite">
          {visible.map((profile) => {
            const landRecordsLink = profile.officialLinks.find((link) => link.kind === 'land-records');
            return (
              <article className="state-guide-row" key={profile.code}>
                <span className="state-code" aria-hidden="true">{profile.code}</span>
                <div className="state-guide-row__identity">
                  <span>{profile.kind === 'state' ? 'State' : 'Union territory'} · {landRecordAvailabilityLabels[profile.availability]}</span>
                  <h2><Link to={`/states/${profile.slug}`}>{profile.name}</Link></h2>
                  <p>{profile.summary}</p>
                </div>
                <div className="state-guide-row__record">
                  <span>Start with</span>
                  <strong>{profile.primaryRecordLabel}</strong>
                  <small>{profile.localTerms.slice(0, 4).join(' · ')}</small>
                </div>
                <div className="state-guide-row__actions">
                  {landRecordsLink ? (
                    <a href={landRecordsLink.url} target="_blank" rel="noreferrer" aria-label={`Open ${landRecordsLink.label} for ${profile.name}`}>
                      Official portal <LaunchRounded />
                    </a>
                  ) : null}
                  <Link className="text-action" to={`/states/${profile.slug}`}>Open guide <ArrowForwardRounded /></Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="filter-empty" aria-live="polite">
          <SearchRounded />
          <div><h2>No guides match</h2><p>Try a state name, local record term, or another jurisdiction type.</p></div>
          <button className="button button--quiet" type="button" onClick={() => setSearchParams({}, { replace: true })}>Clear search</button>
        </section>
      )}
    </main>
  );
}
