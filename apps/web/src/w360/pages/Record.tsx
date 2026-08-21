/** The record 360 (W03) and the frame its six hangers are drawn in.
 *
 *  Each hanger writes its own headline — "Sy 214/2", "On this land", "Who looks
 *  after it", "What it cost, what it's worth" — because the question being
 *  asked changes, and the mock is emphatic that the page announces the question
 *  rather than the tab. What they share is the breadcrumb and the tab strip,
 *  and those live here. */
import { Outlet, NavLink, useOutletContext, useParams } from 'react-router';

import { useRecord } from '../api';
import type { RecordDetail } from '../api';
import { Crumbs, Loading } from '../ui';

interface Ctx { rec: RecordDetail }

export function useRecordCtx(): RecordDetail {
  return useOutletContext<Ctx>().rec;
}

const TABS = [
  { to: '', label: 'Papers', count: (r: RecordDetail) => r.paperCount, end: true },
  { to: 'features', label: 'Features', count: (r: RecordDetail) => r.featureCount },
  { to: 'people', label: 'People', count: (r: RecordDetail) => r.peopleCount },
  { to: 'services', label: 'Services', count: (r: RecordDetail) => r.serviceCount },
  { to: 'money', label: 'Money', count: () => 0 },
  { to: 'history', label: 'History', count: () => 0 },
];

export function RecordTabs({ rec }: { rec: RecordDetail }) {
  return (
    <nav className="tabs" aria-label="This record">
      {TABS.map((t) => (
        <NavLink key={t.label} end={t.end} to={t.to ? `/app/records/${rec.id}/${t.to}` : `/app/records/${rec.id}`}>
          {t.label}
          {t.count(rec) > 0 && <span className="n">{t.count(rec)}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

/** The breadcrumb every hanger shares: Properties › the record › this hanger. */
export function RecordCrumbs({ rec, here }: { rec: RecordDetail; here?: string }) {
  return (
    <Crumbs
      trail={[
        { label: 'Properties', to: '/app/properties' },
        { label: rec.title, to: here ? `/app/records/${rec.id}` : undefined },
        ...(here ? [{ label: here }] : []),
      ]}
    />
  );
}

export function Record() {
  const { id } = useParams();
  const { data, isLoading, error } = useRecord(id);

  if (isLoading) return <main><Loading h="70vh" /></main>;
  if (error || !data) {
    return (
      <main>
        <Crumbs trail={[{ label: 'Properties', to: '/app/properties' }, { label: 'Not found' }]} />
        <h1>That record is not in your portfolio</h1>
        <p className="lede">It may have been archived, or shared with you rather than owned by you.</p>
      </main>
    );
  }
  return <Outlet context={{ rec: data } satisfies Ctx} />;
}
