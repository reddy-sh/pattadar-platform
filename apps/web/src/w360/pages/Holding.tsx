/** One holding, and the frame its six tabs are drawn in.
 *
 *  Deliberately NOT the record shell. `Record.tsx` and `RecordHead.tsx` are
 *  structurally about one legal record: they offer Share, Order a service,
 *  Archive and Delete, and every one of those acts on a parcel or a property
 *  row. A holding has none of them — you cannot share a grouping, and Delete
 *  here means "stop holding these together", which is a different sentence with
 *  a different dialog. Bolting a mode onto that shell would make both of them
 *  about "a record or maybe not a record".
 *
 *  What IS shared is the furniture: the same `.tabs` strip, the same breadcrumb,
 *  the same cards, rows and empty states. So this reads like the rest of the app
 *  without inheriting the record's meaning.
 *
 *  The Overview and Records tabs live in this file because they are the frame's
 *  own two views — the totals, and the records those totals come from. The
 *  remaining four are lazy route chunks.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams, useNavigate } from 'react-router';
import { useHolding, useProperties, EMPTY_FILTER } from '../api';
import type { HoldingCard, HoldingMember } from '../api';
import { Cell, Crumbs, Failed, HOLDING_WORD, Icon, Menu, Pill, inr, inrOr, num, plural, statusWord } from '../ui';
import { Sk } from '../skeletons';
import { HoldingDeleteDialog, HoldingEditDialog } from './HoldingActions';

interface Ctx { holding: HoldingCard }

export function useHoldingCtx(): HoldingCard {
  return useOutletContext<Ctx>().holding;
}

/** The six tabs, and what each one counts.
 *
 *  `count` returns null where a number would be a guess: Expenses and Services
 *  are computed by their own resolvers and are not on this read, and a wrong
 *  number in permanent chrome is worse than none — the record strip settled the
 *  same question the same way.
 */
export const HOLDING_TABS: {
  to: string; label: string; end?: boolean; count: (c: HoldingCard) => number | null;
}[] = [
  { to: '', label: 'Overview', end: true, count: () => null },
  { to: 'surveys', label: 'Records', count: (c) => c.memberCount },
  { to: 'papers', label: 'Documents', count: (c) => c.paperCount },
  { to: 'fmb', label: 'Combined map', count: (c) => c.surveyedCount },
  { to: 'expenses', label: 'Costs', count: () => null },
  { to: 'services', label: 'Services', count: () => null },
];

export function tabForHolding(pathname: string) {
  const tail = pathname.replace(/\/+$/, '').split('/app/holdings/')[1]?.split('/')[1] ?? '';
  return HOLDING_TABS.find((t) => t.to === tail);
}

function HoldingHead({ holding, here }: { holding: HoldingCard; here?: string }) {
  const nav = useNavigate();
  const [panel, setPanel] = useState<'' | 'edit' | 'delete'>('');
  // The same unfiltered query the Properties list runs, so the edit picker and
  // that screen can never disagree about which records exist or which of them
  // may be combined. React Query already holds its answer by the time anyone
  // gets here — you arrive through that list — so it costs nothing.
  const { data: portfolio } = useProperties(EMPTY_FILTER);

  return (
    <>
      <Crumbs
        trail={[
          { label: HOLDING_WORD.many, to: '/app/holdings' },
          { label: holding.name, to: here ? `/app/holdings/${holding.id}` : undefined },
          ...(here ? [{ label: here }] : []),
        ]}
      />

      <header className="pagehead">
        <div className="grow rechead">
          <div className="rechead-name">
            <Icon name="parcel" size={26} className="rechead-glyph" />
            <h1>{holding.name}</h1>
            {/* The extent, and only the extent. The record count is on the tab
                strip and in the totals; a pill that also carried it made the
                head say "2 records" three times in four lines. */}
            <span className="chip static num rechead-extent">{holding.extentLine}</span>
            {!holding.isComplete && <Pill kind="disputed">Incomplete</Pill>}
          </div>
          <p className="eyebrow rechead-kind">{HOLDING_WORD.one.toUpperCase()}</p>
          <p className="lede rechead-place">
            {holding.placeLine || 'Place not recorded on its records'}
            {holding.note && <> · {holding.note}</>}
          </p>
        </div>
        <div className="actions">
          {/* No "Record a cost" here. The Expenses tab is one click away in the
              strip and owns the real control; a second button that only
              NAVIGATES to it is the same action twice, and the one in the head
              cannot do what its label promises. */}
          <Menu label={`Actions for ${holding.name}`} items={[
            { label: 'Edit name & records', onClick: () => setPanel('edit') },
            {
              label: 'Remove this holding',
              danger: true,
              rule: true,
              onClick: () => setPanel('delete'),
            },
          ]} />
        </div>
      </header>

      {/* A holding whose member was deleted elsewhere. Said here, on every tab,
          because its totals and its costs are now about fewer records than the
          owner set up — and nothing else on the screen could explain the drop. */}
      {!holding.isComplete && (
        <p className="note" role="status" style={{ color: 'var(--w-warn)' }}>
          This holding is down to {plural(holding.memberCount, 'record')}. A record
          in it was deleted.
        </p>
      )}

      {panel === 'edit' && (
        <HoldingEditDialog
          holding={holding}
          candidates={portfolio?.cards ?? []}
          onClose={() => setPanel('')}
        />
      )}
      {panel === 'delete' && (
        <HoldingDeleteDialog
          holding={holding}
          onDone={() => { setPanel(''); nav('/app/holdings'); }}
          onClose={() => setPanel('')}
        />
      )}
    </>
  );
}

function HoldingTabs({ holding }: { holding: HoldingCard }) {
  const strip = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // Six tabs do not fit a phone: the strip scrolls sideways, and arriving on
  // Combined map left the one marker of where you are cut off under its fade.
  // The tab you are on is brought into view, as the record's strip does.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  return (
    <nav ref={strip} className="tabs" aria-label="This holding">
      {HOLDING_TABS.map((t) => {
        const n = t.count(holding);
        return (
          <NavLink key={t.label} end={t.end}
                   to={t.to ? `/app/holdings/${holding.id}/${t.to}` : `/app/holdings/${holding.id}`}>
            {t.label}
            {n !== null && <span className={n > 0 ? 'n' : 'n zero'}>{n}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function Holding() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { data, isLoading, error } = useHolding(id);

  if (isLoading) {
    return (
      <main>
        <Crumbs trail={[{ label: HOLDING_WORD.many, to: '/app/holdings' }, { label: 'Loading' }]} />
        <Sk w="18rem" h="2rem" r="var(--radius-xs)" />
        <Sk w="100%" h="14rem" r="var(--radius-md)" style={{ marginTop: '1rem' }} />
      </main>
    );
  }
  // A dropped request and a holding that genuinely is not yours must not give
  // the same answer: telling an owner their holding does not exist because the
  // API was briefly down is the worst sentence this app can say.
  if (error) {
    return (
      <main>
        <Crumbs trail={[{ label: HOLDING_WORD.many, to: '/app/holdings' }, { label: HOLDING_WORD.one }]} />
        <Failed what="This holding" error={error} boxed h="26rem" />
      </main>
    );
  }
  if (!data) {
    return (
      <main>
        <Crumbs trail={[{ label: HOLDING_WORD.many, to: '/app/holdings' }, { label: 'Not found' }]} />
        <h1>This holding isn't in your account</h1>
        <p className="lede">It may have been ungrouped.</p>
      </main>
    );
  }

  const tab = tabForHolding(pathname);
  const ctx = { holding: data } satisfies Ctx;
  const layout = tab?.to === 'fmb' ? 'split-instrument' : 'document';
  return (
    <main data-tab-layout={layout}>
      <HoldingHead holding={data} here={tab?.to ? tab.label : undefined} />
      <HoldingTabs holding={data} />
      <Outlet context={ctx} />
    </main>
  );
}

/** The holding in four figures, then the records they came from.
 *
 *  This screen used to explain itself: a "What this is" card carrying two
 *  paragraphs of rationale about what a holding does not do. That
 *  belongs in the spec. A screen that argues its own case reads as uncertain,
 *  and it pushed the records — the thing the reader came for — below the fold.
 *
 *  The dashes are gone too. An empty figure printed as "—" with a footnote
 *  explaining what it would have meant is three lines to say "nothing yet";
 *  the cell says that instead, and offers the way to change it.
 */
export function HoldingOverview() {
  const holding = useHoldingCtx();
  const surveyed = holding.surveyedCount === holding.memberCount
    ? 'all with boundaries'
    : `${holding.surveyedCount} of ${holding.memberCount} with boundaries`;
  return (
    <>
      <div className="strip">
        <Cell k="Extent" v={holding.extentLine}
              note={`${plural(holding.memberCount, 'record')} · ${surveyed}`} />
        <Cell k="Estimated value"
              v={holding.marketValue > 0 ? inr(holding.marketValue) : 'Not valued'}
              note={holding.invested > 0 ? `${inr(holding.invested)} paid` : undefined} />
        <Cell k="Shared costs"
              v={holding.combinedSpend > 0 ? inr(holding.combinedSpend) : 'Nothing yet'}
              to={`/app/holdings/${holding.id}/expenses`} />
        <Cell k="Costs on its records"
              v={holding.memberSpend > 0 ? inr(holding.memberSpend) : 'Nothing yet'}
              to={`/app/holdings/${holding.id}/expenses?scope=record`} />
      </div>

      <div className="cards">
        {holding.members.map((m) => <MemberCard key={m.id} member={m} />)}
      </div>
    </>
  );
}

/** One member. The title links to the RECORD, because that is where its papers,
 *  boundary, people and own costs live — a holding never becomes a
 *  second place to edit a survey.
 *
 *  Three things were cut. The second extent reading ("3 Acres 1.6 Guntas · 324
 *  Cents · 14,714 Sq.yd") is what the RECORD's own header is for, and under the
 *  figure it converts it read as four numbers where there is one fact. The
 *  sheet's name was printed raw, so a card could end in "3 acres Map Doc
 *  (4).pdf" — a filename is not a fact about land. And the place was repeated on
 *  every card although the head already names where the holding is; only the
 *  village stays, because that is what tells two members apart. */
function MemberCard({ member }: { member: HoldingMember }) {
  const ground = member.ground === 'surveyed' ? 'Boundary on file'
    : member.ground === 'pinned' ? 'Pin only' : 'Not located';
  return (
    <article className="card pad-lg">
      <div className="cardhead">
        <h2 style={{ fontSize: '0.9375rem' }}>
          <Link to={`/app/records/${member.recordId}`} className="accent"
                style={{ textDecoration: 'none' }}>
            {member.title}
          </Link>
        </h2>
        {member.archived
          ? <Pill kind="archived">Archived</Pill>
          : member.status !== 'owned' && statusWord(member.status)
            ? <Pill kind={member.status}>{statusWord(member.status)}</Pill>
            : null}
      </div>
      <p className="num" style={{ margin: 0, fontSize: '1.0625rem' }}>
        {member.extentUnit === 'ac' ? `${num(member.extent, 2)} ac` : `${num(member.extent)} ${member.extentUnit}`}
        {member.marketValue > 0 && <> · {inr(member.marketValue)}</>}
      </p>
      <p className="note" style={{ margin: '0.15rem 0 0' }}>
        {[member.placeLine.split(',')[0], member.khataNo && `Khata ${member.khataNo}`]
          .filter(Boolean).join(' · ')}
      </p>
      <p className="note" style={{ margin: 0 }}>
        {[ground, plural(member.paperCount, 'document'), member.sheetTitle && 'sheet filed']
          .filter(Boolean).join(' · ')}
      </p>
      <div className="row tight">
        <Link className="btn sm" to={`/app/records/${member.recordId}`}>Open record</Link>
        <Link className="btn sm" to={`/app/records/${member.recordId}/map`}>
          {member.ground === 'surveyed' ? 'View boundary' : 'Locate it'}
        </Link>
      </div>
    </article>
  );
}

/** The records this holding is made of, and what each still owes. */
export function HoldingSurveys() {
  const holding = useHoldingCtx();
  const short = holding.members.filter((m) => m.ground !== 'surveyed');
  return (
    <>
      <header className="sechead">
        <div className="grow">
          <h2>Records in this holding</h2>
          <p className="note" style={{ margin: '0.25rem 0 0' }}>
            {plural(holding.memberCount, 'record')} · {holding.surveyedCount} with a
            boundary · {plural(holding.paperCount, 'document')} between them.
          </p>
        </div>
      </header>

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table className="rectable" style={{ minWidth: '44rem' }}>
          <thead>
            <tr>
              <th>Record</th>
              <th>Khata</th>
              <th>Where</th>
              <th>On the map</th>
              <th className="right">Extent</th>
              <th className="right">Worth</th>
              <th className="right">Documents</th>
            </tr>
          </thead>
          <tbody>
            {holding.members.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link to={`/app/records/${m.recordId}`} className="accent"
                        style={{ textDecoration: 'none' }}>{m.title}</Link>
                  {m.archived && <> <Pill kind="archived">Archived</Pill></>}
                </td>
                <td className="muted">{m.khataNo || '—'}</td>
                <td className="muted">{m.placeLine || '—'}</td>
                <td className="muted">
                  {m.ground === 'surveyed' ? 'Boundary'
                    : m.ground === 'pinned' ? 'Pin only' : 'Nothing yet'}
                </td>
                <td className="right num">
                  {m.extentUnit === 'ac' ? `${num(m.extent, 2)} ac` : `${num(m.extent)} ${m.extentUnit}`}
                </td>
                <td className="right num">{inrOr(m.marketValue)}</td>
                <td className="right num">{m.paperCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {short.length > 0 && (
        <p className="note">
          No boundary saved: {short.map((m) => m.title).join(', ')}.
        </p>
      )}
    </>
  );
}

export default Holding;
