/** W15 — the vault: eight shelves, and every link you have out.
 *
 *  The share log is not buried in settings. It sits under the shelves because
 *  the only honest way to promise "nothing leaves this vault without appearing
 *  in this list" is to put the list where the papers are. */
import { Link } from 'react-router';
import IosShareOutlined from '@mui/icons-material/IosShareOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';

import { useVault, useExtendLink, useRevokeLink } from '../api';
import { Eyebrow, Icon, Loading, PageHead } from '../ui';

/** Each shelf gets its own edge colour so the wall reads as a wall, not a grid
 *  of identical cards. Hues are the Bloom slots, never literals. */
const EDGE: Record<string, string> = {
  title: 'var(--w-info)',
  revenue: 'var(--w-ok)',
  map: 'var(--w-info)',
  identity: 'var(--color-accent-2)',
  search: 'var(--w-warn)',
  old: 'var(--w-ink-3)',
  photos: 'var(--w-danger)',
  unsorted: 'var(--w-ink-3)',
};

export function Vault() {
  const { data, isLoading } = useVault();
  const extend = useExtendLink();
  const revoke = useRevokeLink();

  if (isLoading || !data) return <main><Loading h="70vh" /></main>;

  return (
    <main>
      <PageHead
        eyebrow="Your papers"
        title="Papers"
        actions={
          <>
            <span className="search" style={{ width: '21rem' }}>
              <SearchOutlined sx={{ fontSize: 16 }} aria-hidden />
              <input placeholder={`Search ${data.total} papers, including their text`}
                     aria-label="Search your papers" />
            </span>
            <button type="button" className="btn">
              <IosShareOutlined sx={{ fontSize: 16 }} /> Share a set
            </button>
            <button type="button" className="btn primary">
              <FileUploadOutlined sx={{ fontSize: 16 }} /> Add papers
            </button>
          </>
        }
      >
        <p className="note row tight" style={{ marginTop: '0.375rem' }}>
          <span className="up" style={{ display: 'flex' }}><GppGoodOutlined sx={{ fontSize: 15 }} /></span>
          {data.total} papers, {data.regionNote}
        </p>
      </PageHead>

      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 17rem), 1fr))' }}>
        {data.shelves.map((s) => (
          <Link key={s.key} className="shelf" to={`/app/papers?shelf=${s.key}`}
                style={{ borderLeftColor: EDGE[s.key] ?? 'var(--w-accent)' }}>
            <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', color: EDGE[s.key] ?? 'var(--w-accent)' }}>
                <Icon name={s.key} size={22} />
              </span>
              <span className="num" style={{ fontSize: '1.25rem' }}>{s.count}</span>
            </div>
            <h3 style={{ marginTop: 'var(--space-md)' }}>{s.label}</h3>
            <p className="note" style={{ marginTop: '0.1875rem' }}>{s.note}</p>
          </Link>
        ))}
      </div>

      <section className="sec">
        <div className="row between" style={{ marginBottom: 'var(--space-md)' }}>
          <Eyebrow>Out on a link right now · {data.links.length}</Eyebrow>
          <Link className="accent" to="/app/audit" style={{ fontSize: '0.8125rem', textDecoration: 'none' }}>
            Full share log ›
          </Link>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="rows boxed">
            {data.links.map((l) => {
              const soon = l.daysLeft <= 1;
              return (
                <div key={l.id}>
                  <span className="avatarlg" style={{ width: '2.25rem', height: '2.25rem', fontSize: '0.75rem' }}>
                    {l.initials}
                  </span>
                  <span className="grow">
                    <strong style={{ fontSize: '0.9375rem' }}>
                      {l.audience} — {l.subject}
                    </strong>
                    <span className="note" style={{ display: 'block', marginTop: '0.125rem' }}>{l.terms}</span>
                  </span>
                  <span className={soon ? 'down' : 'note'} style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                    {soon ? 'expires tomorrow' : `${l.daysLeft} days left`}
                  </span>
                  <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                    <button type="button" className="btn sm"
                            onClick={() => extend.mutate({ linkId: l.id, days: 7 })}>
                      Extend
                    </button>
                    <button type="button" className="btn sm danger"
                            onClick={() => revoke.mutate({ linkId: l.id })}>
                      Revoke
                    </button>
                  </span>
                </div>
              );
            })}
            {data.links.length === 0 && (
              <div><p className="note">Nothing is out on a link right now.</p></div>
            )}
          </div>
        </div>

        <p className="note" style={{ marginTop: 'var(--space-md)' }}>
          Revoking kills a link in seconds rather than at expiry. Nothing leaves this vault without
          appearing in this list.
        </p>
      </section>
    </main>
  );
}
