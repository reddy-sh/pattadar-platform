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
 *  Three other screens live under `records/:id` and are not hangers: ordering a
 *  service, requesting work, and the expense ledger. They are flows, they draw
 *  their own chrome, and `tabFor` returning undefined is what keeps this frame
 *  off them.
 */
import { Outlet, useLocation, useOutletContext, useParams } from 'react-router';

import { useRecord } from '../api';
import type { RecordDetail } from '../api';
import { Crumbs, Failed } from '../ui';
import { SkRecordPage } from '../skeletons';
import { RecordHead, tabFor } from './RecordHead';

interface Ctx { rec: RecordDetail }

export function useRecordCtx(): RecordDetail {
  return useOutletContext<Ctx>().rec;
}

// Re-exported for the flows under `records/:id`, which still draw their own
// breadcrumb and (in the ledger's case) their own strip. They imported these
// from here long before the chrome moved out.
export { RecordCrumbs, RecordTabs, TABS } from './RecordHead';

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
        <Crumbs trail={[{ label: 'Properties', to: '/app/properties' }, { label: 'Record' }]} />
        <Failed what="This record" error={error} boxed h="26rem" />
      </main>
    );
  }
  if (!data) {
    return (
      <main>
        <Crumbs trail={[{ label: 'Properties', to: '/app/properties' }, { label: 'Not found' }]} />
        <h1>That record is not in your portfolio</h1>
        <p className="lede">It may have been archived, or shared with you rather than owned by you.</p>
      </main>
    );
  }

  const tab = tabFor(pathname);
  const ctx = { rec: data } satisfies Ctx;
  // A flow, not a hanger: it owns the whole page, including its own <main>.
  if (!tab) return <Outlet context={ctx} />;

  return (
    <main>
      <RecordHead rec={data} here={tab.to ? tab.label : undefined} />
      <Outlet context={ctx} />
    </main>
  );
}
