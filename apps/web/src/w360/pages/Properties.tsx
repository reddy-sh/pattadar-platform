/** W02 — one faceted list for everything you hold. A khata and a flat are both
 *  "a thing I own", so there is one list and one set of facets, not five
 *  dropdowns and two tabs.
 *
 *  The facets and the grid come out of a single server query, so the facet
 *  counts can never claim "For sale 2" while the grid renders three.
 *
 *  Three things about the shape of this screen were reported and are fixed
 *  here:
 *
 *  1. The facets stood in a 14rem rail down the left of every answer, printing
 *     a heading for each group whether or not the server had sent options for
 *     it — which is how "DERIVED" and "YOUR TAGS" came to sit over nothing.
 *     They now open from one `+ Filter` chip, what is on reads back as
 *     removable chips in the same row, and a group with no options is not
 *     drawn at all.
 *
 *  2. The bulk bar sat under the grid at all times, explained itself in a
 *     sentence, and its buttons acted on everything shown when nothing was
 *     picked — so "Order EC ×14" was a standing offer to buy fourteen
 *     certificates. Nothing about acting on many records exists now until
 *     records are selected, and every label counts the selection.
 *
 *  3. A record's own actions had nowhere to live but a three-item kebab. The
 *     kebab now carries the six things that are about ONE record and names
 *     which record it will act on; the selection bar carries the five that
 *     mean something across many. Archive and Delete are in both, because both
 *     readings are legitimate.
 *
 *  Every action on this screen is real. Add and Edit open the drawer, Order
 *  lands on the record's own order screen, Share opens the share panel on its
 *  papers, Export writes the visible list to a CSV, and the archive/delete
 *  paths go through the same confirm dialogs they always did. A search
 *  arriving in the URL from the jump box comes off again at its own chip in
 *  the filter row, beside the facets — it used to have a chip of its own in
 *  the page head because the rail's Clear would not take it. Archived records
 *  leave the list and the sums until the Archived facet brings them back, and
 *  an account whose every record is archived says so rather than claiming to
 *  be empty. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

import {
  useProperties, useArchiveRecords, useDeleteRecords,
  useTagRecords, EMPTY_FILTER, OWN_NAME,
} from '../api';
import type { FacetGroup, PropertyFilter, PropertyList, RecordCard } from '../api';
import { orderHref } from '../orderFlow';
import {
  Chip, Empty, FacetFilter, Failed, Icon, Menu, PageHead, PhotoImg, Pill, SelectionBar, SortCycle, Tag, ViewToggle,
  classWord, coords, ddmmyyyy, downloadCsv, extentText, inr, inrOr, istDay, num, plural, statusWord,
} from '../ui';
import type { HeadActions } from '../ui';
import { Sk, SkPortfolioMap, SkRecordCards, SkRecordTable } from '../skeletons';
import { RecordDrawer, ConfirmDialog, TagDialog } from './PropertyActions';
import { PropertyTable, actionWord, inAcres, managerOf, recMenu, sortRows } from '../PropertyTable';
import type { RowActions, Sort, SortKey } from '../PropertyTable';
import { SetHolderDialog } from '../SetHolderDialog';
import { CombineDialog, HoldingsGoToo } from './HoldingActions';
import { PortfolioCanvas } from '../PortfolioCanvasLazy';
import type { PortfolioCanvasHandle, PortfolioPin } from '../PortfolioCanvasLazy';
import { hasBoundaryRing, isLocated, pairRing } from '../portfolioGeo';
import { MapThumb } from '../MapThumb';

// The status words come from `statusWord` in ../ui. This screen used to keep
// its own copy of the map, which is how the three copies in the app drifted
// apart; the shared one is also total, so a status the server starts sending
// tomorrow is humanised rather than printed as an empty capsule.

const fmtExtent = (r: RecordCard) => extentText(r);

/** One capsule, not three. A card used to wear its status, its stake AND its
 *  classification, which on an ordinary owned parcel reads "Owned / Owned /
 *  agri" — three capsules to say one unremarkable thing.
 *
 *  What earns a capsule is whatever is NOT the ordinary case: a status that is
 *  not plain ownership, or failing that a stake that is not plain ownership.
 *  A record that is simply owned outright wears nothing, because "Owned" on
 *  nine cards out of ten is a word that has stopped carrying information — and
 *  it is the quiet majority against which "Disputed" has to stand out. The
 *  kind is already drawn: it is the illustration under the band and a facet in
 *  the filter, so it does not need a word here too. */
function badgeOf(rec: RecordCard): { kind: string; word: string } | null {
  if (rec.status && rec.status !== 'owned') return { kind: rec.status, word: statusWord(rec.status) };
  if (rec.stake && rec.stake !== 'owned') return { kind: rec.stake, word: statusWord(rec.stake) };
  return null;
}

type CardActions = RowActions & {
  selected: boolean;
  onSelect: (id: string) => void;
};

// What one record's kebab offers lives with the table (PropertyTable.tsx
// recMenu), so the grid's cards, the List view and a group's Properties tab
// offer the same things in the same words.

function SelectBox({ rec, a }: { rec: RecordCard; a: CardActions }) {
  // A sibling of the card's link now rather than a child of it, so there is no
  // anchor under this click to swallow it and nothing left to stop
  // propagating.
  return (
    <span className="sel">
      <input type="checkbox" checked={a.selected} aria-label={`Select ${rec.title}`}
             onChange={() => a.onSelect(rec.id)} />
    </span>
  );
}

/** What a card is able to say about where its land is, in the words the map
 *  view's own result rows already use for the same fact.
 *
 *  It belongs on the tile because it is the difference between a record and a
 *  record somebody has actually been to. A surveyed boundary is the strongest
 *  thing this system holds; a dropped pin is a village, not a parcel; and
 *  nothing at all is a job to do, which the card should say out loud rather
 *  than filling the space with a drawing of a field. */
function groundWord(geo: { ring: Array<[number, number]>; lat: number; lon: number }): string {
  if (hasBoundaryRing(geo.ring)) return 'Boundary on map';
  return isLocated(geo) ? 'Location pin only' : 'No location yet';
}

/** The line the reference card spends on "Custom cabinetry · Whole house fan ·
 *  Quartz countertops": everything filed against this land, most useful first,
 *  truncating at the right.
 *
 *  Zero counts are dropped rather than printed. "0 papers · 0 photos" is four
 *  words to say nothing is filed, and it reads as a system that lost them; the
 *  sentence for that case is one sentence and it names the remedy. The deed
 *  comes last because it is a lookup key — the thing a bank asks for — where
 *  the counts are a judgement about whether this record is finished. */
function digestOf(rec: RecordCard): { text: string; empty: boolean } {
  const filed = [
    rec.paperCount ? plural(rec.paperCount, 'document') : '',
    rec.photoCount ? plural(rec.photoCount, 'photo') : '',
    rec.featureCount ? plural(rec.featureCount, 'feature') : '',
    rec.deedLine,
  ].filter(Boolean);
  // `empty` rides along rather than being recovered by comparing the text back
  // against the sentence: one of them would get reworded and the other would
  // not, and the quiet styling would silently attach to the wrong line.
  return filed.length > 0
    ? { text: filed.join(' · '), empty: false }
    : { text: 'Nothing added yet', empty: true };
}

/** WHO holds it and WHICH holding it is part of, as the card's small detail
 *  labels (decision memo 06/10/2026, § 4.4).
 *
 *  Only what is NOT the ordinary case is said, for the reason `badgeOf` gives:
 *  on an account without families or groups every card would otherwise read
 *  "In your own name", a word that has stopped carrying information by the
 *  third card. The List view's "Held by" column says it in full, because a
 *  blank cell in a column reads as broken. "Held" is the group's verb only; a
 *  holding is something a property is part of. */
function standingOf(rec: RecordCard): string {
  return [
    rec.groupId ? `Held by ${rec.holderLabel || rec.groupName}` : '',
    rec.holdingId ? `Part of ${rec.holdingName}` : '',
  ].filter(Boolean).join(' · ');
}

function Card({ rec, a }: { rec: RecordCard; a: CardActions }) {
  const art = rec.classification === 'flat' || rec.classification === 'open_plot'
    ? 'built' : rec.classification === 'shop' ? 'shop' : '';

  /** What a card shows of itself, in order (Reddy, 11/10/2026): a saved
   *  boundary on the map, the photograph the owner took, a pin-only map, a
   *  paper the owner filed, and — when it knows none of them — the
   *  illustration for what kind of thing it is.
   *
   *  A drawn boundary wins outright: it is the one picture that is provably
   *  THIS parcel, where a "photo" is often a screenshot of a record. A pin is
   *  only a village, so the owner's photo beats it. The paper comes next
   *  for the same reason the map beats the drawing: a scanned sketch or
   *  passbook page is this land's own paper, and the illustration is the same
   *  illustration on every agricultural parcel in the account — decoration,
   *  not information. `paperFileRef` is only ever an image; the storage gateway
   *  can downscale a photograph and cannot rasterise a PDF page, so a record
   *  whose papers are all PDFs keeps the drawing.
   *
   *  The chain is nested rather than sequential — whatever is next is the
   *  photo's `fallback` while the authenticated read is pending or no usable
   *  storage reference exists. A real read failure is different: PhotoImg names
   *  it and offers a retry instead of pretending the filed photo is absent. The
   *  icon sits underneath the whole stack, so no arrangement of missing data
   *  leaves a card blank. */
  const geo = { ring: pairRing(rec.ring), lat: rec.lat, lon: rec.lon };
  const thumb = isLocated(geo)
    ? <MapThumb {...geo} title={rec.title} />
    : rec.paperFileRef
      // `alt=""`, like the cover photograph: at 6.5rem a scan is a recognition
      // cue and not a readable document, and the digest line below already
      // states in words that papers are filed here. `fallback={null}` because
      // the illustration is already in the markup underneath.
      ? <PhotoImg className="cardpaper" fileRef={rec.paperFileRef} thumb={512}
                  alt="" fallback={null} />
      : null;
  const badge = badgeOf(rec);
  const digest = digestOf(rec);
  // `coords` is already empty for a record with no fix, so there is nothing to
  // guard: an unlocated parcel prints no coordinate rather than "0.0000° N".
  const where = coords(rec.lat, rec.lon);
  const standing = standingOf(rec);

  /** The card is a div, and only the title is a link. It used to be one <a>
   *  wrapped around the whole card with the select box and the kebab nested
   *  inside it — interactive content inside an anchor, which HTML forbids and
   *  which a screen reader reads out as a single link named "Select Sy 214/2,
   *  Actions for Sy 214/2, Sy 214/2, agri, …". The anchor now carries the
   *  record's name and nothing else, and the two controls are its siblings with
   *  their own roles. The whole card is still one click target: a stretched
   *  span inside the anchor covers it, which is what `position: relative` here
   *  is for. */
  return (
    <div className={`rec ${a.selected ? 'selected' : ''}`} style={{ position: 'relative' }}>
      <div className={`art ${art}`}>
        <Icon name={rec.classification} size={46} />
        {rec.coverFileRef && !hasBoundaryRing(geo.ring)
          ? (
            <PhotoImg className="cardphoto" fileRef={rec.coverFileRef} alt=""
                      thumb={512} fallback={thumb} />
          )
          : thumb}
        {/* The exceptional state rides on the band, not beside the title.
            Two reasons, and the reference card the redesign was measured
            against does the same thing: this is the first place the eye lands,
            and a title row that has to share its width wraps "Flat 4B, Sai
            Residency" onto two lines to make room for a capsule that is absent
            on nine cards out of ten.

            Litigation is its own capsule rather than folded into `status`,
            because land can be in court and still plainly owned — the two facts
            are not alternatives and a reader who sees only "Owned" on a parcel
            with a case against it has been told the wrong thing. */}
        <span className="badges">
          <SelectBox rec={rec} a={a} />
          {badge && <Pill kind={badge.kind}>{badge.word}</Pill>}
          {rec.litigation && <Pill kind="litigation">In court</Pill>}
        </span>
        {/* `.more` is what pins the kebab to the band's top-right corner AND
            lifts it over the photo scrim and over the stretched span that makes
            the whole card one click target. Without the class the menu is a
            static div in the middle of the band with nothing above that span,
            and every action on every card is unreachable — which is what
            happened the moment the wrapper that used to carry those two rules
            was removed. */}
        <Menu className="more" label={`Actions for ${rec.title}`} header={rec.title}
              items={recMenu(rec, a)} />
        {/* What the picture above is worth as evidence, and the fix it was
            drawn from. The two belong together and they belong at the bottom:
            the coordinate shared the top-right corner with the kebab, which
            left the state capsules nowhere to go at the narrowest track, and
            "15.6657° N" on its own never said whether it came from a survey or
            from somebody standing at the gate. The coordinate is still only
            printed when the record knows one — "0.0000° N" on an unlocated
            parcel would be a reading, not a blank. */}
        <span className="bandfoot">
          {[groundWord(geo), where].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="meat">
        {/* The title owns its row now that the status capsule has moved onto the
            band, so a built property's real name is not squeezed into half a
            card. */}
        <h3>
          <Link className="recgo" to={`/properties/${rec.id}`}
                style={{ color: 'inherit', textDecoration: 'none' }}>
            {rec.title}
            {/* The card's click target, stretched over `.rec` from inside the
                anchor. It paints under the select box and the kebab, which
                w360.css already lifts to z-index 1 to clear the art's scrim,
                so both of them stay clickable over the top of it. */}
            <span aria-hidden style={{ position: 'absolute', inset: 0 }} />
          </Link>
        </h3>
        {/* Not every record names an owner; an empty line left a gap where
            the card promised a name. */}
        {rec.ownerName && (
          <p className="note" style={{ marginTop: '0.25rem' }}>{rec.ownerName}</p>
        )}
        {/* Village, mandal AND district. It was village and mandal, while the
            record's own header said all three — and Andhra Pradesh holds more
            than one Katragunta, so the short form named a place and not a
            place on earth. `_place_line` drops a repeated segment, so
            Markapur/Markapur/Prakasam still reads as two names. */}
        <p className="note row tight" style={{ marginTop: '0.1875rem' }}>
          <PlaceOutlined sx={{ fontSize: 13 }} aria-hidden /> {rec.placeLine}
        </p>
        {standing && (
          <p className="note" data-testid="card-standing" title={standing}
             style={{
               margin: '0.1875rem 0 0', fontSize: '0.6875rem', lineHeight: 1.35,
               whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
             }}>
            {standing}
          </p>
        )}
        <hr className="hr" style={{ margin: '0.625rem 0' }} />
        {/* One line, always: the extent reads big and the money stays pinned
            right. Wrapping here made a card look like it held two figures.

            The alternate unit used to fill the middle of this row and truncate
            into it. It has its own line below now, as the full reading rather
            than one converted figure — the acre is what the title deed says,
            and guntas, cents and square yards are what the village office, the
            neighbour and the buyer each say instead. Squeezed onto this row
            there was only ever room for one of them. */}
        <div className="row" style={{ flexWrap: 'nowrap', gap: '0.5rem', alignItems: 'baseline' }}>
          <span className="figure" style={{ flex: 'none' }}>{fmtExtent(rec)}</span>
          {/* A dash, not "₹0". A record nobody has valued has no figure to
              print, and printing zero claims somebody looked and the answer
              was nothing. */}
          <span className="num" style={{ flex: 'none', marginLeft: 'auto', fontSize: '0.875rem' }}>
            {inrOr(rec.marketValue)}
          </span>
        </div>
        {/* The same extent in the units it is argued in. The full string is the
            title as well, because this line truncates and the reading it cuts
            off is the one somebody is standing in a field trying to check. */}
        {rec.extentDetail && (
          <p className="reading" title={rec.extentDetail}>{rec.extentDetail}</p>
        )}
        {/* Everything filed against this land, and the registrar's name for it.
            Truncates rather than wraps, so a card's height does not depend on
            how much work has been done to it — and the full line is the title
            for the same reason the reading's is. */}
        <p className={digest.empty ? 'digest nil' : 'digest'} title={digest.text}>
          {digest.text}
        </p>
        {/* The tag row holds its height whether or not there are tags, so a
            grid of cards does not jog by twenty pixels per row. */}
        <div className="row tight" style={{ marginTop: '0.5rem', minHeight: '1.25rem' }}>
          {rec.khataNo && <Chip>● Khata {rec.khataNo}</Chip>}
          {rec.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
        </div>
      </div>
    </div>
  );
}

/** What the sort chip cycles through.
 *
 *  Four orderings and the one the server sent. "Recently changed" sorts by
 *  the newest audited change (`lastActivityAt`, else when it was added). */
const SORT_PRESETS: { label: string; sort: Sort }[] = [
  { label: 'Order added', sort: null },
  { label: 'Recently changed', sort: { key: 'activity', dir: -1 } },
  { label: 'Survey No / LP', sort: { key: 'title', dir: 1 } },
  { label: 'Largest extent', sort: { key: 'extent', dir: -1 } },
  { label: 'Highest market estimate', sort: { key: 'worth', dir: -1 } },
];

const SORT_WORD: Record<SortKey, string> = {
  title: 'Survey No / LP', type: 'Type', owner: 'Owner', where: 'Where', holder: 'Held by',
  holding: 'Holding', managed: 'Managed by', status: 'Status', extent: 'Extent',
  worth: 'Market estimate', deed: 'Title deed', activity: 'Last activity',
};

/** The chip and the table's column headings write the same `sort`, so the chip
 *  has to be able to say what a column click did as well as what it set
 *  itself. */
function sortLabel(s: Sort): string {
  if (!s) return 'Order added';
  const preset = SORT_PRESETS.find((p) => p.sort && p.sort.key === s.key && p.sort.dir === s.dir);
  return preset ? preset.label : `${SORT_WORD[s.key]} ${s.dir === 1 ? '↑' : '↓'}`;
}

/** Every facet arrives named, so this screen keeps no list of the words.
 *
 *  There used to be one — a total map of group key to heading, plus a second
 *  list naming which groups held free text rather than an enumeration. Both
 *  restated what the server already sends on every group and option, and both
 *  had to be edited before a new facet could appear properly: an owner facet
 *  added on the server drew a heading from this file or none at all, and its
 *  names were put through statusWord, which capitalises what it does not
 *  recognise and so quietly retitles a person.
 *
 *  What the client genuinely has to do is REMEMBER. The server sends an option
 *  only while some record still answers to it, so the moment the last archived
 *  record is unarchived the Archived option stops being sent — while
 *  `?status=archived` is still in the URL and still filtering (see `chips`
 *  below for why that matters). The chip for it must keep its words. So every
 *  name the server has used is kept, and nothing it has never sent falls back
 *  further than the raw key, which is at least readable and removable. */
function useFacetWords(groups: FacetGroup[]) {
  const seen = useRef<{ group: Record<string, string>; option: Record<string, string> }>(
    { group: {}, option: {} });
  useEffect(() => {
    for (const g of groups) {
      if (g.label) seen.current.group[g.key] = g.label;
      for (const o of g.options) {
        if (o.label) seen.current.option[`${g.key}:${o.key}`] = o.label;
      }
    }
  }, [groups]);
  return {
    groupWord: (key: string, g?: Pick<FacetGroup, 'label'>) =>
      g?.label || seen.current.group[key] || key,
    optionWord: (key: string, value: string) =>
      seen.current.option[`${key}:${value}`] || statusWord(value),
  };
}

/** How many cards the grid draws before it offers to draw more. */
const PAGE = 24;

export function Properties() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  /** The reported defect was three unlabelled icons: nothing on the screen
   *  said that a map of the whole portfolio existed. The segments carry their
   *  words now. The words are the names they already had — a filtered list is
   *  a thing people send each other, and `?view=list` in a link somebody saved
   *  last week has to keep opening the same view. */
  const view = params.get('view') === 'map' ? 'map'
    : params.get('view') === 'table' ? 'table' : 'grid';
  const setView = (nextView: 'grid' | 'table' | 'map') => {
    const next = new URLSearchParams(params);
    next.set('view', nextView);
    setParams(next);
  };
  const [satellite, setSatellite] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const mapRef = useRef<PortfolioCanvasHandle>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [drawer, setDrawer] = useState<{ card: RecordCard | null; job?: string } | null>(null);
  const [confirm, setConfirm] =
    useState<{ kind: 'delete' | 'archive' | 'unarchive'; ids: string[] } | null>(null);
  const [tagIds, setTagIds] = useState<string[] | null>(null);
  /** The records the Combine dialog is open over. Ids rather than cards, like
   *  `tagIds`, so the dialog always reads the current answer rather than a copy
   *  of the rows as they were when the bar was clicked. */
  const [combineIds, setCombineIds] = useState<string[] | null>(null);
  /** The properties "Set holder" is open over — ids, for the same reason. */
  const [holderIds, setHolderIds] = useState<string[] | null>(null);
  const [err, setErr] = useState('');

  const del = useDeleteRecords(false);
  const arch = useArchiveRecords(false);
  const tagRecs = useTagRecords(false);
  // shortcut: the unscoped (Andhra Pradesh) EC price; the server prices each
  // property by its own place, so a district-priced revision can differ. Read
  // per record if district pricing is ever published.

  // The URL is the filter — a filtered list is a thing you send someone.
  const filter: PropertyFilter = {
    kinds: params.getAll('kind'),
    statuses: params.getAll('status'),
    stakes: params.getAll('stake'),
    villages: params.getAll('village'),
    khatas: params.getAll('khata'),
    owners: params.getAll('owner'),
    tags: params.getAll('tag'),
    // `?group=<id>` is the link Families & Groups sends people here with, so
    // the group's holdings arrive in this screen with all of its filtering,
    // sorting, search, map and bulk actions rather than in a thinner list of
    // their own. Nothing else is needed to honour it: the facet rail, the
    // chips, Clear all and the shareable URL all fall out of the three maps.
    groups: params.getAll('group'),
    holdings: params.getAll('holding'),
  };
  const PARAM: Record<string, string> = {
    kind: 'kind', status: 'status', stake: 'stake',
    village: 'village', khata: 'khata', owner: 'owner',
    tags: 'tag', group: 'group', holding: 'holding',
  };

  /** Which array of `filter` a facet group writes into. The popover's boxes
   *  read their own state from here rather than from the server's
   *  `option.active`: while the next answer is in flight the held one still
   *  says the old thing, and a box that stays unticked for the length of a
   *  round trip after you tick it is an unresponsive control. The counts beside
   *  them stay server-side and simply update when the response lands. */
  const FIELD: Record<string, keyof PropertyFilter> = {
    kind: 'kinds', status: 'statuses', stake: 'stakes',
    village: 'villages', khata: 'khatas', owner: 'owners',
    tags: 'tags', group: 'groups', holding: 'holdings',
  };

  const toggle = (group: string, key: string) => {
    const p = PARAM[group];
    const next = new URLSearchParams(params);
    const have = next.getAll(p);
    next.delete(p);
    (have.includes(key) ? have.filter((v) => v !== key) : [...have, key])
      .forEach((v) => next.append(p, v));
    setParams(next, { replace: true });
  };

  const { data: fresh, isFetching, error } = useProperties(filter);

  /** Ticking a facet changes the query key, and the query behind this screen
   *  keeps no previous answer of its own. Without one, every facet click
   *  unmounted the grid for the length of the round trip: the checkbox
   *  disappeared from under the pointer, and a keyboard user who pressed Space
   *  lost focus to <body> and had to tab in from the top of the page to reach a
   *  second facet. Hold the last good answer here and keep drawing it while the
   *  next one is on its way.
   *
   *  A read that failed drops the held answer deliberately. Stale rows under no
   *  error message would be the screen quietly claiming to know something it no
   *  longer does. */
  const held = useRef<PropertyList | undefined>(undefined);
  if (fresh) held.current = fresh;
  const data = fresh ?? (error ? undefined : held.current);

  // The only state with nothing to draw: nothing held, and no error to explain
  // why. Everything else — a filter change, a refetch after a write — keeps
  // what is already on screen.
  const firstLoad = !data && !error;

  /** While the next answer is in flight the page goes quiet instead of empty.
   *  Nothing is unmounted, so the control under the pointer and the focus ring
   *  on it both survive. */
  const settling = { opacity: isFetching ? 0.6 : 1, transition: 'opacity var(--dur-fast) var(--ease-out)' };

  const active = Object.values(filter).reduce((n, arr) => n + arr.length, 0);

  // A search reaches this screen from the jump box. There is no search input
  // here to empty, so it needs a control of its own; it is a chip in the filter
  // row beside the facets, because it narrows the same list they do.
  const q = (params.get('q') ?? '').trim().toLowerCase();

  const dropQ = () => {
    mainRef.current?.focus();
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
  };

  /** "New holding" on the Holdings list lands here with `?combine=1`, because
   *  a holding is made of records and the records are here. The flag stays in
   *  the URL while the hint shows, so a reload or a shared link keeps it, and
   *  it is not a facet: Clear all leaves it, and dismissing deletes only
   *  `combine`, so the view, the search and every facet survive. */
  const combineHint = params.get('combine') === '1';
  const dropCombine = () => {
    const next = new URLSearchParams(params);
    next.delete('combine');
    setParams(next, { replace: true });
  };

  /** Everything that narrows the list, off at once — which is what the label
   *  says. It used to leave `?q=` on, so "Clear all filters" on a search that
   *  matched nothing left the reader looking at the same empty grid. */
  const clearAll = () => {
    mainRef.current?.focus();
    const next = new URLSearchParams(params);
    Object.values(PARAM).forEach((prm) => next.delete(prm));
    next.delete('q');
    setParams(next, { replace: true });
  };

  /** An account with nothing on the list — as opposed to a filter that matched
   *  nothing, which is a different sentence with a different remedy.
   *
   *  `total` is the count before the facets (web360.py: `total=len(rows)`) but
   *  after archiving, so this is true in two different worlds: a portfolio with
   *  no records in it, and a portfolio whose every record has been archived.
   *  `archivedCount` below is what tells them apart. Either way everything the
   *  screen offers for working through a list — the filter row, three view
   *  shapes, Export, the sort chip — is furniture for rows that are not on it.
   *  Drawn over nothing it reads as an app that failed to load rather than one
   *  waiting for its first record, and it buries the single thing to do. */
  const virgin = !!data && data.total === 0;

  const cards = useMemo(() => {
    const kept = (data?.cards ?? []).filter((c) =>
      !q || `${c.title} ${c.surveyNo} ${c.id} ${c.village} ${c.mandal} ${c.district} ${c.khataNo} ${c.ownerName} ${c.parentage} ${c.managerLine} ${c.docNo} ${c.groupName} ${c.holdingName}`
        .toLowerCase().includes(q));
    return sortRows(kept, sort);
  }, [data, q, sort]);
  const shownCount = q ? cards.length : data?.shown ?? 0;

  /** The portfolio's own totals, in the two figures it is measured in — the
   *  head's summary line (design.md § Page head, "Summary").
   *
   *  Each count is told once: what a filter or search lets through is the
   *  band's "x of y shown", so the summary keeps the totals and does not
   *  shrink with the filter. They are summed from the unfiltered answer —
   *  the same query this screen reads with no facet on, so with nothing
   *  ticked it is the very same cache entry and costs no second request. The
   *  extents are converted to acres before adding because the list mixes ac,
   *  sq.yd and sq.ft and adding those as-is would produce a number in no unit
   *  at all. Either figure is dropped when it is zero rather than printed as
   *  "0.00 ac" or "₹0", both of which claim somebody measured. */
  const whole = useProperties(EMPTY_FILTER);
  const allCards = whole.data?.cards ?? (active === 0 ? data?.cards : undefined);
  const totals = useMemo(() => (allCards ?? []).reduce(
    (acc, r) => ({ ac: acc.ac + inAcres(r), worth: acc.worth + r.marketValue }),
    { ac: 0, worth: 0 }), [allCards]);
  const portfolioLine = allCards ? [
    plural(allCards.length, 'property', 'properties'),
    totals.ac >= 0.005 ? `${num(totals.ac, 2)} ac` : '',
    totals.worth > 0 ? `${inr(totals.worth)} market estimate` : '',
  ].filter(Boolean).join(' · ') : undefined;

  /** Archived records are outside `total` (web360.py: `rows = base` unless the
   *  Archived facet is ticked), so an account whose every record has been
   *  archived reports that it holds nothing at all. The count is already on the
   *  wire — the server appends the Archived option whenever there are archived
   *  rows, whatever the filter says — so the empty states can name where the
   *  records went instead of inviting the owner to add their first one. */
  const archivedCount = (data?.facets ?? []).find((g) => g.key === 'status')
    ?.options.find((o) => o.key === 'archived')?.count ?? 0;

  const groups = data?.facets ?? [];
  const { groupWord, optionWord } = useFacetWords(groups);

  /** Everything currently narrowing the list, as one flat list of chips.
   *
   *  Built from the URL, NOT from the server's option lists. That distinction
   *  is the whole correctness of this row: the server only sends an option
   *  while some record still answers to it, so the moment you unarchive the
   *  last archived record the Archived option stops being sent — while
   *  `?status=archived` is still in the URL, still filtering, and now filtering
   *  to nothing. A chip derived from the options would vanish exactly then,
   *  leaving an empty list, an active filter, and no control anywhere on the
   *  screen that takes it off. The option is only consulted for its LABEL, and
   *  the raw key stands in when it is gone.
   *
   *  The group's word rides on each chip because two groups can offer the same
   *  word — "Owned" is both a status and a stake — and a bare chip saying
   *  "Owned" would not say which one came off when it was dismissed. */
  const facetSelection = Object.fromEntries(
    Object.entries(FIELD).map(([key, field]) => [key, filter[field]]),
  );

  /** The map draws `cards` — the filtered list — and not every record the
   *  account holds. The facets, the search box and the map are then three views
   *  of one answer; a map that ignored the filter beside it would be a fourth
   *  opinion on screen at the same time.
   *
   *  No second query for the geometry. It arrived here first as a join against
   *  `mapRecords`, which meant a whole extra round trip — and four resolvers a
   *  card list has no use for — to learn where records the page had already
   *  loaded actually are. The card carries its own lat/lon/ring now, because
   *  every card draws its own ground. */
  const pins: PortfolioPin[] = useMemo(() => cards.map((c) => ({
    id: c.id,
    title: c.title,
    where: [c.village, c.mandal].filter(Boolean).join(', '),
    status: c.status,
    ring: pairRing(c.ring),
    lat: c.lat,
    lon: c.lon,
  })), [cards]);
  /** The pins by record id, and which of them the map could place. Both are
   *  asked for once per row of the results list beside the map, and that list
   *  re-renders on every pointer move across it — as a scan of `pins` per row
   *  that was the whole portfolio walked for each of its own records. */
  const pinById = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);
  const drawn = useMemo(() => pins.filter(isLocated), [pins]);
  const drawnIds = useMemo(() => new Set(drawn.map((p) => p.id)), [drawn]);
  const surveyed = useMemo(
    () => drawn.filter((p) => p.ring.length >= 3).length, [drawn]);

  // A picked record that the filter has just taken off the map is a panel
  // describing something nobody can see.
  useEffect(() => {
    if (picked && !cards.some((c) => c.id === picked)) setPicked(null);
  }, [cards, picked]);

  /** A different filter shows a different list; carrying a selection across
   *  would let "Archive" reach records no longer on screen. The page count goes
   *  back to the first batch for the same reason — "Load 24 more" on an answer
   *  of six is a button with nothing behind it.
   *
   *  Keyed on what NARROWS the list, not on the whole query string. Keyed on
   *  the whole thing — which is what it used to be — switching Grid to List
   *  threw the selection away, because the view is in the URL too. That was
   *  survivable while the bulk bar stood there permanently; now that the bar is
   *  the selection, it read as the app forgetting what you had picked the
   *  moment you looked at it another way. The records are identical across the
   *  three views, so there is nothing to protect against. */
  const narrowKey = [...Object.values(PARAM).map((prm) => params.getAll(prm).join(',')),
    params.get('q') ?? ''].join('|');
  useEffect(() => { setSelected(new Set()); setLimit(PAGE); }, [narrowKey]);

  // `?new=1` opens the add drawer on arrival, so "Add" elsewhere in the app is
  // one click rather than two — it used to land you on this list with the
  // drawer still shut, which on an empty account is a screen saying "nothing
  // here" in answer to "add something".
  //
  // The parameter is consumed immediately: left in the URL it would reopen the
  // drawer every time the page was reloaded or shared.
  useEffect(() => {
    // `?reading=<job>` is where a notice lands: Add property, filled from a
    // reading that finished after the drawer was closed. Consumed the same way.
    const job = params.get('reading') ?? '';
    if (params.get('new') !== '1' && !job) return;
    setDrawer(job ? { card: null, job } : { card: null });
    const next = new URLSearchParams(params);
    next.delete('new');
    next.delete('reading');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const selShown = cards.filter((c) => selected.has(c.id)).map((c) => c.id);
  const onSelect = useCallback((id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  /** The rows beside the map. Hovering one sets `lit`, which the map reads to
   *  light that record's pin — page state, so every pointer movement across
   *  this list re-rendered the whole screen. No row draws anything from `lit`,
   *  so they are built once per answer and a hover reaches only the map. */
  const results = useMemo(() => cards.map((c) => {
    const pin = pinById.get(c.id)!;
    const located = isLocated(pin);
    return <div className={`pf-result${picked === c.id ? ' on' : ''}`} key={c.id}
                onMouseEnter={() => setLit(c.id)} onMouseLeave={() => setLit(null)}>
      <button type="button" className="pf-result-pick" aria-pressed={picked === c.id}
              onClick={() => {
                if (located) { setPicked(c.id); mapRef.current?.goTo(c.id); }
                else nav(`/properties/${c.id}/location`);
              }}>
        <strong>{c.title}</strong>
        <span className="note">{[c.village, c.mandal].filter(Boolean).join(', ') || 'Place not added'}</span>
        <span className="note">{fmtExtent(c)} · {statusWord(c.status)}</span>
        <span className="note">{located ? (pin.ring.length >= 3 ? 'Boundary on map' : 'Location pin only') : 'Add a location to show on map'}</span>
      </button>
      {/* Selecting from the map list works the selection bar too, so a reader
          who found three parcels on the map can act on them without switching
          back to the grid. */}
      <label className="check">
        <input type="checkbox" checked={selected.has(c.id)}
               aria-label={`Select ${c.title}`}
               onChange={() => onSelect(c.id)} />
        Select
      </label>
      <Link className="link" to={`/properties/${c.id}/location`}>
        {pin.ring.length >= 3 ? 'View / measure boundary' : 'Locate / draw boundary'}
      </Link>
    </div>;
  }), [cards, pinById, picked, selected, onSelect, nav]);

  const cardActions: Omit<CardActions, 'selected'> = {
    onSelect,
    onEdit: (rec) => setDrawer({ card: rec }),
    onOrder: (rec) => nav(orderHref(rec.id)),
    // The share panel lives on the record's papers, which is the record's own
    // index route; `?share=1` opens it there rather than landing the reader on
    // a page and leaving them to find the button.
    onShare: (rec) => nav(`/properties/${rec.id}?share=1`),
    onArchive: (rec) => setConfirm({
      kind: rec.status === 'archived' ? 'unarchive' : 'archive', ids: [rec.id] }),
    onDelete: (rec) => setConfirm({ kind: 'delete', ids: [rec.id] }),
  };

  /** Every bulk action counts the selection and nothing else.
   *
   *  This used to fall back to "everything shown" when nothing was picked,
   *  which is how a bar sitting at rest under the grid came to offer
   *  "Order EC ×14" — fourteen certificates, to a reader who had
   *  selected nothing. The bar does not exist unless a selection does. */
  const targetsArchived = selShown.length > 0 &&
    selShown.every((id) => byId.get(id)?.status === 'archived');

  // A write that fails must say so in the dialog that asked for it. Letting
  // the rejection escape left the dialog open, the button re-enabled and
  // nothing on screen to explain why the records had not moved.
  const said = (_e: unknown, fallback: string) => setErr(fallback);

  const runConfirm = async () => {
    if (!confirm) return;
    const { kind, ids } = confirm;
    setErr('');
    try {
      const changed = kind === 'delete'
        ? (await del.mutateAsync({ ids })).web.deleteRecords
        : (await arch.mutateAsync({ ids, archived: kind === 'archive' })).web.archiveRecords;
      if (changed !== ids.length) {
        setErr(changed > 0
          ? `Only ${changed} of ${ids.length} properties were changed. Reload before trying the rest again.`
          : 'None of those properties could be changed. Reload the list and try again.');
        return;
      }
    } catch (e) {
      said(e, 'That did not go through. Nothing was changed. Try again.');
      return;
    }
    setSelected(new Set());
    setConfirm(null);
  };

  const applyTag = async (tag: string) => {
    if (!tagIds) return;
    setErr('');
    try {
      const changed = (await tagRecs.mutateAsync({ ids: tagIds, tag })).web.tagRecords;
      if (changed !== tagIds.length) {
        setErr(changed > 0
          ? `The tag reached ${changed} of ${tagIds.length} properties. Reload before trying the rest again.`
          : 'That tag was not added to any property. Reload the list and try again.');
        return;
      }
    } catch (e) {
      said(e, 'The tag did not save. Try again.');
      return;
    }
    setSelected(new Set());
    setTagIds(null);
  };

  /** The visible list — filter, search and sort included — as a file.
   *
   *  `rows` is the selection when there is one, because a bar that says
   *  "3 records selected" and then exports four hundred has lied about what it
   *  is acting on. With nothing selected the Export in the page head takes the
   *  whole visible list, which is what its position promises. */
  const exportCsv = (rows: RecordCard[]) => {
    // The deed and the three counts go out with the rest. An export is what an
    // owner hands an advocate or a bank, and the first thing either of them
    // asks is which document registered the land.
    // The register as a file: both ids first (ours, then the government's
    // LP), then every fact the table states — flat, one column each, so a
    // bank or an auditor can sort and sum it. Dates are DD/MM/YYYY in India.
    const head = ['Pattadar ID', 'Survey No / LP', 'Property', 'Kind', 'Type', 'Owner',
      'Father/husband', 'Other owners', 'Village', 'Mandal', 'District', 'Khata',
      'Held by', 'Holding', 'Managed by', 'Status', 'Stake', 'Mutation', 'EC', 'In court',
      'Extent', 'Unit', 'Reading', 'Market estimate (₹)', 'Paid (₹)', 'Bought on',
      'Deed', 'Registered on', 'Documents', 'Photos', 'Site features',
      'Added', 'Last activity', 'By', 'What changed', 'Tags'];
    downloadCsv(`properties-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows.map((r) => [
      r.id, r.surveyNo, r.title, r.kind, classWord(r.classification || r.kind), r.ownerName,
      r.parentage, r.coOwnerCount || '', r.village, r.mandal, r.district, r.khataNo,
      r.holderLabel || OWN_NAME, r.holdingName, managerOf(r), r.status, r.stake,
      r.mutationStatus, r.ecStatus, r.litigation ? 'yes' : '',
      r.extent, r.extentUnit, r.extentDetail, Math.round(r.marketValue),
      r.purchasePrice > 0 ? Math.round(r.purchasePrice) : '', istDay(r.purchaseDate),
      r.deedLine, ddmmyyyy(r.regDate), r.paperCount, r.photoCount, r.featureCount,
      istDay(r.createdAt), istDay(r.lastActivityAt), r.lastActivityBy,
      actionWord(r.lastActivityAction), r.tags.join('; '),
    ])]);
  };

  const confirmCopy = confirm && {
    delete: {
      title: confirm.ids.length === 1 ? 'Delete this property?'
        : `Delete ${confirm.ids.length} properties?`,
      body: <>Everything saved under {confirm.ids.length === 1
          ? <strong>{byId.get(confirm.ids[0])?.title ?? 'it'}</strong>
          : 'them'} is deleted too. There is no undo.</>,
      action: 'Delete', danger: true,
    },
    archive: {
      title: `Archive ${plural(confirm.ids.length, 'property', 'properties')}?`,
      body: <>Archived properties leave lists, maps and totals. Everything saved under them is kept.</>,
      action: 'Archive', danger: false,
    },
    unarchive: {
      title: `Unarchive ${plural(confirm.ids.length, 'property', 'properties')}?`,
      body: <>{confirm.ids.length === 1 ? 'It rejoins' : 'They rejoin'} the list,
        the map and the portfolio totals.</>,
      action: 'Unarchive', danger: false,
    },
  }[confirm.kind];

  /** The head's commands (design.md § Page head): Export outlined, "Add a
   *  property" filled and rightmost — "Add a property", never a bare "Add"
   *  (A1). Nothing on an empty account ("First-run empty"): Export, the view
   *  toggle and the sort chip are all furniture for rows that do not exist,
   *  and the one thing to do is already the button in the middle of the
   *  screen — offering it twice, six inches apart, reads as two actions. */
  const headActions: HeadActions | undefined = virgin ? undefined : {
    secondaries: [{
      label: 'Export', icon: <FileDownloadOutlined sx={{ fontSize: 16 }} />,
      onClick: () => exportCsv(cards), disabled: cards.length === 0,
    }],
    primary: {
      label: 'Add a property', icon: <AddOutlined sx={{ fontSize: 17 }} />,
      onClick: () => setDrawer({ card: null }),
    },
  };

  const paged = view === 'grid' ? cards.slice(0, limit) : cards;

  return (
    <div className="onecol">
      <main ref={mainRef} tabIndex={-1}>
        <PageHead
          title="Properties"
          actions={headActions}
          // The portfolio's own totals, in the two figures it is measured in.
          // The count of what the filter lets through is the band's tally, so
          // it is not told twice (§ Page head, "Summary").
          summary={firstLoad
            ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" />
            : data && !virgin ? portfolioLine : undefined}
        />

        {/* The toolbar band: + Filter and its chips, then the tally, sort and
            view toggle. Not drawn on an account with nothing in it: there is
            nothing to narrow, and a row of controls over an empty page is the
            furniture problem the rail had, moved sideways. */}
        {data && !virgin && (
          <FacetFilter
            groups={groups}
            selected={facetSelection}
            onToggle={toggle}
            onClear={clearAll}
            tally={`${shownCount} of ${data.total} shown`}
            busy={isFetching}
            groupLabel={groupWord}
            missingOptionLabel={optionWord}
            extraChips={q ? [{
              id: 'q', group: 'Search', label: params.get('q') ?? '',
              removeLabel: `Clear the search for ${params.get('q')}`,
              onRemove: dropQ,
            }] : []}
            sort={(
              <SortCycle
                label={sortLabel(sort)}
                onNext={() => {
                  const at = SORT_PRESETS.findIndex((p) => p.label === sortLabel(sort));
                  setSort(SORT_PRESETS[(at + 1 + SORT_PRESETS.length) % SORT_PRESETS.length].sort);
                }}
              />
            )}
            // Words, not icons, on a wide screen: three unlabelled glyphs gave
            // no clue that a map of the whole portfolio existed at all. On a
            // phone each icon keeps its word as its name.
            view={<ViewToggle views={['grid', 'table', 'map']} value={view} onChange={setView} />}
          />
        )}

        {/* The combine hand-off from the Holdings list. While it shows, the
            grid's checkboxes stand at full strength, as they do once something
            is ticked; the list view always shows them. */}
        {combineHint && data && !virgin && (
          <div className="callout" role="status"
               style={{ gridTemplateColumns: '1fr auto', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <p className="note" style={{ margin: 0 }}>
              Select two or more properties, then choose Combine into a holding.
            </p>
            <button type="button" className="iconbtn" aria-label="Dismiss the combine hint" onClick={dropCombine}>
              <CloseOutlined sx={{ fontSize: 16 }} />
            </button>
          </div>
        )}

        {/* Loading looks like whatever you were looking at. A reader who
            left this screen in table view and came back to a grid of grey
            cards has been told the wrong thing twice: once about the shape
            of the answer, and again when it rearranges itself. */}
        {firstLoad && view === 'grid' && <SkRecordCards />}
        {firstLoad && view === 'table' && <SkRecordTable />}
        {firstLoad && view === 'map' && <SkPortfolioMap />}

        {/* A failed list used to render a page head over an empty column —
            no skeleton, no rows, no reason given. */}
        {!firstLoad && !data && <Failed what="Your properties" error={error} boxed h="26rem" />}

        {/* An account that holds nothing and an account whose every record is
            archived both report `total === 0`, and they are not the same
            sentence. The second one was told it had no records and invited to
            add its first, with the control that holds the way back hidden along
            with everything else. */}
        {virgin && archivedCount > 0 && (
          <Empty
            boxed h="26rem" icon="parcel" title="All properties are archived"
            action={
              <>
                <button type="button" className="btn" onClick={() => {
                  mainRef.current?.focus();
                  toggle('status', 'archived');
                }}>
                  Show archived
                </button>
                <button type="button" className="btn primary" onClick={() => setDrawer({ card: null })}>
                  <AddOutlined sx={{ fontSize: 17 }} /> Add a property
                </button>
              </>
            }
          >
            {`${plural(archivedCount, 'property', 'properties')} ${archivedCount === 1 ? 'is' : 'are'} archived.`}
          </Empty>
        )}

        {/* The one CTA reads the passbook. "Add a record" opens the drawer, and
            the drawer opens on the scanner — so a second "Read a passbook
            instead" button beside it would be the same button twice. */}
        {virgin && archivedCount === 0 && (
          <Empty
            boxed h="26rem" icon="parcel" title="No properties yet"
            action={
              <button type="button" className="btn primary" onClick={() => setDrawer({ card: null })}>
                <AddOutlined sx={{ fontSize: 17 }} /> Add a property
              </button>
            }
          >
            Add a property, or upload a pattadar passbook.
          </Empty>
        )}

        {/* Filtered or searched to nothing. One panel for both, because the
            remedy is the same: something is narrowing this list and it can come
            off. It used to be a card floating in the corner of an otherwise
            empty grid — and a separate, differently worded card for search. */}
        {data && !virgin && cards.length === 0 && (
          <div className="emptypanel">
            <h3>
              {q && active === 0
                ? `Nothing matches “${params.get('q')}”`
                : 'No properties match these filters'}
            </h3>
            <p className="note" style={{ maxWidth: '26rem' }}>
              {q && active === 0
                ? "Try a survey number, a village, a khata or an owner's name."
                : <>
                    {/* Not every hidden record carries a place: the server builds
                        hiddenPlaces only from rows that have a mandal, a district
                        or a village, and the Add drawer takes a record with all
                        three blank. Naming two and promising "everything in" them
                        under-describes a filter hiding records in five, so the
                        rest are owned up to. */}
                    {data.hiddenPlaces.length > 0 && (
                      <> The ones being held back are in {data.hiddenPlaces.slice(0, 2).join(' and ')}
                        {data.hiddenPlaces.length > 2 ? ' and elsewhere' : ''}.</>
                    )}
                  </>}
            </p>
            {/* One button, whatever narrowed the list — a search that matched
                nothing used to be a dead end whenever no facet happened to be
                on beside it. */}
            <button type="button" className="btn" onClick={clearAll}>
              {q && active === 0 ? 'Clear search' : 'Clear all'}
            </button>
          </div>
        )}

        {data && !virgin && cards.length > 0 && view === 'grid' && (
          <div className={`cards ${selected.size > 0 || combineHint ? 'selecting' : ''}`} style={settling}>
            {paged.map((r) => (
              <Card key={r.id} rec={r}
                    a={{ ...cardActions, selected: selected.has(r.id) }} />
            ))}
          </div>
        )}

        {/* A hairline, the button, a hairline — and only when there is genuinely
            another batch behind it. */}
        {data && !virgin && view === 'grid' && cards.length > limit && (
          <div className="loadmore">
            <span className="hair" aria-hidden />
            <button type="button" className="btn sm" onClick={() => setLimit((n) => n + PAGE)}>
              Load {Math.min(PAGE, cards.length - limit)} more
            </button>
            <span className="hair" aria-hidden />
          </div>
        )}

        {data && !virgin && cards.length > 0 && view === 'map' && (
          <div className="pf">
            <div className="pf-search row">
              <label className="search">
                <SearchOutlined sx={{ fontSize: 17 }} aria-hidden />
                <input aria-label="Search your land on the map" type="search"
                       placeholder="Survey number, village, khata or owner"
                       value={params.get('q') ?? ''}
                       onChange={(e) => {
                         const next = new URLSearchParams(params);
                         if (e.target.value) next.set('q', e.target.value); else next.delete('q');
                         setParams(next, { replace: true });
                       }} />
              </label>
              <Link className="btn sm" to="/maps">Search cadastral maps</Link>
            </div>
            <div className="pf-body">
            <div className="plot live pf-stage">
              <PortfolioCanvas
                ref={mapRef}
                records={pins}
                satellite={satellite}
                selected={picked}
                hovered={lit}
                onHover={setLit}
                onSelect={setPicked}
                // Opened from the map, so onto its Location tab, as every
                // other way in from this view lands.
                onOpen={(id) => nav(`/properties/${id}/location`)}
              />

              <div className="maptools">
                <span className="row tight">
                  <button type="button" className="chip wash" aria-pressed={satellite}
                          title={satellite ? 'Turn the imagery off' : 'Turn the imagery on'}
                          onClick={() => setSatellite((on) => !on)}>
                    Satellite
                  </button>
                  <button type="button" className="chip"
                          title="Frame everything again"
                          onClick={() => { setPicked(null); mapRef.current?.fit(); }}>
                    <MyLocationOutlined sx={{ fontSize: 14 }} /> Fit all
                  </button>
                </span>
              </div>

              {/* Picked, not hovered: a tooltip answers "which one is that"
                  while the pointer is on it, and this answers "what is it and
                  where do I go next" after the pointer has left. */}
              {picked && byId.get(picked) && (
                <div className="pf-pick" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <strong>{byId.get(picked)!.title}</strong>
                    <span className="note">
                      {[byId.get(picked)!.village, byId.get(picked)!.mandal]
                        .filter(Boolean).join(', ')} · {fmtExtent(byId.get(picked)!)}
                    </span>
                  </div>
                  <Link className="btn sm" to={`/properties/${picked}`}>Open</Link>
                  <Link className="btn sm" to={`/properties/${picked}/location`}>Location &amp; boundary</Link>
                </div>
              )}

              {/* In the `mapsays` band along the bottom, not loose in the
                  corner. Bare, a `.nogeo` pins itself top-left — the same
                  corner the Satellite / Fit all chips occupy — so the sentence
                  explaining why the map is empty sat on top of the two controls
                  that would refill it. W04's map already solved this; the
                  portfolio map was the one surface left outside the stack. */}
              {drawn.length === 0 && (
                <div className="mapsays">
                  <p className="nogeo">
                    No property here has a pin or boundary yet.
                  </p>
                </div>
              )}

              <span className="cap">
                {satellite ? 'Esri World Imagery' : 'OpenStreetMap'}
              </span>
            </div>

            <aside className="pf-results" aria-label="Map search results" aria-busy={isFetching}>
              <p className="eyebrow" role="status">{plural(cards.length, 'matching property', 'matching properties')} · {drawn.length} on map</p>
              {results}
            </aside>
            </div>

            {/* The count goes UNDER the map, not on it. On the map it was a
                two-line caption sitting across the scale bar and the zoom
                cluster at phone width — and it is a sentence about the map
                rather than a label on the ground, which is what the space
                inside the frame is for.

                Said whenever anything is drawn, not only when something is
                missing: a map is the one view that can look complete while
                quietly leaving records out, because what is missing takes up no
                space. With nothing drawn it is not said at all — the count and
                the breakdown used to contradict each other ("0 records drawn —
                every one from a pin, none from a survey"), and the band across
                the bottom of the map is already saying why the map is empty, in
                the right words for each reason. The all-surveyed case was wrong
                the same way and read "3 from a survey, 0 from a pin". */}
            {drawn.length > 0 && (
              <p className="note">
                {`${plural(drawn.length, 'property', 'properties')} on the map — `}
                {surveyed === 0
                  ? 'every one from a pin, none from a boundary.'
                  : surveyed === drawn.length
                    ? (drawn.length === 1 ? 'from its boundary.' : 'every one from a boundary.')
                    : `${surveyed} from a boundary, ${drawn.length - surveyed} from a pin.`}
                {cards.length > drawn.length && (
                  <>
                    {' '}
                    {plural(cards.length - drawn.length, 'property is', 'properties are')} not
                    here: {cards.filter((c) => !drawnIds.has(c.id))
                      .slice(0, 3).map((c) => c.title).join(', ')}
                    {cards.length - drawn.length > 3 ? ' and others' : ''} — no boundary
                    and no pin.
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {data && !virgin && cards.length > 0 && view === 'table' && (
          <PropertyTable
            rows={cards}
            label="Properties"
            resetKey={narrowKey}
            sort={sort}
            setSort={setSort}
            menu={(r) => recMenu(r, cardActions)}
            selection={{
              selected,
              onSelect,
              onSelectAll: () => setSelected(
                selShown.length === cards.length ? new Set() : new Set(cards.map((c) => c.id))),
            }}
            style={settling}
          />
        )}
      </main>

      {/* Nothing about acting on many records exists until records are picked,
          and every label here counts the selection. The row is the full width
          and ignores the pointer; only the pill takes clicks, so the grid
          underneath stays reachable. */}
      <SelectionBar count={selShown.length} noun={['property', 'properties']}
                    label="Act on the selected properties" onClear={() => setSelected(new Set())}>
              <button type="button" className="btn sm" onClick={() => setTagIds(selShown)}>
                Add a tag
              </button>
              {/* WHO holds these. The dialog previews every property that
                  moves — a parcel is held through its khata, so the other
                  parcels on that khata move with it — before anything does. */}
              <button type="button" className="btn sm" onClick={() => setHolderIds(selShown)}>
                Set holder
              </button>
              {/* Combining is done here because a holding is made of
                  properties, and this is where they are. With one selected the
                  control still appears, disabled, saying what it needs: hiding
                  it until a second tick would make the feature invisible to
                  anybody who had not already found it. */}
              <button type="button" className="btn sm" disabled={selShown.length < 2}
                      onClick={() => setCombineIds(selShown)}>
                {selShown.length < 2 ? 'Select 2 or more to combine' : 'Combine into a holding'}
              </button>
              {/* Into the one order flow with these properties chosen, on the
                  services step — never a second way of ordering from here. */}
              <button type="button" className="btn sm" onClick={() => nav(orderHref(selShown))}>
                Order a service
              </button>
              <button type="button" className="btn sm"
                      onClick={() => exportCsv(cards.filter((c) => selected.has(c.id)))}>
                <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
              </button>
              <button type="button" className="btn sm"
                      onClick={() => setConfirm({
                        kind: targetsArchived ? 'unarchive' : 'archive', ids: selShown })}>
                {targetsArchived ? 'Unarchive' : 'Archive'}
              </button>
              <button type="button" className="btn sm danger"
                      onClick={() => setConfirm({ kind: 'delete', ids: selShown })}>
                Delete
              </button>
      </SelectionBar>

      {drawer && <RecordDrawer key={drawer.job ?? 'record'} card={drawer.card} fromJob={drawer.job}
        onClose={() => setDrawer(null)}
        onCreated={view === 'map' ? (id) => {
          setDrawer(null);
          nav(`/properties/${id}/location`);
        } : undefined} />}
      {confirm && confirmCopy && (
        <ConfirmDialog
          title={confirmCopy.title} body={confirmCopy.body}
          extra={confirm.kind === 'delete' ? <HoldingsGoToo ids={confirm.ids} /> : undefined}
          actionLabel={confirmCopy.action} danger={confirmCopy.danger}
          busy={del.isPending || arch.isPending} error={err}
          onConfirm={runConfirm}
          onClose={() => { setErr(''); setConfirm(null); }}
        />
      )}
      {tagIds && (
        <TagDialog
          count={tagIds.length}
          existing={(data?.facets ?? []).find((g) => g.key === 'tags')?.options.map((o) => o.key) ?? []}
          busy={tagRecs.isPending} error={err} onApply={applyTag}
          onClose={() => { setErr(''); setTagIds(null); }}
        />
      )}
      {combineIds && (
        <CombineDialog
          records={combineIds.map((id) => byId.get(id)).filter((r): r is RecordCard => !!r)}
          onDone={(id) => {
            setCombineIds(null);
            setSelected(new Set());
            // Onto the holding it just made. Staying on the list would leave the
            // owner with a dialog closing and nothing on screen to say a
            // holding now exists.
            nav(`/holdings/${id}`);
          }}
          onClose={() => setCombineIds(null)}
        />
      )}
      {holderIds && (
        <SetHolderDialog
          records={holderIds.map((id) => byId.get(id)).filter((r): r is RecordCard => !!r)}
          onDone={() => { setHolderIds(null); setSelected(new Set()); }}
          onClose={() => setHolderIds(null)}
        />
      )}
    </div>
  );
}

export { EMPTY_FILTER };
