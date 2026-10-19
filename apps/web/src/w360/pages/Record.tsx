/** The record 360 (W03) and the frame its nine hangers are drawn in.
 *
 *  The frame is the record itself: its name, its extent, where it is, what can
 *  be ordered against it, how much of it is filled in, and the tab strip. All
 *  of that is drawn here, once, so it is the same on every hanger — it used to
 *  live inside the Papers tab, which is why the other eight had no title but
 *  their own ("On this land", "Who looks after it") and no way to tell you
 *  which parcel you were reading.
 *
 *  Each hanger now writes a section heading instead — the question it answers —
 *  and the record stays the <h1>. See RecordHead.tsx.
 *
 *  One other screen lives under `properties/:id` and is not a hanger:
 *  requesting work. It is a flow, it draws its own chrome,
 *  and `tabFor` returning undefined is what keeps this frame off it. The
 *  expense ledger used to be another; it is Money's now, drawn inside the
 *  frame with Money the tab you are on, so the property's tabs stay one click
 *  away instead of vanishing.
 */
import { Outlet, useLocation, useOutletContext, useParams } from 'react-router';

import { useRecord } from '../api';
import type { RecordDetail } from '../api';
import { Failed, PageHead } from '../ui';
import { SkRecordPage } from '../skeletons';
import { RecordHead, tabFor, tabTail } from './RecordHead';

interface Ctx { rec: RecordDetail }

export function useRecordCtx(): RecordDetail {
  return useOutletContext<Ctx>().rec;
}

export function Record() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { data, isLoading, error } = useRecord(id);

  // The whole 360 is gated on this one query — no title, no extent, no tab
  // strip, no map until it lands — so what stood here was a 70vh grey slab.
  // The skeleton says which screen is arriving instead.
  if (isLoading) return <SkRecordPage />;
  // A dropped request and a record that genuinely is not yours used to give
  // the same answer. Telling an owner their parcel "is not in your portfolio"
  // because the API was briefly down is the worst sentence this app can say.
  if (error) {
    return (
      <main>
        <PageHead crumbs={[{ label: 'Properties', to: '/properties' }, { label: 'Property' }]} title="Property" />
        <Failed what="This property" error={error} boxed h="26rem" />
      </main>
    );
  }
  if (!data) {
    return (
      <main>
        <PageHead crumbs={[{ label: 'Properties', to: '/properties' }, { label: 'Not found' }]}
                  title="This property is not in your account" />
        <p className="note">It may have been archived, or shared with you rather than owned by you.</p>
      </main>
    );
  }

  const tab = tabFor(pathname);
  const ctx = { rec: data } satisfies Ctx;
  // A flow, not a hanger: it owns the whole page, including its own <main>.
  if (!tab) return <Outlet context={ctx} />;

  // A screen the hanger owns (Money › Expenses) names both in the breadcrumb,
  // with the hanger a link back to itself.
  const owned = tab.also?.find((a) => a.path === tabTail(pathname));
  const layout = tab.to === 'location' ? 'split-instrument'
    : tab.to === 'media' || tab.to === 'people' ? 'viewport' : 'document';
  return (
    <main data-tab-layout={layout}>
      <RecordHead
        rec={data}
        here={tab.to ? tab.label : undefined}
        hereTo={owned ? `/properties/${data.id}/${tab.to}` : undefined}
        leaf={owned?.label}
      />
      <Outlet context={ctx} />
    </main>
  );
}
