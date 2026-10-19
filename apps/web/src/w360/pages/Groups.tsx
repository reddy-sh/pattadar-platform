/**
 * Families & groups: a list at /groups and one page per group at
 * /groups/:id.
 *
 * The list is for scanning and acting on many: a Grid of cards or a List
 * table (`?view=list`), a Type filter, a sort, and every row's own Open /
 * Edit / Delete. It used to be cards over an inline detail panel on one page,
 * which the founder found unscannable past a handful of groups (06/10/2026):
 * the detail pushed the list off screen and the list pushed the detail down.
 *
 * The page for one group is the detail: its head (type, your role, a line
 * about people, one land tile, and Edit / Delete as visible buttons) and the
 * tabs Members · Properties · Safeguard · Activity. The tab rides in `?tab=`
 * (Members is the default and leaves the URL), the way Tools carries its tab,
 * and the Safeguard tab exists only for group types with a family tree — the
 * inactivity safeguard contacts family, so a partnership or a company has
 * none. Its state rules live in `../groupsView.ts`.
 *
 * `groups` returns the whole list with the counts on it in one read, so the
 * group page reads its row out of that same cached list rather than a second
 * query that could disagree with the card it was opened from.
 *
 * A group says WHO holds land; a holding says WHICH properties make one piece
 * of ground (decision memo 06/10/2026, section 4.2). So the land tile
 * "{n} properties · {x} ac →" opens `/properties?group=<id>` (Properties
 * reads `?group=` into its Holder facet) — the full list, map, filters and
 * export live there.
 *
 * One pattern (founder, 08/10/2026): the Properties tab is the Properties
 * List view's own table (PropertyTable), over the same `properties(groups:
 * [id])` read the Holder facet makes, and a row opens the property. That one
 * read is the group's land count everywhere on this page — the facts line,
 * the tab badge and the tile — so they cannot disagree with each other or
 * with Properties. Empty khatas (a passbook with no parcels) are not
 * properties and are never drawn here.
 */
import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import EmailOutlined from '@mui/icons-material/EmailOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import WhatsApp from '@mui/icons-material/WhatsApp';

import { formatAadhaarMask, formatArea } from '@pattadar/core';

import { fmtLocal } from '../../lib/format';
import {
  GROUP_TYPES,
  factError,
  groupTypeDef,
  memberStatusChip,
  missingFacts,
  panWarn,
  parseFacts,
  pickFacts,
  relMeta,
  roleWord,
  todayIso,
  verifyLink,
  visibleFields,
} from '../../pages/families/familiesData';
import type { FactField, Facts, GroupMember, MemberVars } from '../../pages/families/familiesData';
import { COUNTRY_CODES, countryName, countryOptions } from '../../lib/countries';
import { EMPTY_FILTER, PERSONAL_GROUP, useProperties } from '../api';
import type { RecordCard } from '../api';
import { PropertyTable, inAcres, recMenu, sortRows } from '../PropertyTable';
import type { Sort } from '../PropertyTable';
import { SetHolderDialog, PERSONAL } from '../SetHolderDialog';
import { Sk, SkGrid, SkRowItems, SkRows, SkTable } from '../skeletons';
import { Dialog } from '../Dialog';
import { Drawer, DrawerAction, drawerEyebrow } from '../Drawer';
import { useToast } from '../Toast';
import {
  holdingCount,
  useAssignHolder,
  useCreateGroup,
  useDeleteGroup,
  useGroupActivity,
  useGroupMembers,
  useGroups,
  useInviteMember,
  useNotifiers,
  useRemoveMember,
  useSaveMember,
  useSetMemberStatus,
  useSetNotifiers,
  useUpdateGroup,
} from '../groupsData';
import type { GroupRow } from '../groupsData';
import {
  GROUP_ACTION_WORD, GROUP_LAND_DISCLAIMER, GROUP_SORTS, SAFEGUARD_OUTCOME_WORD,
  SHARE_NOTE, TYPE_SECTION_WORD, cap, contactGapSentence, groupLandTile,
  groupPeopleLine, groupTypeFacet, isEligibleNotifier, matchesMember, memberFacets,
  memberRelationWord, movableProperties, safeguardNeedsAction, safeguardStage,
  safeguardTabStatus, sameNameNote, sameNamedGroup, shareWhere, sortGroups, wordFor,
} from '../groupsView';
import type { GroupSortKey } from '../groupsView';
import {
  Card, Chip, Empty, FacetFilter, Failed, Icon, KV, Menu, PageHead, SelectAllBox, SelectCell,
  SelectionBar, SortCycle, State, StatusChip, TabPanel, TabStrip, TablePager, Th, ViewToggle, ddmmyyyy,
  downloadCsv, num, plural, sortBy, statusWord, usePaged, useRowSelection,
} from '../ui';
import type { DetailActions, HeadActions, SortState, TabStripTab } from '../ui';
import { orderHref } from '../orderFlow';
// SectionHead stays in RecordHead.tsx; non-record screens import it from there
// (Orders.tsx does the same).
import { SectionHead } from './RecordHead';
import { RecordDrawer } from './PropertyActions';

/**
 * The member form, behind a lazy import.
 *
 * It is 750 lines of MUI — Autocomplete, the country-code list, the Aadhaar
 * scan-and-prefill flow — and it is reused rather than redrawn because it is
 * the one part of this feature that is genuinely intricate and already
 * correct. It is also the only MUI on this screen, and none of it is loaded
 * until somebody actually opens it: the W360 pages otherwise pull in only MUI
 * *icons*, so importing this eagerly would put the whole of MUI core in front
 * of the first paint of a screen where most visits never add a person.
 *
 * Rendered only while open, so the chunk is fetched on the click.
 */
const PersonDialog = lazy(() =>
  import('../../pages/families/PersonDialog').then((m) => ({ default: m.PersonDialog })),
);

const HEAD = {
  title: 'Families & groups',
};

/** A glyph per group type. The type defs carry an emoji, which is the previous
 *  app's vocabulary; these screens are mono-labelled and hairline-ruled and an
 *  emoji reads as a sticker on them. */
const TYPE_ICON: Record<string, typeof GroupsOutlined> = {
  family: GroupsOutlined,
  partnership: HandshakeOutlined,
  company: ApartmentOutlined,
  huf: AccountBalanceOutlined,
  trust: GavelOutlined,
};

/** What choosing each type actually commits you to. The create dialog used to
 *  offer six labels with no explanation of the difference, and the difference
 *  is not cosmetic — it decides whether members have relationships and heirs
 *  or just roles, and it cannot be changed afterwards. There is no Portfolio
 *  / Wallet type (retired 06/10/2026): keeping properties together is what a
 *  holding does, and a group is a holder. */
const TYPE_BLURB: Record<string, string> = {
  family: 'Relationships, heirs and inheritance shares.',
  partnership: 'Partners holding land together.',
  company: 'A company or LLP named on the title.',
  huf: 'Hindu Undivided Family: a Karta (head of the family) and coparceners (joint heirs by birth).',
  trust: 'Trustees and beneficiaries.',
};

function TypeGlyph({ type, size = 20 }: { type: string; size?: number }) {
  const C = TYPE_ICON[type] ?? GroupsOutlined;
  return <C sx={{ fontSize: size }} aria-hidden />;
}

/** memberStatusChip speaks MUI's palette; `.state` speaks four words. */
const STATE_OF: Record<string, string> = {
  success: 'good',
  warning: 'warn',
  error: 'bad',
  default: 'unknown',
};

const KIND_WORD: Record<string, string> = {
  coowner: 'Co-owner',
  legalheir: 'Legal heir',
  nominee: 'Nominee',
};

/**
 * Who is in this group, counted the way the screen actually shows them.
 *
 * `memberCount` is `count(*) WHERE is_self = false` — deliberately "people you
 * have added", not "rows in the members table". But the `members` resolver
 * calls `ensure_self` and returns your own row with them, so a freshly created
 * group printed "0 members" on its card directly above a table with one person
 * in it. Two true numbers that contradict each other on one screen; the reader
 * has no way to know which is lying, and neither is.
 *
 * So the count is never printed bare. It says who it counts.
 */
const peopleWord = (others: number) =>
  others === 0 ? 'Just you' : `You and ${plural(others, 'other')}`;

/** Rows the Members table will have: your self row plus everyone added. Exact,
 *  not an estimate — `members` seats the self node on every read. */
const rowCount = (others: number) => others + 1;

// ── The list ───────────────────────────────────────────────────────────

/** One group of this type, as a noun inside a sentence: "Delete this HUF",
 *  "Delete this trust". Not the type label lower-cased, which gave "huf" and
 *  "trust / society". */
const TYPE_NOUN: Record<string, string> = {
  family: 'family', huf: 'HUF', partnership: 'partnership', company: 'company',
  trust: 'trust',
};
const typeNoun = (type: string) => TYPE_NOUN[type] ?? 'group';

const groupPath = (id: string) => `/groups/${encodeURIComponent(id)}`;

/** The safeguard in a word for the list: only a type with a family tree has
 *  one, so everything else says nothing rather than a misleading "Set". */
function SafeguardWord({ g }: { g: GroupRow }) {
  if (!groupTypeDef(g.type).hasTree) return <span className="muted">—</span>;
  return safeguardNeedsAction(g)
    ? <StatusChip state="warn">Needs action</StatusChip>
    : <StatusChip state="good">Set</StatusChip>;
}

/** Open, Edit and Delete for one group, the same three wherever a group is
 *  listed. Open is first because the row's name is the same link, and a
 *  menu that leaves out the obvious thing reads as a different menu. */
function groupMenu(g: GroupRow, nav: (to: string) => void, onEdit: () => void, onDelete: () => void) {
  return [
    { label: 'Open', icon: <ArrowForwardOutlined sx={{ fontSize: 16 }} />, onClick: () => nav(groupPath(g.id)) },
    { label: 'Edit details', icon: <EditOutlined sx={{ fontSize: 16 }} />, onClick: onEdit },
    {
      label: `Delete this ${typeNoun(g.type)}`,
      icon: <DeleteOutlineOutlined sx={{ fontSize: 16 }} />,
      danger: true,
      rule: true,
      onClick: onDelete,
    },
  ];
}

/** What a List heading sorts by. A heading's sort sits over the band's Sort,
 *  and pressing the band hands the order back to it. */
type ColKey = 'name' | 'type' | 'properties' | 'extent';
const COL_SORT: Record<ColKey, (g: GroupRow) => string | number> = {
  name: (g) => g.name.toLowerCase(),
  type: (g) => groupTypeDef(g.type).label,
  properties: holdingCount,
  extent: (g) => g.totalExtent,
};

const idOf = (r: { id: string }) => r.id;

/** The table's columns as a CSV, for the ticked rows. */
function exportGroupsCsv(rows: readonly GroupRow[]) {
  downloadCsv('families-and-groups.csv', [
    ['Name', 'Type', 'Your role', 'People', 'Properties', 'Extent (ac)', 'Safeguard'],
    ...rows.map((g) => {
      const def = groupTypeDef(g.type);
      return [g.name, def.label, roleWord(g.myRole || def.primaryRole), peopleWord(g.memberCount), holdingCount(g),
        g.totalExtent > 0 ? g.totalExtent : '',
        !def.hasTree ? '' : safeguardNeedsAction(g) ? 'Needs action' : 'Set'];
    }),
  ]);
}

export function Groups() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const groups = useGroups();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [deleting, setDeleting] = useState<GroupRow | null>(null);
  const [sortKey, setSortKey] = useState<GroupSortKey>('type');

  const view = params.get('view') === 'table' ? 'table' : 'grid';
  const setView = (v: 'grid' | 'table') => {
    const next = new URLSearchParams(params);
    if (v === 'grid') next.delete('view');
    else next.set('view', v);
    setParams(next, { replace: true });
  };
  const types = params.getAll('type');
  const toggleType = (_group: string, key: string) => {
    const next = new URLSearchParams(params);
    next.delete('type');
    (types.includes(key) ? types.filter((t) => t !== key) : [...types, key])
      .forEach((t) => next.append('type', t));
    setParams(next, { replace: true });
  };
  const clearTypes = () => {
    const next = new URLSearchParams(params);
    next.delete('type');
    setParams(next, { replace: true });
  };

  const list = useMemo(() => groups.data ?? [], [groups.data]);
  const shown = useMemo(
    () => sortGroups(types.length ? list.filter((g) => types.includes(g.type)) : list, sortKey),
    // `types` is a fresh array each render; its contents are the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, sortKey, types.join('|')],
  );
  const [colSort, setColSort] = useState<SortState<ColKey>>(null);
  const rows = useMemo(() => sortBy(shown, colSort, COL_SORT), [shown, colSort]);
  const paged = usePaged(rows, {
    resetKey: `${sortKey}|${colSort?.key ?? ''}${colSort?.dir ?? ''}|${types.join('|')}`,
    storeKey: 'pattadar.table.groups',
  });
  // Ticks cover every row the filter lets through; a filter or view change drops them.
  const sel = useRowSelection(rows, idOf, `${view}|${types.join('|')}`);
  const sumOver = sel.picked.length > 0 ? sel.picked : rows;
  const sumAc = sumOver.reduce((n, g) => n + g.totalExtent, 0);
  const sortLabel = GROUP_SORTS.find((s) => s.key === sortKey)?.label ?? '';
  const menuFor = (g: GroupRow) => groupMenu(g, nav, () => setEditing(g), () => setDeleting(g));
  const virgin = !!groups.data && list.length === 0;
  /** The account's totals, which the type filter does not shrink. Properties
   *  and extent add up across groups because a khata or a property names one
   *  group; people would not (one person can sit in several), so they are
   *  left out. The land is worded as each group's tile words it, and a zero
   *  figure is dropped rather than printed as a fact. */
  const held = list.reduce((n, g) => n + holdingCount(g), 0);
  const heldAc = list.reduce((n, g) => n + g.totalExtent, 0);
  const totalsLine = [
    list.every((g) => g.type === 'family')
      ? plural(list.length, 'family', 'families') : plural(list.length, 'group'),
    held > 0 ? groupLandTile(held, heldAc) : '',
  ].filter(Boolean).join(' · ');
  const headActions: HeadActions = {
    primary: {
      label: 'New family or group',
      icon: <AddOutlined sx={{ fontSize: 16 }} />,
      onClick: () => setCreating(true),
    },
  };

  return (
    <main>
      {/* The tally counts what the type filter lets through; the summary
          carries the account's totals (design.md § Page head, "Summary").
          First-run empty: the title alone, the empty card holds the one add. */}
      <PageHead
        title={HEAD.title}
        actions={list.length > 0 ? headActions : undefined}
        summary={groups.isPending
          ? <Sk w="18rem" h="1rem" r="var(--radius-xs)" />
          : list.length > 0 ? totalsLine : undefined}
      />

      {/* The first read draws the view the URL asks for, in its own shape. */}
      {groups.isPending && (view === 'table'
        ? <SkTable label="Loading your families and groups" minWidth="44rem" cols={[
            { head: 'Name' }, { head: 'Type' }, { head: 'Your role' }, { head: 'People' },
            { head: 'Properties', right: true, w: '2rem' }, { head: 'Extent', right: true }, { head: 'Safeguard' },
          ]} />
        : <SkGrid label="Loading your families and groups" facts={4} />)}

      {/* A failed read is not an empty account. */}
      {groups.isError && !groups.data && (
        <Failed what="Families & groups" error={groups.error} onRetry={() => groups.refetch()} boxed h="26rem" />
      )}

      {virgin && (
        <Empty
          boxed
          h="24rem"
          icon="person"
          title="No families or groups yet"
          action={
            <button type="button" className="btn primary" onClick={() => setCreating(true)}>
              <AddOutlined sx={{ fontSize: 16 }} /> New family or group
            </button>
          }
        />
      )}

      {list.length > 0 && (
        <>
          {groups.isRefetchError && (
            <p className="note" role="status" style={{ color: 'var(--w-danger)', marginBottom: 'var(--space-md)' }}>
              The list could not refresh just now.
            </p>
          )}

          <FacetFilter
            groups={[groupTypeFacet(list)]}
            selected={{ type: types }}
            onToggle={toggleType}
            onClear={clearTypes}
            missingOptionLabel={(_g, key) => TYPE_SECTION_WORD[key] ?? 'Other groups'}
            tally={`${shown.length} of ${list.length} shown`}
            ariaLabel="Narrow families and groups"
            sort={(
              <SortCycle
                label={sortLabel}
                onNext={() => {
                  const at = GROUP_SORTS.findIndex((s) => s.key === sortKey);
                  setSortKey(GROUP_SORTS[(at + 1) % GROUP_SORTS.length].key);
                  setColSort(null);
                }}
              />
            )}
            view={<ViewToggle views={['grid', 'table']} value={view} onChange={setView} />}
          />

          {shown.length === 0 && (
            <div className="emptypanel">
              <h3>No families or groups match these filters</h3>
              <button type="button" className="btn" onClick={clearTypes}>Clear all</button>
            </div>
          )}

          {shown.length > 0 && view === 'grid' && (
            <div className="cards">
              {shown.map((g) => {
                const def = groupTypeDef(g.type);
                return (
                  <div key={g.id} className="rec groupcard">
                    <div className="meat">
                      <div className="groupcard-top">
                        <span className="avatarlg groupcard-glyph"><TypeGlyph type={g.type} size={18} /></span>
                        <span className="groupcard-title">
                          <h3>
                            <Link to={groupPath(g.id)} className="recgo" title={g.name}>
                              {g.name}
                              {/* The whole card is the link; the menu sits above it. */}
                              <span aria-hidden className="groupcard-hit" />
                            </Link>
                          </h3>
                          <span className="note">{def.label} · Your role: {roleWord(g.myRole || def.primaryRole)}</span>
                        </span>
                        <Menu className="groupcard-menu" label={`Actions for ${g.name}`} header={g.name}
                              items={menuFor(g)} />
                      </div>
                      <dl className="groupcard-facts">
                        <div><dt>People</dt><dd>{peopleWord(g.memberCount)}</dd></div>
                        <div><dt>Properties</dt><dd className="num">{num(holdingCount(g))}</dd></div>
                        <div>
                          <dt>Extent</dt>
                          <dd className="num">{g.totalExtent > 0 ? formatArea(g.totalExtent) : '—'}</dd>
                        </div>
                        <div><dt>Safeguard</dt><dd><SafeguardWord g={g} /></dd></div>
                      </dl>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {shown.length > 0 && view === 'table' && (
            <>
            <Card flush className="scroll-x edgefade">
              <table className="rectable" aria-label="Families and groups" style={{ minWidth: '44rem' }}>
                <thead>
                  <tr>
                    <th className="selcol">
                      <SelectAllBox total={rows.length} picked={sel.picked.length} noun={['group', 'groups']}
                                    onToggle={sel.toggleAll} />
                    </th>
                    <Th k="name" label="Name" sort={colSort} setSort={setColSort} />
                    <Th k="type" label="Type" sort={colSort} setSort={setColSort} />
                    <th>Your role</th>
                    <th>People</th>
                    <Th k="properties" label="Properties" right sort={colSort} setSort={setColSort} />
                    <Th k="extent" label="Extent" right sort={colSort} setSort={setColSort} />
                    <th>Safeguard</th>
                    <th className="menucol" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {paged.shown.map((g) => {
                    const def = groupTypeDef(g.type);
                    return (
                      <tr key={g.id} className={sel.selected.has(g.id) ? 'selected' : undefined}>
                        <SelectCell checked={sel.selected.has(g.id)} label={`Select ${g.name}`}
                                    onToggle={() => sel.toggle(g.id)} />
                        <td>
                          <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                            <TypeGlyph type={g.type} size={16} />
                            <Link to={groupPath(g.id)} className="accent" style={{ textDecoration: 'none', fontWeight: 700 }}>
                              {g.name}
                            </Link>
                          </span>
                        </td>
                        <td className="muted">{def.label}</td>
                        <td className="muted">{roleWord(g.myRole || def.primaryRole)}</td>
                        <td className="muted">{peopleWord(g.memberCount)}</td>
                        <td className="right num">{num(holdingCount(g))}</td>
                        <td className="right num">{g.totalExtent > 0 ? formatArea(g.totalExtent) : '—'}</td>
                        <td><SafeguardWord g={g} /></td>
                        <td className="menucol">
                          <Menu label={`Actions for ${g.name}`} header={g.name} items={menuFor(g)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* The ticked rows, else every row the filter lets through, not just this page. */}
                <tfoot>
                  <tr>
                    <td className="selcol" />
                    <th scope="row" colSpan={4}>
                      {sel.picked.length > 0
                        ? `${plural(sel.picked.length, 'group')} selected`
                        : `Total · ${plural(rows.length, 'group')}`}
                    </th>
                    <td className="right num">{num(sumOver.reduce((n, g) => n + holdingCount(g), 0))}</td>
                    <td className="right num">{sumAc > 0 ? formatArea(sumAc) : '—'}</td>
                    <td />
                    <td className="menucol" />
                  </tr>
                </tfoot>
              </table>
            </Card>
            <TablePager {...paged} onSize={paged.setSize} label="Families and groups pages" />
            <SelectionBar count={sel.picked.length} noun={['group', 'groups']}
                          label="Act on the selected groups" onClear={sel.clear}>
              <button type="button" className="btn sm" onClick={() => exportGroupsCsv(sel.picked)}>
                <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
              </button>
            </SelectionBar>
            </>
          )}
        </>
      )}

      {creating && (
        <GroupFormDialog onClose={() => setCreating(false)} onCreated={(id) => nav(groupPath(id))} />
      )}
      {editing && <GroupFormDialog group={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <DeleteGroupDialog group={deleting} onClose={() => setDeleting(null)} onDeleted={() => setDeleting(null)} />
      )}
    </main>
  );
}

// ── One group ──────────────────────────────────────────────────────────

type TabId = 'members' | 'details' | 'properties' | 'safeguard' | 'activity';

/** /groups/:id — one family or group, read out of the cached list. */
export function GroupPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const groups = useGroups();
  const group = groups.data?.find((g) => g.id === id);

  /** The open tab is view state: `replace`, and Members (the default) leaves
   *  the URL. */
  const chooseTab = useCallback(
    (t: TabId) => {
      const next = new URLSearchParams(params);
      if (t === 'members') next.delete('tab');
      else next.set('tab', t);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  // The head is drawn in every state below, so each has a heading and a tab.
  const head = (title: string, here = title) => (
    <PageHead crumbs={[{ label: HEAD.title, to: '/groups' }, { label: here }]} title={title} />
  );

  // A row missing from a list that is being read again is not yet "not on
  // file": a group created a moment ago lands here before the list holds it.
  if (groups.isPending || (!group && groups.isFetching)) {
    // The head's two meta lines and tab strip are reserved, so the tab body
    // does not drop when the group lands (Safeguard depends on the type).
    return (
      <main>
        <PageHead
          crumbs={[{ label: HEAD.title, to: '/groups' }, { label: group?.name ?? 'Family or group' }]}
          title={group?.name ?? 'Family or group'}
          meta={(
            <span style={{ display: 'grid', gap: '0.125rem' }} aria-hidden>
              <Sk w="14rem" /><Sk w="10rem" />
            </span>
          )}
          tabs={(
            <nav className="tabs" aria-hidden>
              {['Members', 'Details', 'Properties', 'Activity'].map((t) => <span key={t} className="sk-tab muted">{t}</span>)}
            </nav>
          )}
        />
        <SkRows rows={4} label="Loading this family or group" />
      </main>
    );
  }
  // A failed read cannot say a group is gone, even with an older list kept.
  if (groups.isError && (!groups.data || !group)) {
    return (
      <main>
        {head('Family or group')}
        <Failed what="This family or group" error={groups.error} onRetry={() => groups.refetch()} boxed h="26rem" />
      </main>
    );
  }
  if (!group) {
    return (
      <main>
        {head('This family or group is not on file', 'Not found')}
        <Empty
          boxed h="20rem" icon="person"
          action={<Link className="btn" to="/groups">All families and groups</Link>}
        >
          It may have been deleted.
        </Empty>
      </main>
    );
  }
  return (
    <main>
      {/* `key` resets the tab's drafts and dialogs if the id changes under
          the same mounted page. */}
      <GroupDetail
        key={group.id}
        group={group}
        tab={params.get('tab') ?? ''}
        onTab={chooseTab}
        onDeleted={() => nav('/groups')}
      />
    </main>
  );
}

function GroupDetail({ group, tab: wantedTab, onTab, onDeleted }: {
  group: GroupRow;
  /** `?tab=` as it stands; anything this group has no tab for is Members. */
  tab: string;
  onTab: (t: TabId) => void;
  onDeleted: () => void;
}) {
  const def = groupTypeDef(group.type);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifiers, setNotifiers] = useState(false);
  /** Where focus lands when the notifier editor closes: "Configure notifiers",
   *  which opened it. "Open the Members tab" hands focus on through
   *  `focusMembers` below instead. */
  const notifierReturn = useRef<HTMLElement | null>(null);
  // The group's land, counted once: the same read Properties makes for
  // `?group=<id>`, so the facts line, the badge, the tile and the tab's rows
  // are one number, and the same number Properties shows on arrival.
  const land = useGroupProperties(group.id);
  const landCount = land.cards?.length;
  const landAcres = useMemo(
    () => (land.cards ?? []).reduce((n, c) => n + inAcres(c), 0), [land.cards]);

  const tabs: TabStripTab<TabId>[] = [
    // `rowCount`, not `memberCount`: a badge beside a tab is a promise about
    // how many rows are behind it, and the table includes your own row.
    { id: 'members', label: 'Members', n: rowCount(group.memberCount) },
    // The group's own facts (country, deed, PAN…), with gaps flagged.
    { id: 'details', label: 'Details' },
    // The badge is the rows in the panel: one per property the group holds.
    { id: 'properties', label: 'Properties', n: landCount },
    // The safeguard contacts family, so only a type with a family tree has
    // one. Its status is a drawn glyph (! or ✓) whose word is the tooltip and
    // part of the tab's accessible name, never a colour alone.
    ...(def.hasTree
      ? [{ id: 'safeguard' as const, label: 'Safeguard', status: safeguardTabStatus(group) }]
      : []),
    { id: 'activity', label: 'Activity' },
  ];
  const tab: TabId = tabs.find((t) => t.id === wantedTab)?.id ?? 'members';
  /** Set by "Open the Members tab": focus the Members tab once it is the tab
   *  on screen. The drawer closes first and hands focus to its opener, and the
   *  tab switch (a router transition) lands a render later and removes that
   *  opener — so the hand-off has to wait for Members, not race the drawer. */
  const focusMembers = useRef(false);
  // Edit is the one visible command; Print and Delete one step removed, in
  // the ⋮, as on the property and holding heads; Delete under a rule. A
  // detail page has no filled primary (design.md § Page head).
  const headActions: DetailActions = {
    secondaries: [{ label: 'Edit', icon: <EditOutlined sx={{ fontSize: 16 }} />, onClick: () => setEditing(true) }],
    overflow: [
      { label: 'Print', icon: <PrintOutlined sx={{ fontSize: 16 }} />, onClick: () => window.print() },
      {
        label: `Delete this ${typeNoun(group.type)}`,
        icon: <DeleteOutlineOutlined sx={{ fontSize: 16 }} />,
        danger: true,
        rule: true,
        onClick: () => setDeleting(true),
      },
    ],
    overflowLabel: `Actions for ${group.name}`,
    overflowHeader: group.name,
  };
  useEffect(() => {
    if (tab !== 'members' || !focusMembers.current) return;
    focusMembers.current = false;
    document.getElementById(`${group.id}-tab-members`)?.focus();
  }, [tab, group.id]);

  return (
    <>
      <PageHead
        crumbs={[{ label: HEAD.title, to: '/groups' }, { label: group.name }]}
        glyph={<span className="avatarlg"><TypeGlyph type={group.type} size={22} /></span>}
        title={group.name}
        actions={headActions}
        tabs={<TabStrip tabs={tabs} value={tab} onChange={onTab} label={`${group.name} detail`} idBase={group.id} />}
        // Facts only, once each, people first. Last active belongs to the
        // safeguard it drives; the land is one tile, not an acre headline.
        meta={(
          <span style={{ display: 'grid', gap: '0.125rem' }}>
            <span>{def.label} · Your role: {roleWord(group.myRole || def.primaryRole)}</span>
            <span>{groupPeopleLine(group, landCount)}</span>
            {group.description && (
              <span style={{ marginTop: '0.25rem', maxWidth: '44rem' }}>{group.description}</span>
            )}
            {!!landCount && (
              <Link
                className="grouptile"
                to={propertiesFor(group.id)}
                aria-label={`${groupLandTile(landCount, landAcres)}. Open them in Properties`}
                style={{ justifySelf: 'start' }}
              >
                <span className="num">{groupLandTile(landCount, landAcres)}</span>
                <ArrowForwardOutlined sx={{ fontSize: 18 }} aria-hidden />
              </Link>
            )}
          </span>
        )}
      />

      <Card>
        <TabPanel idBase={group.id} id={tab}>
          {tab === 'members' && <MembersTab group={group} />}
          {tab === 'details' && <GroupFactsTab group={group} onEdit={() => setEditing(true)} />}
          {tab === 'properties' && <GroupPropertiesTab group={group} land={land} />}
          {tab === 'safeguard' && <SafeguardTab group={group} onConfigure={(opener) => {
            notifierReturn.current = opener;
            setNotifiers(true);
          }} />}
          {tab === 'activity' && <ActivityTab group={group} />}
        </TabPanel>
      </Card>

      {editing && <GroupFormDialog group={group} onClose={() => setEditing(false)} />}
      {deleting && (
        <DeleteGroupDialog group={group} onClose={() => setDeleting(false)} onDeleted={onDeleted} />
      )}
      {notifiers && (
        <NotifierDrawer
          group={group}
          onClose={() => setNotifiers(false)}
          returnFocus={notifierReturn}
          onMembers={() => {
            focusMembers.current = true;
            setNotifiers(false);
            onTab('members');
          }}
        />
      )}
    </>
  );
}

// ── Safeguard ──────────────────────────────────────────────────────────

/**
 * The inactivity safeguard, as its own tab rather than a box above every tab.
 *
 * Headed like a record hanger (SectionHead): the stage is a StatusChip in the
 * sub line beside the facts the server already sends (last active, next
 * check, last outcome), how the safeguard works is behind the ⓘ instead of a
 * standing sentence, and "Configure notifiers" is this tab's one filled
 * action. A problem is a warn chip row, not the accent — the accent is for
 * what you can press — and a routine reminder is a warning, not a danger.
 * The contact-gap chip is the server's `inactiveContactGaps` in
 * contactGapSentence's words; the notifier editor draws the same chip.
 */
function SafeguardTab({ group, onConfigure }: {
  group: GroupRow;
  /** Opens the notifier editor; the button is where focus returns. */
  onConfigure: (opener: HTMLElement) => void;
}) {
  const stage = safeguardStage(group);
  // The line the safeguard box printed, unchanged: the outcome rides on it.
  const facts = group.lastActiveAt || group.inactivityNextAt
    ? [
      group.lastActiveAt ? `You were last active ${ddmmyyyy(group.lastActiveAt)}` : '',
      group.inactivityNextAt ? `Next check ${ddmmyyyy(group.inactivityNextAt)}` : '',
    ].filter(Boolean).join(' · ')
      + (group.inactivityLastOutcome
        ? ` · Last outcome: ${wordFor(SAFEGUARD_OUTCOME_WORD, group.inactivityLastOutcome)}`
        : '')
    : '';
  const delivery = group.inactivityStage === 'delivery_attention';
  const gaps = group.inactiveContactGaps || 0;
  const configureTrigger = useRef<HTMLButtonElement & HTMLAnchorElement>(null);

  return (
    <div className="safeguardtab">
      <SectionHead
        title="Inactivity safeguard"
        sub={<><StatusChip state={stage.state}>{stage.word}</StatusChip>{facts && <> {facts}</>}</>}
        info="After 6 months of inactivity: a reminder to the head, then verified family emails."
        actions={{
          primary: { label: 'Configure notifiers', ref: configureTrigger,
            onClick: () => { if (configureTrigger.current) onConfigure(configureTrigger.current); } },
        }}
      />
      {(delivery || gaps > 0) && (
        <div className="schip-lines" style={{ display: 'grid', gap: 'var(--space-xs)', justifyItems: 'start' }}>
          {delivery && (
            <StatusChip state="warn">Delivery not confirmed. Contact support before retrying.</StatusChip>
          )}
          {gaps > 0 && (
            <StatusChip state="warn">{contactGapSentence(gaps)}</StatusChip>
          )}
        </div>
      )}
    </div>
  );
}

// ── Members ────────────────────────────────────────────────────────────

interface InviteInfo {
  name: string;
  link: string;
  to: string;
}

function MembersTab({ group }: { group: GroupRow }) {
  const q = useGroupMembers(group.id);
  // A share tied to a parcel this group no longer holds (its khata was given
  // another holder) stays on the member, flagged rather than silently true.
  // The same read the Properties tab draws, so "held" means one thing here.
  //
  // Archived records count as held here: the group still holds a parcel it
  // archived, and a share on it is not "no longer held". The list read leaves
  // archived records out unless their facet is ticked, so the archived ones
  // are asked for on their own and the two answers joined.
  const land = useGroupProperties(group.id);
  const archivedLand = useProperties({ ...EMPTY_FILTER, groups: [group.id], statuses: ['archived'] });
  const archivedCards = archivedLand.data && !archivedLand.isPlaceholderData
    ? archivedLand.data.cards : undefined;
  const heldParcels = useMemo(
    () => (land.cards && archivedCards
      ? new Set([...land.cards, ...archivedCards].map((c) => c.id))
      : null),
    [land.cards, archivedCards]);
  const save = useSaveMember();
  const remove = useRemoveMember();
  const invite = useInviteMember();
  const setStatus = useSetMemberStatus();
  const toast = useToast();

  const [form, setForm] = useState<{ editing: GroupMember | null } | null>(null);
  const [removing, setRemoving] = useState<GroupMember | null>(null);
  const [invited, setInvited] = useState<InviteInfo | null>(null);
  // The filter is local state, as Documents' is: the group's `key` remount
  // clears it when another group opens.
  const [sel, setSel] = useState<Record<string, string[]>>({});

  const hasTree = groupTypeDef(group.type).hasTree;
  const members = useMemo(() => q.data?.members ?? [], [q.data?.members]);
  const facets = useMemo(() => memberFacets(members, hasTree), [members, hasTree]);
  // A selection for an option no longer offered (that person was edited or
  // removed) is dropped rather than filtering the table to nothing.
  const active = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of facets) {
      const keep = (sel[f.key] ?? []).filter((k) => f.options.some((o) => o.key === k));
      if (keep.length) out[f.key] = keep;
    }
    return out;
  }, [facets, sel]);
  const shown = members.filter((m) => matchesMember(m, active, hasTree));
  const toggleFacet = (groupKey: string, key: string) => setSel((cur) => {
    const was = cur[groupKey] ?? [];
    return { ...cur, [groupKey]: was.includes(key) ? was.filter((k) => k !== key) : [...was, key] };
  });
  // Your own row is always among them — `members` seats it on every read — so
  // "how many people are in this group besides me" is a filter, not a count.
  const others = members.filter((m) => !m.isSelf).length;
  const heirs = members.filter((m) => m.isBeneficiary);
  const allocated = heirs.reduce((s, m) => s + (Number(m.sharePct) || 0), 0);
  const pending = heirs.filter((m) => m.status === 'pending').length;

  /** PersonDialog owns its own saving state and prints a rejected submit at
   *  the top of its form, so this must THROW rather than swallow — and must
   *  not close the dialog on failure, which would discard a filled-in form. */
  const submit = useCallback(
    async (vars: MemberVars) => {
      const wasEditing = form?.editing ?? null;
      const saved = await save.mutateAsync({
        groupId: group.id,
        memberId: wasEditing?.id ?? null,
        vars,
      });
      setForm(null);
      toast.ok(wasEditing ? `${vars.name || 'That member'} saved` : `${vars.name || 'Member'} added`);
      // A new heir gets a verification link the moment they become one. An
      // existing member who was already an heir does not — they have one.
      if (saved && vars.isBeneficiary && !wasEditing?.isBeneficiary && saved.inviteToken) {
        setInvited({
          name: vars.name,
          link: verifyLink(saved.inviteToken),
          to: saved.isMinor
            ? saved.guardianContact || saved.email || saved.phone
            : saved.email || saved.phone,
        });
      }
    },
    [form, group.id, save, toast],
  );

  const notify = useCallback(
    (msg: string, severity: 'success' | 'error' | 'warning' | 'info' = 'success') => {
      if (severity === 'error' || severity === 'warning') toast.bad(msg);
      else toast.ok(msg);
    },
    [toast],
  );

  const doInvite = async (m: GroupMember) => {
    const to = (m.email || m.phone || '').trim();
    if (!to) {
      toast.bad('Add a mobile number or an email address first, then send the verification link.');
      return;
    }
    try {
      await invite.mutateAsync({ id: m.id });
      toast.ok(`Verification link sent to ${to}`);
    } catch {
      /* the write raised it */
    }
  };

  const doRevoke = async (m: GroupMember) => {
    try {
      await setStatus.mutateAsync({ id: m.id, status: 'revoked' });
      toast.ok(`${m.name || 'That member'}'s access is revoked`);
    } catch {
      /* the write raised it */
    }
  };

  const doRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync({ id: removing.id });
      toast.ok(`${removing.name || 'That member'} removed`);
      setRemoving(null);
    } catch {
      // Left open on purpose: the dialog is the only thing on screen naming
      // who this was about, and the toast explaining the refusal is beside it.
    }
  };

  const rowActions = (m: GroupMember) => {
    const alreadyInvited = m.inviteStatus === 'invited' || (m.status === 'pending' && !!m.inviteToken);
    const acts: {
      label: string; onClick: () => void; danger?: boolean; rule?: boolean;
    }[] = [{ label: 'Edit', onClick: () => setForm({ editing: m }) }];
    if (m.isBeneficiary && m.status !== 'verified') {
      acts.push({
        label: alreadyInvited ? 'Send a reminder' : 'Send the verification link',
        onClick: () => void doInvite(m),
      });
    }
    if (m.status === 'pending' && m.inviteToken) {
      acts.push({
        label: 'Copy the verification link',
        onClick: () => setInvited({
          name: m.name,
          link: verifyLink(m.inviteToken),
          to: m.isMinor ? m.guardianContact || m.email || m.phone : m.email || m.phone,
        }),
      });
    }
    if (m.status && m.status !== 'revoked') {
      acts.push({ label: 'Revoke access', onClick: () => void doRevoke(m) });
    }
    acts.push({
      label: 'Remove from this group', danger: true, rule: true, onClick: () => setRemoving(m),
    });
    return acts;
  };

  // Material data table: a column that is empty for every row is not drawn.
  // Nine columns of dashes for a group of one said nothing nine times.
  const cols = {
    contact: members.some((m) => m.phone || m.email),
    born: members.some((m) => m.dob || m.gender),
    // Outside a family a share is a partner's or shareholder's, not an heir's.
    share: heirs.length > 0 || (!hasTree && members.some((m) => Number(m.sharePct) > 0)),
    listed: heirs.length > 0,
    aadhaar: members.some((m) => m.aadhaarMasked),
    status: members.some((m) => memberStatusChip(m).label !== '—'),
  };

  if (q.isPending) {
    // The heading is a constant; the columns are the two every group prints.
    return (
      <div role="status" aria-busy="true" aria-label="Loading the members of this group">
        <div aria-hidden>
          <SectionHead title="Members" sub={<Sk w="12rem" />}
                       controls={<Sk w="9rem" h="2.25rem" r="var(--radius-pill)" />} />
          <div className="datatable-wrap"><div className="scroll-x">
            <table className="datatable static" style={{ minWidth: 0 }}>
              <thead><tr><th>Name</th><th>{hasTree ? 'Relationship' : 'Role'}</th></tr></thead>
              <tbody>
                {[0, 1, 2].map((i) => (
                  <tr key={i}><td><Sk w={`${9 + i * 2}rem`} /></td><td><Sk w="5rem" /></td></tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </div>
      </div>
    );
  }
  if (q.isError && !q.data) {
    return (
      <Failed what="This group's members" error={q.error} onRetry={() => q.refetch()} h="16rem" />
    );
  }

  return (
    <>
      {/* Facts under the heading, the share rule behind its ⓘ (design.md
          § Page head, ⓘ): "You and 2 others · 2 heirs · 100% allocated". */}
      <SectionHead
        title="Members"
        // No rows at all is a read that did not answer, not "just you".
        sub={members.length > 0 && <>
          {peopleWord(others)}
          {heirs.length > 0 && <>
            {' · '}{plural(heirs.length, 'heir')} ·{' '}
            <strong style={allocated > 100 ? { color: 'var(--w-danger)' } : undefined}>
              {num(allocated)}% allocated
            </strong>
            {/* Over 100% is arithmetic nobody can honour, and the server
                does not refuse it — so at least say so where the shares
                are being typed. */}
            {allocated > 100 && ' — that is more than the whole'}
            {pending > 0 && ` · ${num(pending)} not verified`}
          </>}
        </>}
        // Shares are a percentage only, never acres per person.
        info={heirs.length > 0 ? SHARE_NOTE : undefined}
        actions={{
          primary: { label: 'Add a member', icon: <PersonAddAltOutlined sx={{ fontSize: 16 }} />,
            onClick: () => setForm({ editing: null }) },
        }}
      />

      {/* The shared list filter Properties uses, over the words the table
          prints. A table of one row has nothing to narrow. */}
      {members.length > 1 && (
        <FacetFilter
          groups={facets}
          selected={active}
          onToggle={toggleFacet}
          onClear={() => setSel({})}
          tally={`${num(shown.length)} of ${num(members.length)} shown`}
        />
      )}

      {/* Genuinely zero rows means the server returned nothing for this group,
          which it does when the group is not the caller's — not the same as "a
          new group with only you in it", where your own row is real content
          and shows the role you hold. */}
      {members.length === 0 ? (
        <Empty icon="person" title="No one is listed for this group">
          Reload the page to try again.
        </Empty>
      ) : shown.length === 0 ? (
        <Empty
          boxed
          h="12rem"
          icon="search"
          title="No members match these filters"
          action={<button type="button" className="btn sm" onClick={() => setSel({})}>Clear all</button>}
        />
      ) : (
        <div className="datatable-wrap">
        <div className="scroll-x">
          <table className="datatable static" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>{hasTree ? 'Relationship' : 'Role'}</th>
                {cols.contact && <th>Contact</th>}
                {cols.born && <th>Born</th>}
                {cols.share && <th className="right" style={{ textAlign: 'right' }}>Share</th>}
                {cols.listed && <th>Listed as</th>}
                {cols.aadhaar && <th>Aadhaar</th>}
                {cols.status && <th>Status</th>}
                <th className="menucol" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const st = memberStatusChip(m);
                const parcel = q.data?.parcels.find((p) => p.id === m.parcelId);
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                        <span
                          className="avatarlg"
                          style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.6875rem' }}
                        >
                          {(m.name || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block' }}>{m.name || '—'}</strong>
                          {(m.isSelf || m.isBeneficiary || m.isMinor) && (
                            <span className="row tight" style={{ marginTop: '0.125rem' }}>
                              {m.isSelf && <Chip>You</Chip>}
                              {m.isBeneficiary && <Chip>heir</Chip>}
                              {m.isMinor && <Chip>minor</Chip>}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    {/* One rule with the filter, so an option reads as this cell. */}
                    <td>{memberRelationWord(m, hasTree)}</td>
                    {cols.contact && (
                    <td>
                      {m.phone || m.email ? (
                        <>
                          {m.phone && (
                            <span className="mono" style={{ display: 'block', whiteSpace: 'nowrap' }}>
                              {m.phone}{m.phoneVerified && <span className="up" title="Verified"> ✓</span>}
                            </span>
                          )}
                          {m.email && (
                            <span className="note" style={{ display: 'block' }}>
                              {m.email}{m.emailVerified && <span className="up" title="Verified"> ✓</span>}
                            </span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    )}
                    {cols.born && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {m.dob ? fmtLocal(m.dob, { dateOnly: true }) : '—'}
                      {m.gender && (
                        <span className="note" style={{ display: 'block' }}>{cap(m.gender)}</span>
                      )}
                    </td>
                    )}
                    {cols.share && (
                    <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {m.isBeneficiary ? (
                        <>
                          {num(Number(m.sharePct) || 0)}%
                          <span className="note" style={{ display: 'block' }}>
                            {shareWhere(group.type, parcel?.surveyNo)}
                          </span>
                          {m.parcelId && heldParcels && !heldParcels.has(m.parcelId) && (
                            <span className="note" data-testid="share-not-held"
                                  style={{ display: 'block', color: 'var(--w-warn)' }}>
                              No longer held by this group
                            </span>
                          )}
                        </>
                      ) : !hasTree && Number(m.sharePct) > 0 ? `${num(Number(m.sharePct))}%` : '—'}
                    </td>
                    )}
                    {cols.listed && (
                    <td>
                      {m.isBeneficiary ? (KIND_WORD[m.kind] ?? (cap(m.kind) || '—')) : '—'}
                    </td>
                    )}
                    {cols.aadhaar && <td className="mono" style={{ whiteSpace: 'nowrap' }}>{formatAadhaarMask(m.aadhaarMasked) || '—'}</td>}
                    {cols.status && (
                    <td>
                      {st.label === '—'
                        ? '—'
                        : <State state={STATE_OF[st.color] ?? 'unknown'}>{st.label}</State>}
                      {m.heirConfirmed === 'agreed' && (
                        <span className="note" style={{ display: 'block' }}>Confirmed by them</span>
                      )}
                      {m.heirConfirmed === 'disputed' && (
                        <span className="note" style={{ display: 'block', color: 'var(--w-warn, inherit)' }}
                              title={m.heirNote || undefined}>
                          Asked for a correction{m.heirNote ? `: “${m.heirNote}”` : ''}
                        </span>
                      )}
                    </td>
                    )}
                    <td className="menucol">
                      <Menu
                        label={`Actions for ${m.name || 'this member'}`}
                        header={m.name || undefined}
                        items={rowActions(m)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {form && (
        <Suspense fallback={null}>
          <PersonDialog
            open
            editing={form.editing}
            people={members}
            parcels={q.data?.parcels ?? []}
            myAddress={q.data?.myAddress ?? ''}
            groupType={group.type}
            groupFacts={group.facts}
            onCancel={() => setForm(null)}
            onSubmit={submit}
            notify={notify}
          />
        </Suspense>
      )}

      {removing && (
        <Dialog
          title={`Remove ${removing.name || 'this member'}?`}
          busy={remove.isPending}
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button
                type="button"
                className="btn"
                disabled={remove.isPending}
                onClick={() => setRemoving(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={remove.isPending}
                onClick={() => void doRemove()}
              >
                {remove.isPending ? 'Removing…' : 'Remove'}
              </button>
            </>
          }
        >
          <p className="note" style={{ marginTop: 0 }}>
            Their relationship, share and verification status are removed.
          </p>
        </Dialog>
      )}

      {invited && <InviteDialog invite={invited} onClose={() => setInvited(null)} />}
    </>
  );
}

// ── Properties: what the group holds ─────────────────────────────────

/** Properties, opened on this group as its Holder filter. */
const propertiesFor = (id: string) => `/properties?group=${encodeURIComponent(id)}`;

/**
 * The properties a group holds: `properties(groups: [id])`, the very query
 * Properties runs for `?group=<id>`. The cache key is the same, so the two
 * screens share one answer. `cards` is undefined until the first answer for
 * THIS group is in — a placeholder held over from another group is not this
 * group's count.
 */
function useGroupProperties(groupId: string) {
  const q = useProperties({ ...EMPTY_FILTER, groups: [groupId] });
  const cards = q.data && !q.isPlaceholderData ? q.data.cards : undefined;
  return { query: q, cards };
}
type GroupProperties = ReturnType<typeof useGroupProperties>;

/**
 * A family or group's properties, in the Properties List view's own table
 * (founder, 08/10/2026: one pattern, at a high level, and a row opens the
 * property). "Held by" is left out — it is this group on every row — and
 * "Holding" stays. No filter, map or export of its own: the link under the
 * table opens Properties with this group as its Holder filter for those.
 *
 * Taking a property out goes through the one holder dialog (SetHolderDialog),
 * started on your own name, so the khata warning — the other parcels on the
 * same khata come out too — is said before anything moves, in the words
 * "Set holder" uses.
 */
function GroupPropertiesTab({ group, land }: { group: GroupRow; land: GroupProperties }) {
  const nav = useNavigate();
  const assign = useAssignHolder();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [sort, setSort] = useState<Sort>(null);
  const [takingOut, setTakingOut] = useState<RecordCard | null>(null);
  const [editing, setEditing] = useState<RecordCard | null>(null);

  const { query, cards } = land;
  const rows = useMemo(() => sortRows(cards ?? [], sort), [cards, sort]);

  if (!cards && query.isError) {
    return (
      <Failed what="This group's properties" error={query.error} onRetry={() => query.refetch()} h="16rem" />
    );
  }
  if (!cards) {
    return (
      <>
        <SectionHead title="Properties" sub={<Sk w="8rem" />}
                     controls={<Sk w="9rem" h="2.25rem" r="var(--radius-pill)" />} />
        <SkTable label="Loading this group's properties" select={false} minWidth="52rem" cols={[
          { head: 'Property' }, { head: 'Owner' }, { head: 'Where' }, { head: 'Holding' }, { head: 'Status' },
          { head: 'Extent', right: true }, { head: 'Market estimate', right: true },
        ]} rows={3} />
      </>
    );
  }

  const addButton = (primary: boolean) => (
    <button type="button" className={primary ? 'btn primary' : 'btn'} onClick={() => setAdding(true)}>
      <AddOutlined sx={{ fontSize: 16 }} /> Add a property
    </button>
  );

  return (
    <>
      {cards.length === 0 ? (
        <Empty icon="agri" title={`Nothing is held by this ${typeNoun(group.type)} yet`} action={addButton(true)} />
      ) : (
        <>
          <SectionHead
            title="Properties"
            sub={<span className="num">{groupLandTile(cards.length, cards.reduce((n, c) => n + inAcres(c), 0))}</span>}
            actions={{ secondaries: [{ label: 'Add a property', icon: <AddOutlined sx={{ fontSize: 16 }} />,
              onClick: () => setAdding(true) }] }}
          />

          <PropertyTable
            rows={rows}
            sort={sort}
            setSort={setSort}
            hideHolder
            label={`Properties held by ${group.name}`}
            style={{ opacity: query.isFetching ? 0.6 : 1, transition: 'opacity var(--dur-fast) var(--ease-out)' }}
            menu={(r) => [
              { label: 'Open', onClick: () => nav(`/properties/${encodeURIComponent(r.id)}`) },
              { label: `Take out of this ${typeNoun(group.type)}`, onClick: () => setTakingOut(r) },
              ...recMenu(r, {
                onEdit: (rec) => setEditing(rec),
                onOrder: (rec) => nav(orderHref(rec.id)),
                onShare: (rec) => nav(`/properties/${encodeURIComponent(rec.id)}?share=1`),
              }).map((item, i) => (i === 0 ? { ...item, rule: true } : item)),
            ]}
          />

          <p className="note grouprows-foot">{GROUP_LAND_DISCLAIMER}</p>
          <p className="note" style={{ margin: 0 }}>
            <Link className="accent" to={propertiesFor(group.id)}>
              Open these in Properties for map, filters and export
            </Link>
          </p>
        </>
      )}

      {takingOut && (
        <SetHolderDialog
          title={`Take out of ${group.name}`}
          records={[takingOut]}
          initialTarget={PERSONAL}
          onClose={() => setTakingOut(null)}
          onDone={(moved) => {
            // Worded from what actually moved: the holder can be changed in
            // the dialog, and the khata's other parcels go with this one.
            const where = moved.groupId ? `now held by ${moved.holderLabel}` : 'in your own name again';
            const also = moved.siblings > 0
              ? `, with ${plural(moved.siblings, 'other parcel')} on its khata` : '';
            toast.ok(`${takingOut.title} is ${where}${also}`);
            setTakingOut(null);
          }}
        />
      )}
      {editing && <RecordDrawer card={editing} onClose={() => setEditing(null)} />}

      {adding && (
        <AssignHolderDialog
          group={group}
          busy={assign.isPending}
          onClose={() => setAdding(false)}
          onPick={async (card) => {
            try {
              const moved = await assign.mutateAsync({
                kind: card.kind === 'property' ? 'property' : 'parcel',
                passbookId: card.passbookId,
                recordId: card.id,
                groupId: group.id,
              });
              const along = moved?.siblingCount ?? 0;
              toast.ok(along > 0
                ? `${card.title} and ${plural(along, 'other parcel')} on its khata are now held by ${group.name}`
                : `${card.title} is now held by ${group.name}`);
              setAdding(false);
            } catch {
              /* the write raised it; the dialog stays open */
            }
          }}
        />
      )}
    </>
  );
}

/**
 * Set this group as the holder of something now in your own name or held by
 * another of your groups.
 *
 * The list is `groups: ['personal', …every other group]` — the Properties
 * screen's own Holder facet — so it is exactly what that screen shows for
 * those options, and this group's own properties never appear. Each row says
 * who holds it now ("In your own name", "In Reddy Family (parents)"), your own
 * name first; moving one out of another group is the same write that moves it
 * in from your own name, because a property has one holder.
 *
 * A parcel names its khata out loud. A parcel is held through its khata, so
 * `setRecordHolder` moves every parcel on that passbook. Somebody choosing one
 * survey number out of four is entitled to know that before they choose, not
 * after.
 */
function AssignHolderDialog({
  group, busy, onClose, onPick,
}: {
  group: GroupRow;
  busy: boolean;
  onClose: () => void;
  onPick: (card: RecordCard) => void | Promise<void>;
}) {
  const all = useGroups();
  const groups = useMemo(() => all.data ?? [], [all.data]);
  const others = groups.filter((g) => g.id !== group.id).map((g) => g.id);
  const free = useProperties({ ...EMPTY_FILTER, groups: [PERSONAL_GROUP, ...others] });
  const cards = useMemo(
    () => movableProperties(free.data?.cards ?? [], group.id, groups),
    [free.data?.cards, group.id, groups],
  );

  /** How many other parcels ride along on the same khata. */
  const alsoOnKhata = (c: RecordCard) =>
    c.kind === 'parcel' && c.passbookId
      ? cards.filter((o) => o.kind === 'parcel' && o.passbookId === c.passbookId && o.id !== c.id).length
      : 0;

  return (
    <Dialog
      title={`Add a property to ${group.name}`}
      onClose={onClose}
      busy={busy}
      wide
      footer={<button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>}
    >
      {free.isPending && !free.data && (
        <div role="status" aria-busy="true" aria-label="Loading what you could move in">
          <div className="rows boxed" style={{ marginTop: 0 }}><SkRowItems rows={3} /></div>
        </div>
      )}
      {free.isError && !free.data && (
        <Failed what="Your properties" error={free.error} onRetry={() => free.refetch()} h="10rem" />
      )}
      {free.data && cards.length === 0 && (
        <Empty icon="agri" title="Nothing to move in">
          Everything you own is already held by {group.name}.
        </Empty>
      )}
      {cards.length > 0 && (
        <div className="rows boxed" style={{ marginTop: 0 }}>
          {cards.map((c) => {
            const along = alsoOnKhata(c);
            return (
              <div key={c.id}>
                <span className="muted" style={{ display: 'flex', color: 'var(--w-info)' }}>
                  <Icon name={c.kind === 'parcel' ? 'agri' : c.classification} size={18} />
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem' }}>
                    {c.title}
                  </span>
                  <span className="note" style={{ display: 'block' }}>
                    {[c.holder,
                      c.kind === 'parcel' ? 'Parcel' : statusWord(c.classification),
                      c.placeLine,
                      c.khataNo ? `Khata ${c.khataNo}` : ''].filter(Boolean).join(' · ')}
                  </span>
                  {along > 0 && (
                    <span className="note accent" style={{ display: 'block' }}>
                      Moves the whole khata. {plural(along, 'other parcel')} on it{' '}
                      {along === 1 ? 'comes' : 'come'} too.
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn sm"
                  disabled={busy}
                  onClick={() => void onPick(c)}
                >
                  Move in
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

// ── Activity ───────────────────────────────────────────────────────────

function ActivityTab({ group }: { group: GroupRow }) {
  const q = useGroupActivity(group.id);
  const events = q.data ?? [];
  // An event log: newest first as read, no sort, no sums; paged, and tickable for Export.
  const paged = usePaged(events, { storeKey: 'pattadar.table.groupActivity' });
  const sel = useRowSelection(events, idOf);

  if (q.isPending) {
    return (
      <>
        <SectionHead title="Activity" sub={<Sk w="6rem" />} />
        <SkTable label="Loading this group's activity" minWidth="34rem" rows={4}
                 cols={[{ head: 'What' }, { head: 'Detail' }, { head: 'When', w: '7rem' }]} />
      </>
    );
  }
  if (q.isError && !q.data) {
    return <Failed what="This group's activity" error={q.error} onRetry={() => q.refetch()} h="12rem" />;
  }
  if (events.length === 0) {
    return (
      <Empty icon="clock" title="No activity yet" />
    );
  }

  return (
    <>
    {/* shortcut: groupActivity returns at most the latest 50 (main.py LIMIT 50),
        so a full answer is not the group's total; send a total if that changes. */}
    <SectionHead title="Activity"
      sub={events.length >= 50 ? `Latest ${num(events.length)} events` : plural(events.length, 'event')} />
    <Card flush className="scroll-x edgefade">
      <table className="rectable" aria-label="Activity" style={{ minWidth: '34rem' }}>
        <thead>
          <tr>
            <th className="selcol">
              <SelectAllBox total={events.length} picked={sel.picked.length} noun={['event', 'events']}
                            onToggle={sel.toggleAll} />
            </th>
            <th>What</th>
            <th>Detail</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {paged.shown.map((e) => (
            <tr key={e.id} className={sel.selected.has(e.id) ? 'selected' : undefined}>
              <SelectCell checked={sel.selected.has(e.id)} label={`Select ${wordFor(GROUP_ACTION_WORD, e.action)}`}
                          onToggle={() => sel.toggle(e.id)} />
              <td style={{ whiteSpace: 'nowrap' }}>{wordFor(GROUP_ACTION_WORD, e.action)}</td>
              <td>{e.details || '—'}</td>
              <td className="note" style={{ whiteSpace: 'nowrap' }}>
                {e.timestamp ? fmtLocal(e.timestamp) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="selcol" />
            <th scope="row" colSpan={3}>
              {sel.picked.length > 0
                ? `${plural(sel.picked.length, 'event')} selected`
                : `Total · ${plural(events.length, 'event')}`}
            </th>
          </tr>
        </tfoot>
      </table>
    </Card>
    <TablePager {...paged} onSize={paged.setSize} label="Activity pages" />
    <SelectionBar count={sel.picked.length} noun={['event', 'events']}
                  label="Act on the selected events" onClear={sel.clear}>
      <button type="button" className="btn sm" onClick={() => downloadCsv('group-activity.csv', [
        ['What', 'Detail', 'When'],
        ...sel.picked.map((e) => [wordFor(GROUP_ACTION_WORD, e.action), e.details,
          e.timestamp ? fmtLocal(e.timestamp) : '']),
      ])}>
        <FileDownloadOutlined sx={{ fontSize: 15 }} /> Export
      </button>
    </SelectionBar>
    </>
  );
}

// ── Create / edit a group ──────────────────────────────────────────────

function GroupFormDialog({
  group, onClose, onCreated,
}: {
  group?: GroupRow;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const toast = useToast();
  const all = useGroups();
  const editing = !!group;

  const [type, setType] = useState(group?.type ?? 'family');
  const [name, setName] = useState(group?.name ?? '');
  const [desc, setDesc] = useState(group?.description ?? '');
  // An absent country is India (every group made before countries existed).
  const [facts, setFacts] = useState<Facts>(() => ({ country: 'IN', ...parseFacts(group?.facts) }));
  const [err, setErr] = useState('');
  const fields = groupTypeDef(type).fields;
  const missing = missingFacts(fields, facts);

  const busy = create.isPending || update.isPending;
  const formId = editing ? 'group-edit' : 'group-new';
  // Two "Reddy Family" rows cannot be told apart in any picker. A note, not a
  // refusal — the server allows it and the owner may mean it.
  const clash = sameNamedGroup(name, all.data ?? [], group?.id ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr('Give the group a name.');
      return;
    }
    const bad = visibleFields(fields, facts).map((f) => factError(f, facts[f.key] || '')).find(Boolean);
    if (bad) {
      setErr(bad);
      return;
    }
    // A new group needs its required facts; an old one being edited may still
    // lack them, so a rename never blocks on them (the Details tab flags gaps).
    if (!editing && missing.length) {
      setErr(`Fill in ${missing.map((f) => f.label).join(', ')}.`);
      return;
    }
    setErr('');
    const picked = pickFacts(fields, facts);
    try {
      if (group) {
        await update.mutateAsync({ id: group.id, name: name.trim(), description: desc.trim(), facts: picked });
        toast.ok('Saved');
      } else {
        const id = await create.mutateAsync({ type, name: name.trim(), description: desc.trim(), facts: picked });
        // createGroup returns '' when the payload had no id on it. Reporting
        // success here and then selecting nothing is how a create that did not
        // happen looks like one that did.
        if (!id) {
          setErr('The server did not say which group it created. Reload and check before trying again.');
          return;
        }
        toast.ok(`${name.trim()} created`);
        onCreated?.(id);
      }
      onClose();
    } catch {
      // The write raised the toast. The dialog stays open with the typed work
      // in it, which is the whole reason this catch is not a rethrow.
    }
  };

  return (
    <Dialog
      title={editing ? `Edit ${group.name}` : 'New family or group'}
      onClose={onClose}
      busy={busy}
      // Holding typed work: only Cancel and Escape close it, never a stray
      // click on the scrim.
      dismissable={false}
      initialFocus="#group-name"
      footer={
        <>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" form={formId} className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Add the group'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 'var(--space-md)' }}>
        {err && (
          <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{err}</p>
        )}

        {editing ? (
          /* update_group takes name, description and facts — the resolver has
             no `type` argument at all. A select here would look editable, save
             without complaint and leave the type exactly as it was. */
          <div className="field">
            <label>Type</label>
            <p className="note" style={{ margin: 0 }}>
              {groupTypeDef(group.type).label} · cannot be changed
            </p>
          </div>
        ) : (
          <div className="field">
            <label>What kind of group</label>
            <div className="choice">
              {GROUP_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  aria-pressed={type === t.type}
                  onClick={() => {
                    // Another type's details would carry over into fields it does not have.
                    setType(t.type);
                    setFacts((cur) => ({ country: cur.country || 'IN' }));
                    setErr('');
                  }}
                >
                  {t.label}
                  <small>{TYPE_BLURB[t.type] ?? ''}</small>
                </button>
              ))}
            </div>
            <span className="note">This cannot be changed later.</span>
          </div>
        )}

        <FactInputs
          idBase={formId}
          fields={fields}
          facts={facts}
          onChange={(key, v) => {
            setFacts((cur) => {
              const next = { ...cur, [key]: v };
              // Selling Waqf land needs the Waqf Board's sanction.
              if (key === 'sub_kind' && v === 'Waqf' && !cur.sanction) next.sanction = 'Yes';
              return next;
            });
            setErr('');
          }}
        />
        {editing && missing.length > 0 && (
          <span role="status" className="schip-lines">
            <StatusChip state="warn">Still missing: {missing.map((f) => f.label).join(', ')}</StatusChip>
          </span>
        )}

        <div className="field">
          <label htmlFor="group-name">Name</label>
          <input
            id="group-name"
            type="text"
            value={name}
            maxLength={160}
            placeholder="Telukutla Family / Reddy &amp; Sons"
            aria-describedby={clash ? 'group-name-same' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setErr('');
            }}
          />
          {clash && (
            <span id="group-name-same" role="status" className="schip-lines">
              <StatusChip state="warn">{sameNameNote(type)}</StatusChip>
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="group-desc">Description</label>
          <textarea
            id="group-desc"
            rows={3}
            value={desc}
            maxLength={2000}
            onChange={(e) => setDesc(e.target.value)}
          />
          <span className="note">Optional</span>
        </div>
      </form>
    </Dialog>
  );
}

/** One input per visible fact, in catalogue order: a country list, a select,
 *  a date or text. A format problem shows under its field and blocks saving;
 *  a PAN whose 4th letter does not fit the entity is a warning only. */
function FactInputs({ idBase, fields, facts, onChange }: {
  idBase: string;
  fields: FactField[];
  facts: Facts;
  onChange: (key: string, value: string) => void;
}) {
  const countries = useMemo(() => countryOptions(), []);
  const today = todayIso();
  return (
    <>
      {visibleFields(fields, facts).map((f) => {
        const id = `${idBase}-${f.key}`;
        const v = facts[f.key] ?? '';
        const error = factError(f, v);
        const warn = error ? '' : panWarn(f, v, facts);
        const note = [f.help, f.required ? '' : 'Optional'].filter(Boolean).join(' ');
        const describedBy = [note && `${id}-note`, (error || warn) && `${id}-check`].filter(Boolean).join(' ');
        const common = {
          id,
          'aria-describedby': describedBy || undefined,
          'aria-invalid': error ? true : undefined,
        };
        let input: ReactNode;
        if (f.kind === 'country') {
          const code = v || f.default || 'IN';
          input = (
            <select {...common} className="input" value={code} onChange={(e) => onChange(f.key, e.target.value)}>
              {/* A stored code this list does not carry still shows as itself. */}
              {!COUNTRY_CODES.includes(code) && <option value={code}>{countryName(code)}</option>}
              {countries.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          );
        } else if (f.kind === 'select') {
          input = (
            <select {...common} className="input" value={v} onChange={(e) => onChange(f.key, e.target.value)}>
              <option value="">Choose…</option>
              {v && !(f.options ?? []).includes(v) && <option value={v}>{v}</option>}
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          );
        } else {
          input = (
            <input
              {...common}
              type={f.kind === 'date' ? 'date' : 'text'}
              value={v}
              max={f.kind === 'date' && f.past ? today : undefined}
              maxLength={f.kind === 'text' ? 200 : undefined}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          );
        }
        return (
          <div className="field" key={f.key}>
            <label htmlFor={id}>{f.label}</label>
            {input}
            {note && <span id={`${id}-note`} className="note">{note}</span>}
            {(error || warn) && (
              <span id={`${id}-check`} role="status" className="schip-lines">
                <StatusChip state={error ? 'bad' : 'warn'}>{error || warn}</StatusChip>
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

/** The Details tab: the group's type and every fact its type carries, dates
 *  day first, a required gap flagged rather than left blank. */
function GroupFactsTab({ group, onEdit }: { group: GroupRow; onEdit: () => void }) {
  const def = groupTypeDef(group.type);
  const facts = parseFacts(group.facts);
  const word = (f: FactField, v: string) =>
    f.kind === 'country' ? countryName(v || 'IN') : f.kind === 'date' ? ddmmyyyy(v) : v;
  return (
    <div style={{ display: 'grid', gap: 'var(--space-md)', justifyItems: 'start' }}>
      <KV
        as="dl"
        rows={[
          { k: 'Type', v: def.label },
          ...visibleFields(def.fields, facts).map((f) => {
            const v = facts[f.key] || '';
            return {
              k: f.label,
              v: v || f.kind === 'country'
                ? <span className={f.kind === 'date' ? 'num' : undefined}>{word(f, v)}</span>
                : f.required ? <StatusChip state="warn">Missing</StatusChip> : '—',
            };
          }),
        ]}
      />
      <button type="button" className="btn" onClick={onEdit}>
        <EditOutlined sx={{ fontSize: 16 }} /> Edit details
      </button>
    </div>
  );
}

function DeleteGroupDialog({
  group, onClose, onDeleted,
}: {
  group: GroupRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const del = useDeleteGroup();
  const toast = useToast();

  const run = async () => {
    try {
      await del.mutateAsync({ id: group.id });
      toast.ok(`${group.name} deleted`);
      onDeleted();
      onClose();
    } catch {
      /* the write raised it; the dialog stays so the name is still on screen */
    }
  };

  return (
    <Dialog
      title={`Delete ${group.name}?`}
      onClose={onClose}
      busy={del.isPending}
      footer={
        <>
          <button type="button" className="btn" disabled={del.isPending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={del.isPending}
            onClick={() => void run()}
          >
            {del.isPending ? 'Deleting…' : 'Delete this group'}
          </button>
        </>
      }
    >
      <p className="note" style={{ marginTop: 0, maxWidth: '32rem' }}>
        This removes the group and everyone listed in it. It cannot be undone.
      </p>
    </Dialog>
  );
}

// ── Notifier priority ──────────────────────────────────────────────────

/**
 * Who is contacted once the head misses every reminder, in the shared
 * right-side Drawer the record add/edit flows use: eyebrow, title, one sub
 * line, and a pinned footer with Save first.
 *
 * The contact gap is the server's `inactiveContactGaps`, drawn as the same
 * warn chip and sentence the Safeguard tab shows (contactGapSentence), with a
 * way to the Members tab where it is fixed. The editor does not count the gap
 * itself; `isEligibleNotifier` only lists who can be added.
 */
function NotifierDrawer({ group, onClose, onMembers, returnFocus }: {
  group: GroupRow;
  onClose: () => void;
  /** Close this and open the Members tab, where emails and consent are fixed. */
  onMembers: () => void;
  /** The drawer's fallback focus on close: the opener, or the Members tab
   *  after onMembers (the opener is gone with the Safeguard tab by then). */
  returnFocus: React.RefObject<HTMLElement | null>;
}) {
  const q = useNotifiers(group.id, true);
  const save = useSetNotifiers();
  const toast = useToast();
  const saveId = useId();
  const whyId = useId();
  /** Bumped by every refused save, so the effect below can hand focus back to
   *  Save once the button is enabled again. */
  const [failures, setFailures] = useState(0);

  type Pick = { id: string; name: string; relation: string; email: string };
  const [order, setOrder] = useState<Pick[] | null>(null);
  const [mode, setMode] = useState<'all' | 'selected' | null>(null);
  const loaded = q.data;
  const configured = loaded?.notifiers.some((n) => n.priority > 0) ?? false;
  const currentMode = mode ?? (configured ? 'selected' : 'all');
  const current = useMemo(() => {
    if (order) return order;
    if (!loaded || !configured) return [];
    return loaded.notifiers
      .filter((n) => n.eligible)
      .map((n) => ({ id: n.memberId, name: n.name, relation: n.relation, email: n.contact }));
  }, [configured, loaded, order]);

  const eligible = (loaded?.members ?? [])
    .filter(isEligibleNotifier)
    .map((m) => ({ id: m.id, name: m.name, relation: m.relation || m.role, email: m.email }));
  const gaps = group.inactiveContactGaps || 0;
  const outside = eligible.filter((m) => !current.some((o) => o.id === m.id));

  const move = (at: number, by: number) => {
    const to = at + by;
    if (to < 0 || to >= current.length) return;
    const next = [...current];
    [next[at], next[to]] = [next[to], next[at]];
    setOrder(next);
  };

  const persist = async () => {
    const ids = currentMode === 'all' ? [] : current.map((o) => o.id);
    try {
      await save.mutateAsync({ groupId: group.id, memberIds: ids });
      toast.ok(currentMode === 'all' ? 'All verified family emails will be contacted together' : 'Notifiers saved');
      onClose();
    } catch {
      // The write raised the toast, worded for this mode. Save is disabled
      // while pending, which drops focus to <body>; the effect puts it back.
      setFailures((n) => n + 1);
    }
  };

  useEffect(() => {
    if (failures > 0 && !save.isPending) document.getElementById(saveId)?.focus();
  }, [failures, save.isPending, saveId]);

  // A disabled Save says why, pinned above the footer.
  const why = !loaded
    ? ''
    : eligible.length === 0
      ? 'No family member has a verified email yet.'
      : currentMode === 'selected' && current.length === 0
        ? 'Add at least one verified family email to choose who is notified first.'
        : '';

  /** One row, for both modes, so the two cannot drift: the ordered list passes
   *  its number and its controls; "together" passes neither, because an order
   *  number would claim an order that does not exist. */
  const notifierRow = (m: Pick, lead?: ReactNode, controls?: ReactNode) => (
    <div key={m.id}>
      {lead !== undefined && (
        <span className="avatarlg" style={{ width: '1.75rem', height: '1.75rem', fontSize: '0.6875rem' }}>
          {lead}
        </span>
      )}
      <span className="grow">
        <span style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem' }}>{m.name}</span>
        <span className="note" style={{ display: 'block' }}>
          {[m.relation ? relMeta(m.relation).label : '', m.email].filter(Boolean).join(' · ')}
        </span>
      </span>
      {controls}
    </div>
  );

  return (
    <Drawer
      eyebrow={drawerEyebrow(group.name, 'Safeguard')}
      title="Inactivity notifications"
      sub="Contacted only after the head misses every activity reminder."
      onClose={onClose}
      busy={save.isPending}
      returnFocus={returnFocus}
      // The change from one selector to the other is what re-runs
      // useFocusTrap's focus once the settings land: the panel while they
      // load, then the checked radio.
      initialFocus={loaded ? 'input[name="notifier-mode"]:checked' : '.drawerbody'}
      primaryWhy={why ? { id: whyId, text: why } : undefined}
      primary={
        <DrawerAction
          id={saveId}
          submit={false}
          label="Save notification settings"
          working="Saving…"
          pending={save.isPending}
          paused={save.isPaused}
          disabled={!loaded || q.isError || !!why}
          describedBy={why ? whyId : undefined}
          onClick={() => void persist()}
        />
      }
    >
      {q.isPending && (
        <div role="status" aria-busy="true" aria-label="Loading the current notification settings">
          <fieldset className="share-paper-picker" aria-hidden disabled>
            <legend>Who should be contacted?</legend>
            <label><Sk w="1rem" h="1rem" r="var(--radius-pill)" /><Sk w="80%" /></label>
            <label><Sk w="1rem" h="1rem" r="var(--radius-pill)" /><Sk w="65%" /></label>
          </fieldset>
        </div>
      )}
      {q.isError && (
        <Failed what="The notification settings" error={q.error} onRetry={() => q.refetch()} h="8rem" />
      )}

      {loaded && (
        <>
          <fieldset className="share-paper-picker">
            <legend>Who should be contacted?</legend>
            <label>
              <input
                type="radio"
                name="notifier-mode"
                checked={currentMode === 'all'}
                onChange={() => setMode('all')}
              />
              <span>Email all family members with a verified email together</span>
            </label>
            <label>
              <input
                type="radio"
                name="notifier-mode"
                checked={currentMode === 'selected'}
                onChange={() => setMode('selected')}
              />
              <span>Email selected family members in order</span>
            </label>
          </fieldset>

          {gaps > 0 && (
            <div className="schip-lines" style={{ display: 'grid', gap: 'var(--space-xs)', justifyItems: 'start' }}>
              <StatusChip state="warn">{contactGapSentence(gaps)}</StatusChip>
              <button type="button" className="linkbtn" onClick={onMembers}>
                Open the Members tab
              </button>
            </div>
          )}

          {currentMode === 'all' ? (
            eligible.length > 0 && (
              <>
                <p className="note" style={{ margin: 0 }}>
                  {plural(eligible.length, 'verified family email')} will be contacted together.
                </p>
                <div className="rows boxed">{eligible.map((m) => notifierRow(m))}</div>
              </>
            )
          ) : (
            <>
              {current.length > 0 && (
                <div className="rows boxed">
                  {current.map((m, i) => notifierRow(m, i + 1, (
                    <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                      <button
                        type="button"
                        className="iconbtn"
                        style={{ minWidth: '2.75rem', minHeight: '2.75rem' }}
                        aria-label={`Move ${m.name} up`}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUpwardOutlined sx={{ fontSize: 16 }} />
                      </button>
                      <button
                        type="button"
                        className="iconbtn"
                        style={{ minWidth: '2.75rem', minHeight: '2.75rem' }}
                        aria-label={`Move ${m.name} down`}
                        disabled={i === current.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDownwardOutlined sx={{ fontSize: 16 }} />
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => setOrder(current.filter((_x, x) => x !== i))}
                      >
                        Take out
                      </button>
                    </span>
                  )))}
                </div>
              )}

              {outside.length > 0 && (
                <div className="field">
                  <label htmlFor="notif-add">Add a verified family email</label>
                  <select
                    id="notif-add"
                    value=""
                    onChange={(e) => {
                      const member = eligible.find((x) => x.id === e.target.value);
                      if (member) setOrder([...current, member]);
                    }}
                  >
                    <option value="">Choose a member…</option>
                    {outside.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.relation ? `${member.name} — ${relMeta(member.relation).label}` : member.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Drawer>
  );
}

// ── The verification link ──────────────────────────────────────────────

function InviteDialog({ invite, onClose }: { invite: InviteInfo; onClose: () => void }) {
  const toast = useToast();
  // Never claims a legal status the person may not have (an heir can be a
  // nominee or a legal heir, not a co-owner): naming standard E5.
  const msg = `Hi ${invite.name}, you have been listed in a family on Pattadar. `
    + `Check how you are listed and confirm: ${invite.link}`;

  const hand = (label: string, href: string, icon: ReactNode) => (
    <a className="btn sm" href={href} target="_blank" rel="noreferrer">
      {icon} {label}
    </a>
  );

  return (
    <Dialog
      title="Verification link"
      onClose={onClose}
      footer={<button type="button" className="btn primary" onClick={onClose}>Done</button>}
    >
      <p className="note" style={{ marginTop: 0, maxWidth: '34rem' }}>
        Send this to <strong>{invite.name}</strong>
        {invite.to ? ` (${invite.to})` : ''}.
      </p>
      <div className="row tight" style={{ flexWrap: 'nowrap', marginBottom: 'var(--space-sm)' }}>
        <input className="grow mono" type="text" readOnly value={invite.link} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigator.clipboard.writeText(invite.link)
              .then(() => toast.ok('Link copied'))
              .catch(() => toast.bad('Could not copy the link. Select it and copy by hand.'));
          }}
        >
          <ContentCopyOutlined sx={{ fontSize: 15 }} /> Copy
        </button>
      </div>
      <div className="row tight">
        {hand('WhatsApp', `https://wa.me/?text=${encodeURIComponent(msg)}`, <WhatsApp sx={{ fontSize: 15 }} />)}
        {hand(
          'SMS',
          `sms:${invite.to.startsWith('+') ? invite.to.replace(/\s/g, '') : ''}?&body=${encodeURIComponent(msg)}`,
          <SmsOutlined sx={{ fontSize: 15 }} />,
        )}
        {hand(
          'Email',
          `mailto:${invite.to.includes('@') ? invite.to : ''}?subject=${encodeURIComponent('Confirm how you are listed on Pattadar')}&body=${encodeURIComponent(msg)}`,
          <EmailOutlined sx={{ fontSize: 15 }} />,
        )}
      </div>
    </Dialog>
  );
}
