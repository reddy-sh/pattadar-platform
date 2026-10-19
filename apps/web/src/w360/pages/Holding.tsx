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
 *  The Overview and Properties tabs live in this file because they are the
 *  frame's own two views — the totals, and the properties those totals come
 *  from. The remaining four are lazy route chunks.
 *
 *  A holding says WHICH properties make one piece of ground; a family or group
 *  says WHO holds each of them (memo 06/10/2026). So the holding shows its
 *  holders — the "Held by" line and a holder on every row — but is never
 *  itself "held": it is "part of" and "one piece of ground".
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams, useNavigate } from 'react-router';
import { useHolding, useProperties, EMPTY_FILTER, OWN_NAME } from '../api';
import type { HoldingCard, HoldingHolder, HoldingMember } from '../api';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import { Card, Cell, Failed, HOLDING_WORD, Icon, PageHead, Pill, SelectAllBox, SelectCell, SelectionBar, TablePager, downloadCsv, inr, inrOr, num, plural, statusWord, usePaged, useRowSelection } from '../ui';
import { extentTotal } from '../PropertyTable';
import { Sk } from '../skeletons';
import { HoldingDeleteDialog, HoldingEditDialog } from './HoldingActions';
import { SectionHead } from './RecordHead';

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
  { to: 'surveys', label: 'Properties', count: (c) => c.memberCount },
  { to: 'papers', label: 'Documents', count: (c) => c.paperCount },
  { to: 'fmb', label: 'Boundaries', count: (c) => c.surveyedCount },
  { to: 'expenses', label: 'Expenses', count: () => null },
  { to: 'services', label: 'Services', count: () => null },
];

export function tabForHolding(pathname: string) {
  const tail = /^\/holdings\/[^/?#]+\/([^/?#]*)/.exec(pathname)?.[1] ?? '';
  return HOLDING_TABS.find((t) => t.to === tail);
}

function HoldingHead({ holding, here }: { holding: HoldingCard; here?: string }) {
  const nav = useNavigate();
  const [panel, setPanel] = useState<'' | 'edit' | 'delete'>('');
  // The same unfiltered query the Properties list runs, so the edit picker and
  // that screen can never disagree about which properties exist or which of them
  // may be combined. React Query already holds its answer by the time anyone
  // gets here — you arrive through that list — so it costs nothing.
  const { data: portfolio } = useProperties(EMPTY_FILTER);

  return (
    <>
      {/* The shared head (design.md § Page head, detail page): crumbs, the
          name with its glyph and extent pill, the kind and place as the meta
          row, the ⋮, then the tab strip as the head's last row. */}
      <PageHead
        crumbs={[
          { label: HOLDING_WORD.many, to: '/holdings' },
          { label: holding.name, to: here ? `/holdings/${holding.id}` : undefined },
          ...(here ? [{ label: here }] : []),
        ]}
        title={holding.name}
        glyph={<Icon name="parcel" size={26} className="rechead-glyph" />}
        pill={<>
          {/* The extent, and only the extent. The property count is on the
              tab strip and in the totals; a pill that also carried it made
              the head say "2 properties" three times in four lines. */}
          <span className="chip static num rechead-extent">{holding.extentLine}</span>
          {!holding.isComplete && <Pill kind="disputed">Incomplete</Pill>}
        </>}
        meta={<>
          <span className="eyebrow rechead-kind">{HOLDING_WORD.one.toUpperCase()}</span>
          <span aria-hidden>·</span>
          <span className="rechead-place">
            {holding.placeLine || 'Place not recorded on its properties'}
            {holding.note && <> · {holding.note}</>}
          </span>
        </>}
        // No "Add an expense" here. The Expenses tab is one click away in the
        // strip and owns the real control; a second button that only
        // NAVIGATES to it is the same action twice.
        actions={{
          overflow: [
            { label: 'Edit name and properties', onClick: () => setPanel('edit') },
            { label: 'Delete this holding', danger: true, rule: true, onClick: () => setPanel('delete') },
          ],
          overflowLabel: `Actions for ${holding.name}`,
        }}
        tabs={<HoldingTabs holding={holding} />}
      />

      {/* A holding whose member was deleted elsewhere. Said here, on every tab,
          because its totals and its expenses are now about fewer properties than the
          owner set up — and nothing else on the screen could explain the drop. */}
      {!holding.isComplete && (
        <p className="note" role="status" style={{ color: 'var(--w-warn)' }}>
          This holding is down to {plural(holding.memberCount, 'property', 'properties')}.
          A property in it was deleted.
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
          onDone={() => { setPanel(''); nav('/holdings'); }}
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
  // Boundaries left the one marker of where you are cut off under its fade.
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
                   to={t.to ? `/holdings/${holding.id}/${t.to}` : `/holdings/${holding.id}`}>
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
        <PageHead crumbs={[{ label: HOLDING_WORD.many, to: '/holdings' }, { label: HOLDING_WORD.one }]}
                  title={HOLDING_WORD.one} />
        <Sk w="100%" h="14rem" r="var(--radius-md)" />
      </main>
    );
  }
  // A dropped request and a holding that genuinely is not yours must not give
  // the same answer: telling an owner their holding does not exist because the
  // API was briefly down is the worst sentence this app can say.
  if (error) {
    return (
      <main>
        <PageHead crumbs={[{ label: HOLDING_WORD.many, to: '/holdings' }, { label: HOLDING_WORD.one }]}
                  title={HOLDING_WORD.one} />
        <Failed what="This holding" error={error} boxed h="26rem" />
      </main>
    );
  }
  if (!data) {
    return (
      <main>
        <PageHead crumbs={[{ label: HOLDING_WORD.many, to: '/holdings' }, { label: 'Not found' }]}
                  title="This holding is not in your account" />
        <p className="note">It may have been deleted.</p>
      </main>
    );
  }

  const tab = tabForHolding(pathname);
  const ctx = { holding: data } satisfies Ctx;
  const layout = tab?.to === 'fmb' ? 'split-instrument' : 'document';
  return (
    <main data-tab-layout={layout}>
      <HoldingHead holding={data} here={tab?.to ? tab.label : undefined} />
      <Outlet context={ctx} />
    </main>
  );
}

/** The holding in four figures, then the properties they came from.
 *
 *  This screen used to explain itself: a "What this is" card carrying two
 *  paragraphs of rationale about what a holding does not do. That
 *  belongs in the spec. A screen that argues its own case reads as uncertain,
 *  and it pushed the records — the thing the reader came for — below the fold.
 *
 *  The dashes are gone too. An empty figure printed as "—" with a footnote
 *  explaining what it would have meant is three lines to say "nothing yet";
 *  the cell says that instead, and offers the way to change it.
 *
 *  One shared `.stack lg` holds the figures and the records. As a bare fragment
 *  both were children of `main`, a flex column with no gap, so the strip and
 *  the cards met border to border. The stack's --space-lg is wider than the
 *  --space-md between cards: the gap between groups beats the gap inside one.
 */
export function HoldingOverview() {
  const holding = useHoldingCtx();
  const surveyed = holding.surveyedCount === holding.memberCount
    ? 'all with boundaries'
    : `${holding.surveyedCount} of ${holding.memberCount} with boundaries`;
  return (
    <div className="stack lg">
      <HeldBy holding={holding} />
      <div className="strip">
        <Cell k="Extent" v={holding.extentLine}
              note={`${plural(holding.memberCount, 'property', 'properties')} · ${surveyed}`} />
        <Cell k="Market estimate"
              v={holding.marketValue > 0 ? inr(holding.marketValue) : 'No estimate yet'}
              note={holding.invested > 0 ? `${inr(holding.invested)} paid` : undefined} />
        <Cell k="Shared expenses"
              v={holding.combinedSpend > 0 ? inr(holding.combinedSpend) : 'Nothing yet'}
              to={`/holdings/${holding.id}/expenses`} />
        <Cell k="Expenses on its properties"
              v={holding.memberSpend > 0 ? inr(holding.memberSpend) : 'Nothing yet'}
              to={`/holdings/${holding.id}/expenses?scope=record`} />
      </div>

      <div className="cards">
        {holding.members.map((m) => <MemberCard key={m.id} member={m} />)}
      </div>
    </div>
  );
}

/** Who holds the holding's properties, largest holder first.
 *
 *  The server sends it on the one-holding read (`heldBy`); the list read does
 *  not, so it is worked out from the members there — the same grouping, so
 *  the two can never disagree. */
function holdersOf(holding: HoldingCard): HoldingHolder[] {
  if (holding.heldBy) return holding.heldBy;
  const by = new Map<string, HoldingHolder>();
  for (const m of holding.members) {
    const h = by.get(m.groupId) ?? { groupId: m.groupId, name: m.holderLabel || OWN_NAME, count: 0 };
    h.count += 1;
    by.set(m.groupId, h);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The holding's read-only "Held by" line.
 *
 *  "Held by" is the group's verb, so the line names the families and groups
 *  that hold its properties — a holding can span several, the way one farm
 *  can include a grandfather's undivided khata — and links each to its page.
 *  Land in nobody's group is said last, as its own sentence, so the line never
 *  reads "Held by In your own name". Counts appear only when there is more than
 *  one holder: with one, they would only repeat the property count. */
function HeldBy({ holding }: { holding: HoldingCard }) {
  const all = holdersOf(holding);
  if (all.length === 0) return null;
  const groups = all.filter((h) => h.groupId);
  const own = all.find((h) => !h.groupId);
  const counted = all.length > 1;
  return (
    <p className="note" style={{ margin: 0 }}>
      {groups.length > 0 && (
        <>
          Held by{' '}
          {groups.map((h, i) => (
            <Fragment key={h.groupId}>
              {i > 0 && ', '}
              <Link className="accent" to={`/groups/${h.groupId}`}>{h.name}</Link>
              {counted && <> · {plural(h.count, 'property', 'properties')}</>}
            </Fragment>
          ))}
          {own && '. '}
        </>
      )}
      {own && (groups.length > 0
        ? <>{plural(own.count, 'property', 'properties')} in your own name.</>
        : OWN_NAME)}
    </p>
  );
}

/** One property's holder: its family or group, linked, or "In your own name".
 *  `bare` drops the "Held by" where a column head already says it. */
function Holder({ member, bare }: { member: HoldingMember; bare?: boolean }) {
  if (!member.groupId) return <>{OWN_NAME}</>;
  const name = (
    <Link className="accent" to={`/groups/${member.groupId}`} style={{ textDecoration: 'none' }}>
      {member.holderLabel}
    </Link>
  );
  return bare ? name : <>Held by {name}</>;
}

/** One member. The title links to the PROPERTY, because that is where its
 *  documents, boundary, people and own expenses live — a holding never becomes a
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
          <Link to={`/properties/${member.recordId}`} className="accent"
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
        {[ground, plural(member.paperCount, 'document'), member.sheetTitle && 'sheet saved']
          .filter(Boolean).join(' · ')}
      </p>
      <p className="note" style={{ margin: 0 }}><Holder member={member} /></p>
      {/* A button pair on the named scale: --space-sm between the buttons (the
          12px the Boundaries tab's pair has) and --space-md above them. `.row
          tight` is a raw 6px with nothing above, which left the buttons glued
          to the status line; it is shared, so only this row changes. */}
      <div className="row" style={{ gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
        <Link className="btn sm" to={`/properties/${member.recordId}`}>Open property</Link>
        <Link className="btn sm" to={`/properties/${member.recordId}/location`}>
          {member.ground === 'surveyed' ? 'View boundary' : 'Locate it'}
        </Link>
      </div>
    </article>
  );
}

const memberId = (m: HoldingMember) => m.id;

/** The properties this holding is made of, who holds each, and what each
 *  still owes. */
export function HoldingSurveys() {
  const holding = useHoldingCtx();
  const short = holding.members.filter((m) => m.ground !== 'surveyed');
  // Members keep the holding's own order; the footer sums every member, not
  // just this page.
  const paged = usePaged(holding.members, { resetKey: holding.id, storeKey: 'pattadar.table.holding-properties' });
  const sel = useRowSelection(holding.members, memberId, holding.id);
  // Ticked rows sum in the footer, as a spreadsheet's status bar does.
  const sumRows = sel.picked.length > 0 ? sel.picked : holding.members;
  const extentCell = (m: HoldingMember) =>
    m.extentUnit === 'ac' ? `${num(m.extent, 2)} ac` : `${num(m.extent)} ${m.extentUnit}`;
  const groundWord = (m: HoldingMember) =>
    m.ground === 'surveyed' ? 'Boundary' : m.ground === 'pinned' ? 'Pin only' : 'Nothing yet';
  // The columns the table shows, in its order.
  const exportCsv = (rows: HoldingMember[]) => downloadCsv(
    `${holding.name}-properties-${new Date().toISOString().slice(0, 10)}.csv`,
    [['Property', 'Held by', 'Khata', 'Where', 'On the map', 'Extent', 'Market estimate', 'Documents'],
     ...rows.map((m) => [m.title, m.groupId ? m.holderLabel : OWN_NAME, m.khataNo, m.placeLine, groundWord(m),
       extentCell(m), m.marketValue, m.paperCount])]);
  return (
    <>
      <SectionHead title="Properties"
                   sub={holding.memberCount > 0 ? [
                     plural(holding.memberCount, 'property', 'properties'),
                     holding.surveyedCount > 0 && `${holding.surveyedCount} with a boundary`,
                     holding.paperCount > 0 && plural(holding.paperCount, 'document'),
                   ].filter(Boolean).join(' · ') : undefined} />
      <HeldBy holding={holding} />

      <Card flush className="scroll-x edgefade">
        <table className="rectable" aria-label="Properties in this holding" style={{ minWidth: '44rem' }}>
          <thead>
            <tr>
              <th className="selcol">
                <SelectAllBox total={holding.members.length} picked={sel.picked.length}
                              noun={['property', 'properties']} onToggle={sel.toggleAll} />
              </th>
              <th>Property</th>
              <th>Held by</th>
              <th>Khata</th>
              <th>Where</th>
              <th>On the map</th>
              <th className="right">Extent</th>
              <th className="right">Market estimate</th>
              <th className="right">Documents</th>
            </tr>
          </thead>
          <tbody>
            {paged.shown.map((m) => (
              <tr key={m.id} className={sel.selected.has(m.id) ? 'selected' : undefined}>
                <SelectCell checked={sel.selected.has(m.id)} label={`Select ${m.title}`}
                            onToggle={() => sel.toggle(m.id)} />
                <td>
                  <Link to={`/properties/${m.recordId}`} className="accent"
                        style={{ textDecoration: 'none' }}>{m.title}</Link>
                  {m.archived && <> <Pill kind="archived">Archived</Pill></>}
                </td>
                <td className={m.groupId ? undefined : 'muted'}><Holder member={m} bare /></td>
                <td className="muted">{m.khataNo || '—'}</td>
                <td className="muted">{m.placeLine || '—'}</td>
                <td className="muted">{groundWord(m)}</td>
                <td className="right num">{extentCell(m)}</td>
                <td className="right num">{inrOr(m.marketValue)}</td>
                <td className="right num">{m.paperCount}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={6}>
                {sel.picked.length > 0
                  ? `${plural(sel.picked.length, 'property', 'properties')} selected`
                  : `Total · ${plural(holding.members.length, 'property', 'properties')}`}
              </th>
              <td className="right num">{extentTotal(sumRows)}</td>
              <td className="right num">{inrOr(sumRows.reduce((n, m) => n + m.marketValue, 0))}</td>
              <td className="right num">{sumRows.reduce((n, m) => n + m.paperCount, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <TablePager {...paged} onSize={paged.setSize} label="Properties pages" />
      <SelectionBar count={sel.picked.length} noun={['property', 'properties']}
                    label="Act on the selected properties" onClear={sel.clear}>
        <button type="button" className="btn sm" onClick={() => exportCsv(sel.picked)}>
          <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
        </button>
      </SelectionBar>

      {short.length > 0 && (
        <p className="note">
          No boundary saved: {short.map((m) => m.title).join(', ')}.
        </p>
      )}
    </>
  );
}

export default Holding;
