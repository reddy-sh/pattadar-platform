import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageMeta } from '../components/PageMeta';
import {
  landRecordAvailabilityLabels,
  publishedStateLandRecordProfiles,
} from '../data/stateLandRecords';
import { buildStateDirectoryStructuredData } from '../seo/stateSeo';

const directoryStructuredData = buildStateDirectoryStructuredData();

export function StateGuidesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const paramsKey = searchParams.toString();
  const pendingParams = useRef(new URLSearchParams(paramsKey));
  const committedParams = useRef(paramsKey);
  if (committedParams.current !== paramsKey) {
    committedParams.current = paramsKey;
    pendingParams.current = new URLSearchParams(paramsKey);
  }

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return publishedStateLandRecordProfiles.filter((profile) => {
      const haystack = [
        profile.name,
        profile.code,
        profile.primaryRecordLabel,
        profile.summary,
        ...profile.localTerms,
      ].join(' ').toLocaleLowerCase();
      return !term || haystack.includes(term);
    });
  }, [query]);

  const updateParam = (key: 'q', value: string) => {
    const next = new URLSearchParams(pendingParams.current);
    if (!value) next.delete(key);
    else next.set(key, value);
    pendingParams.current = next;
    setSearchParams(next, { replace: true });
  };

  return (
    <main className="page-shell interior-page state-directory-page">
      <PageMeta
        title="Andhra Pradesh and Telangana Land Records | Pattadar University"
        description="Government-sourced land-record learning guides for Andhra Pradesh and Telangana, covering revenue records, mutation, survey maps, registration, and evidence limits."
        path="/states"
        structuredData={directoryStructuredData}
      />
      <header className="page-heading state-directory-heading">
        <span className="context-line">Reviewed jurisdiction library</span>
        <h1>State land-record guides</h1>
        <p>Start with reviewed learning for Andhra Pradesh and Telangana. Each guide uses current government sources and names the limits of portal, revenue, survey, and registration evidence.</p>
      </header>

      <dl className="jurisdiction-summary" aria-label="Directory coverage">
        <div><dt>Reviewed states</dt><dd>2</dd></div>
        <div><dt>Detailed courses</dt><dd>2</dd></div>
        <div><dt>Government sources only</dt><dd>Yes</dd></div>
        <div><dt>Source review</dt><dd>20 Sep 2026</dd></div>
      </dl>

      <section className="state-directory-boundary" aria-labelledby="directory-boundary-title">
        <h2 id="directory-boundary-title">Two states, separate current systems</h2>
        <p>Andhra Pradesh uses MeeBhoomi, BhuNaksha, GSWS, and Registration services as separate evidence layers. Telangana now uses Bhu Bharati as its integrated entry point under the 2025 Record of Rights framework. Neither portal produces an automatic title or boundary conclusion.</p>
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
        <span className="state-directory-count" aria-live="polite">{visible.length} of {publishedStateLandRecordProfiles.length} guides</span>
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
          <div><h2>No guides match</h2><p>Try Andhra Pradesh, Telangana, a local record term, or a portal name.</p></div>
          <button className="button button--quiet" type="button" onClick={() => setSearchParams({}, { replace: true })}>Clear search</button>
        </section>
      )}
    </main>
  );
}
