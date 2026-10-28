/**
 * The one table of properties: Properties' List view, and a family or group's
 * Properties tab (founder, 08/10/2026: "we should be having one pattern").
 *
 * Both screens draw THIS component over the same `properties` query, so the
 * columns, the words in them, the sort and what a row does cannot drift apart.
 * A screen chooses only what is genuinely its own: whether rows can be
 * selected (Properties has a bulk bar; a group tab does not), which columns it
 * leaves out (a group's tab drops "Held by", which is that group on every
 * row), and what each row's kebab offers.
 *
 * A row opens its property. The name is the link — the one a keyboard and a
 * screen reader reach — and a click anywhere else on the row that is not
 * itself a control lands in the same place.
 *
 * It reads as a land register (founder, 11/10/2026): which land (the
 * government's LP number and Pattadar's own ID), what it is, whose name it is
 * in, where, who holds and manages it, its standing, size, value and price,
 * its deed, and its trail — added, last changed, by whom. Each cell is the
 * fact over what qualifies it; nothing unrecorded is guessed — it is "—".
 */
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LocationOffOutlined from '@mui/icons-material/LocationOffOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import PolylineOutlined from '@mui/icons-material/PolylineOutlined';
import PersonAddOutlined from '@mui/icons-material/PersonAddOutlined';

import { OWN_NAME } from './api';
import type { RecordCard } from './api';
import { GROUP_ACTION_WORD, wordFor } from './groupsView';
import { hasBoundaryRing, isLocated, pairRing } from './portfolioGeo';
import type { MenuItem } from './ui';
import type { SortState } from './ui';
import {
  Card, Menu, Pill, SelectAllBox, TablePager, Th, classWord, ddmmyyyy, extentText, inrOr, istDay, plural,
  sortBy, statusWord, usePaged,
} from './ui';

// ── Units and sorting ──────────────────────────────────────────────────

// Extents live in three units; sorting and every acre total need them on
// common ground.
const SQYD: Record<string, number> = { ac: 4840, 'sq.yd': 1, 'sq.ft': 1 / 9 };
/** The spellings the API accepts for each (web360.py `_UNIT_ALIASES`), and
 *  "sft", so a unit written loosely still adds up. */
const UNIT: Record<string, string> = {
  acre: 'ac', acres: 'ac', sqyd: 'sq.yd', 'sq yd': 'sq.yd', 'sq.yds': 'sq.yd', yd: 'sq.yd',
  sqft: 'sq.ft', 'sq ft': 'sq.ft', ft: 'sq.ft', sft: 'sq.ft',
};
/** In acres. A unit it cannot convert counts as nothing, not as square yards:
 *  "4 acres" read as 4 sq.yd made a 6-acre total read 0.30 ac. */
export const inAcres = (r: Pick<RecordCard, 'extent' | 'extentUnit'>) => {
  const unit = (r.extentUnit ?? '').trim().toLowerCase();
  return (r.extent * (SQYD[UNIT[unit] ?? unit] ?? 0)) / 4840;
};

/** "3.20 ac + 180 sq.yd": each unit summed as entered, largest unit first.
 *  Not converted to acres — a footer under a column of entered figures should
 *  add up to what the owner can check by eye. */
export function extentTotal(rows: readonly Pick<RecordCard, 'extent' | 'extentUnit'>[]): string {
  const by = new Map<string, number>();
  for (const r of rows) if (r.extent > 0) by.set(r.extentUnit, (by.get(r.extentUnit) ?? 0) + r.extent);
  return [...by].sort(([a], [b]) => (SQYD[b] ?? 1) - (SQYD[a] ?? 1))
    .map(([u, n]) => extentText({ extent: n, extentUnit: u })).join(' + ') || '—';
}

export type SortKey = 'title' | 'type' | 'owner' | 'where' | 'holder' | 'holding' | 'managed' | 'status'
  | 'extent' | 'worth' | 'deed' | 'activity';
export type Sort = SortState<SortKey>;

/** What the Survey No / LP column names a record by: its own name, which for
 *  a parcel IS its LP ("Sy 214/2") — the one name every screen uses for it. */
export const lpOf = (r: RecordCard) => r.title;

/** Who looks after it: the first caretaker or agent named on its People tab,
 *  else the owner themself — unless they only watch it, and look after nothing. */
export const managerOf = (r: RecordCard) => r.managerLine || (r.stake === 'watch' ? '' : 'You');

/** The audit trail's action keys, in the words Activity uses. */
const RECORD_ACTION_WORD: Record<string, string> = {
  ...GROUP_ACTION_WORD,
  'record.corrected': 'Details corrected', add_parcel: 'Parcel added',
  set_parcel_field: 'Land detail changed', update_parcel_geo: 'Location set',
  update_property_geo: 'Location set', set_pin: 'Location set', set_boundary: 'Boundary drawn',
  add_purchase: 'Purchase recorded', delete_purchase: 'Purchase removed', add_expense: 'Expense added',
  set_stake: 'Stake changed', add_person: 'Person added', archive_record: 'Archived or restored',
  tag_record: 'Tagged', upload_document: 'Document added', link_document: 'Document linked',
  link_documents: 'Documents linked', unlink_documents: 'Document unlinked',
  delete_document: 'Document deleted', create_share_link: 'Shared', revoke_share_link: 'Share revoked',
  set_combined_members: 'Holding changed', create_combined_property: 'Added to a holding',
};
export const actionWord = (a: string) => (a ? wordFor(RECORD_ACTION_WORD, a) : '');

/** A property's own page, on the tab a fact lives on ('' = Documents, the
 *  default). A cell that states a fact opens THAT tab, not the front page. */
export const recordTab = (id: string, tab = '') =>
  `/properties/${encodeURIComponent(id)}${tab ? `/${tab}` : ''}`;

/** How the map knows where it is — the same three answers the map view counts
 *  ("1 from a boundary, 2 from a pin"): its surveyed outline, a dropped pin,
 *  or nothing at all, which is said rather than left blank. Each opens the
 *  property's Location tab, where a pin or a boundary is set. */
function WhereMark({ r }: { r: RecordCard }) {
  const ring = pairRing(r.ring);
  const [Glyph, say, cls] = hasBoundaryRing(ring)
    ? [PolylineOutlined, 'Boundary on the map', 'on']
    : isLocated({ ...r, ring })
      ? [PlaceOutlined, 'Pinned on the map', 'on']
      : [LocationOffOutlined, 'Not on the map yet', 'off'];
  return (
    <Link to={recordTab(r.id, 'location')} className={`wheremark ${cls}`}
          aria-label={`${say} — open its location`} title={say}>
      <Glyph sx={{ fontSize: 16 }} aria-hidden />
    </Link>
  );
}

export const SORT_GET: Record<SortKey, (r: RecordCard) => string | number> = {
  // Survey numbers sort as numbers do: "9" before "10/2".
  title: (r) => lpOf(r).toLowerCase().replace(/\d+/g, (d) => d.padStart(8, '0')),
  type: (r) => classWord(r.classification || r.kind).toLowerCase(),
  owner: (r) => r.ownerName.toLowerCase(),
  where: (r) => r.placeLine.toLowerCase(),
  holder: (r) => (r.holderLabel || OWN_NAME).toLowerCase(),
  // Properties in no holding sort after the named ones, not before "A".
  holding: (r) => (r.holdingName ? r.holdingName.toLowerCase() : '￿'),
  managed: (r) => managerOf(r).toLowerCase() || '￿',
  status: (r) => r.status,
  extent: (r) => r.extent * (SQYD[r.extentUnit] ?? 1),
  worth: (r) => r.marketValue,
  deed: (r) => r.regDate || r.deedLine || '￿',
  // ISO strings order as time does; the never-touched last.
  activity: (r) => r.lastActivityAt || r.createdAt || '',
};

/** `rows` in `sort`'s order, or as they came when there is no sort. */
export const sortRows = <R extends RecordCard>(rows: readonly R[], sort: Sort): R[] =>
  sortBy(rows, sort, SORT_GET);

// ── One property's kebab ───────────────────────────────────────────────

export type RowActions = {
  onEdit: (rec: RecordCard) => void;
  onOrder: (rec: RecordCard) => void;
  onShare: (rec: RecordCard) => void;
  /** Left out where archiving is not this screen's business. */
  onArchive?: (rec: RecordCard) => void;
  /** Left out where deleting is not this screen's business. */
  onDelete?: (rec: RecordCard) => void;
};

const ico = (El: typeof EditOutlined) => <El sx={{ fontSize: 17 }} />;

/** What one property's kebab offers.
 *
 *  Everything here acts on exactly this property and goes somewhere real:
 *  Order lands on its own order screen, Share opens the share panel on its
 *  papers. The rules group them — change it / hand it on / put it away — and
 *  Archive is worded for the state the property is actually in.
 *
 *  There is no "Open" here: the name is a link and the row is its click
 *  target. A screen that leads its kebab with something else of its own (a
 *  group's "Take out of this group") puts Open first itself. */
export function recMenu(rec: RecordCard, a: RowActions): MenuItem[] {
  return [
    { label: 'Edit details', icon: ico(EditOutlined), onClick: () => a.onEdit(rec) },
    { label: 'Order a service', icon: ico(HandshakeOutlined), onClick: () => a.onOrder(rec) },
    { label: 'Share securely', icon: ico(PersonAddOutlined), onClick: () => a.onShare(rec), rule: true },
    ...(a.onArchive ? [{
      label: rec.status === 'archived' ? 'Unarchive' : 'Archive',
      icon: ico(Inventory2Outlined),
      onClick: () => a.onArchive!(rec),
      rule: true,
    }] : []),
    ...(a.onDelete ? [{
      label: 'Delete this property', icon: ico(DeleteOutlined), onClick: () => a.onDelete!(rec), danger: true,
    }] : []),
  ];
}

// ── The table ──────────────────────────────────────────────────────────

/** A click that landed on a control inside the row is that control's.
 *  The row menu is portalled, but React still bubbles its clicks up to the
 *  <tr>; its header and padding sit outside [role=menu], so `.menu-list`
 *  claims the whole popover. The select cell is the checkbox's target too:
 *  a near miss on the tick box toggles it rather than leaving the page. */
const onControl = (target: EventTarget | null) =>
  target instanceof Element
  && !!target.closest('a, button, input, select, textarea, label, td.selcol, .menu-list, .menu, [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="dialog"]');

export function PropertyTable({
  rows, sort, setSort, menu, selection, hideHolder = false, label, resetKey = '', style,
}: {
  /** Already filtered, searched and sorted by the screen. */
  rows: readonly RecordCard[];
  sort: Sort;
  setSort: (s: Sort) => void;
  /** The row's kebab. */
  menu: (r: RecordCard) => MenuItem[];
  /** Properties' select boxes; a screen with no bulk bar leaves them out. */
  selection?: {
    selected: ReadonlySet<string>;
    onSelect: (id: string) => void;
    onSelectAll: () => void;
  };
  /** Drop "Held by" where it would say the same group on every row. */
  hideHolder?: boolean;
  /** The table's accessible name. */
  label: string;
  /** Whatever narrows `rows` (filter, search): a change goes back to page 1. */
  resetKey?: string;
  style?: CSSProperties;
}) {
  const nav = useNavigate();
  const paged = usePaged(rows, {
    resetKey: `${sort?.key ?? ''}${sort?.dir ?? ''}|${resetKey}`, storeKey: 'pattadar.table.properties',
  });
  // The footer sums the selection when there is one (as a spreadsheet's status
  // bar does), else every row the filter lets through — not just this page.
  const picked = selection ? rows.filter((r) => selection.selected.has(r.id)) : [];
  const agg = picked.length > 0 ? picked : rows;
  const worth = agg.reduce((n, r) => n + r.marketValue, 0);
  const open = (e: ReactMouseEvent, id: string) => {
    if (e.defaultPrevented || onControl(e.target)) return;
    // Selecting a name to copy it is not a request to leave the page.
    if ((window.getSelection()?.toString() ?? '').length > 0) return;
    nav(`/properties/${encodeURIComponent(id)}`);
  };

  return (
    <>
    <Card flush className="scroll-x edgefade" style={style}>
      <table className="rectable register" aria-label={label}
             style={{ minWidth: hideHolder ? '98rem' : '106rem' }}>
        <thead>
          <tr>
            {selection && (
              <th className="selcol">
                <SelectAllBox total={rows.length} picked={picked.length}
                              noun={['property', 'properties']} onToggle={selection.onSelectAll} />
              </th>
            )}
            <Th k="title" label="Survey No / LP" className="stick" sort={sort} setSort={setSort} />
            <Th k="type" label="Type" sort={sort} setSort={setSort} />
            <Th k="owner" label="Owner" sort={sort} setSort={setSort} />
            <Th k="where" label="Where" sort={sort} setSort={setSort} />
            {!hideHolder && <Th k="holder" label="Held by" sort={sort} setSort={setSort} />}
            <Th k="holding" label="Holding" sort={sort} setSort={setSort} />
            <Th k="managed" label="Managed by" sort={sort} setSort={setSort} />
            <Th k="status" label="Status" sort={sort} setSort={setSort} />
            <Th k="extent" label="Extent" right sort={sort} setSort={setSort} />
            <Th k="worth" label="Market estimate" right sort={sort} setSort={setSort} />
            <Th k="deed" label="Title deed" sort={sort} setSort={setSort} />
            <Th k="activity" label="Last activity" sort={sort} setSort={setSort} />
            <th className="menucol" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {paged.shown.map((r) => {
            const on = !!selection?.selected.has(r.id);
            return (
              <tr key={r.id} className={on ? 'openrow selected' : 'openrow'} onClick={(e) => open(e, r.id)}>
                {selection && (
                  <td className="selcol"
                      onClick={(e) => {
                        // The box's own click already toggled it via onChange.
                        if (e.target instanceof HTMLInputElement) return;
                        selection.onSelect(r.id);
                      }}>
                    <input type="checkbox" checked={on}
                           aria-label={`Select ${r.title}`}
                           onChange={() => selection.onSelect(r.id)} />
                  </td>
                )}
                <td className="stick">
                  <Link to={recordTab(r.id)} className="accent"
                        style={{ textDecoration: 'none' }}>
                    {lpOf(r)}
                  </Link>
                  {/* Two ids (founder, 11/10/2026): the LP is the government's
                      number for the ground; the Pattadar ID is ours, unique
                      to this record anywhere. A named building with an LP
                      states that too. */}
                  <span className="sub mono">
                    {r.kind !== 'parcel' && r.surveyNo ? `LP ${r.surveyNo} · ` : ''}Pattadar ID {r.id}
                  </span>
                </td>
                <td>
                  {classWord(r.classification || r.kind)}
                  {r.khataNo && <span className="sub">Khata {r.khataNo}</span>}
                </td>
                <td>
                  {/* A watched record keeps no owner's name (web360.py), and
                      that is not the same as an unknown owner. */}
                  {r.ownerName || (r.stake === 'watch' ? 'Not yours' : '—')}
                  {r.coOwnerCount > 0 && <span className="muted"> +{r.coOwnerCount}</span>}
                  {r.parentage && <span className="sub">Father/husband: {r.parentage}</span>}
                </td>
                {/* The village first, then mandal and district under it — a
                    land register is read village by village — with how the
                    map knows where it is beside it. */}
                <td>
                  <span className="where">
                    <WhereMark r={r} />
                    <span>
                      {r.placeLine.split(', ')[0] || '—'}
                      {r.placeLine.includes(', ') && (
                        <span className="sub">{r.placeLine.split(', ').slice(1).join(', ')}</span>
                      )}
                    </span>
                  </span>
                </td>
                {/* WHO, then WHICH (decision memo 06/10/2026). The holder is
                    always said — "In your own name" is a holder too — and the
                    holding is a dash when there is none. */}
                {!hideHolder && <td className="muted">{r.holderLabel || OWN_NAME}</td>}
                <td className="muted">
                  {r.holdingId
                    ? <Link to={`/holdings/${encodeURIComponent(r.holdingId)}`}>{r.holdingName}</Link>
                    : '—'}
                </td>
                <td>
                  {r.managerLine
                    ? <Link className="celllink" to={recordTab(r.id, 'people')}>{r.managerLine}</Link>
                    : managerOf(r) || '—'}
                  {r.managerCount > 1 && <span className="muted"> +{r.managerCount - 1}</span>}
                  <span className="sub">Your stake: {statusWord(r.stake) || 'Owned'}</span>
                </td>
                {/* No `!== 'owned'` guard — a column with a blank cell on every
                    owned row looks broken. The capsule is dropped only when
                    there is no word at all to put in it. Under it, the legal
                    standing a buyer's lawyer asks about first. */}
                <td>
                  {statusWord(r.status) ? <Pill kind={r.status}>{statusWord(r.status)}</Pill> : null}
                  {(r.litigation || r.mutationStatus || r.ecStatus) && (
                    <span className="sub">
                      {[r.litigation ? 'In court' : '',
                        r.mutationStatus ? `Mutation: ${r.mutationStatus}` : '',
                        r.ecStatus ? `EC: ${r.ecStatus}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </td>
                <td className="right num">
                  {extentText(r)}
                  {r.extentDetail && <span className="sub">{r.extentDetail}</span>}
                </td>
                <td className="right num">
                  {inrOr(r.marketValue)}
                  {r.purchasePrice > 0 && (
                    <Link className="celllink sub" to={recordTab(r.id, 'money')}>
                      Paid {inrOr(r.purchasePrice)}{r.purchaseDate ? ` · ${istDay(r.purchaseDate)}` : ''}
                    </Link>
                  )}
                </td>
                <td>
                  {r.deedLine ? <Link className="celllink" to={recordTab(r.id)}>{r.deedLine}</Link> : '—'}
                  {r.regDate && <span className="sub">Registered {ddmmyyyy(r.regDate)}</span>}
                </td>
                <td className="num">
                  {r.lastActivityAt
                    ? <Link className="celllink" to={recordTab(r.id, 'activity')}>
                        {istDay(r.lastActivityAt)} · {r.lastActivityBy}
                      </Link>
                    : '—'}
                  {(r.lastActivityAction || r.createdAt) && (
                    <span className="sub">
                      {[actionWord(r.lastActivityAction),
                        r.createdAt ? `Added ${istDay(r.createdAt)}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </td>
                <td className="menucol">
                  <Menu label={`Actions for ${r.title}`} header={r.title} items={menu(r)} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            {selection && <td className="selcol" />}
            {/* Everything before Extent: LP, Type, Owner, Where, [Held by],
                Holding, Managed by, Status. */}
            <th scope="row" colSpan={hideHolder ? 7 : 8}>
              {picked.length > 0
                ? `${plural(picked.length, 'property', 'properties')} selected`
                : `Total · ${plural(rows.length, 'property', 'properties')}`}
            </th>
            <td className="right num">{extentTotal(agg)}</td>
            <td className="right num">{inrOr(worth)}</td>
            <td />
            <td />
            <td className="menucol" />
          </tr>
        </tfoot>
      </table>
    </Card>
    <TablePager {...paged} onSize={paged.setSize} label={`${label} pages`} />
    </>
  );
}
