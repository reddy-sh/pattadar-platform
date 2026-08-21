/** W02 — one faceted list for everything you hold. A khata and a flat are both
 *  "a thing I own", so there is one list and a rail of facets, not five
 *  dropdowns and two tabs.
 *
 *  The rail's counts and the grid come out of a single server query, so the
 *  rail can never claim "For sale 2" while the grid renders three.
 *
 *  Every action on this screen is real: Add/Edit open the drawer, the kebab on
 *  a card or a row edits, archives or deletes that record, the bulk bar acts
 *  on the selection (or on everything shown when nothing is selected, which is
 *  what its resting labels already promise), and Export writes the visible
 *  list to a CSV. Archived records leave the list and the sums until the
 *  rail's own Archived facet brings them back. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import AddOutlined from '@mui/icons-material/AddOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import ViewListOutlined from '@mui/icons-material/ViewListOutlined';
import ChecklistOutlined from '@mui/icons-material/ChecklistOutlined';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';

import {
  useProperties, useArchiveRecords, useDeleteRecords, useOrderService,
  useTagRecords, EMPTY_FILTER,
} from '../api';
import type { PropertyFilter, RecordCard } from '../api';
import { Chip, Icon, Loading, Menu, PageHead, Pill, Tag, inr, num, plural } from '../ui';
import { RecordDrawer, ConfirmDialog, TagDialog } from './PropertyActions';

const STATUS_WORD: Record<string, string> = {
  owned: 'Owned', for_sale: 'For sale', disputed: 'Disputed',
  managed: 'Managed', watch: 'Watch', archived: 'Archived',
};

const fmtExtent = (r: RecordCard) =>
  r.extentUnit === 'ac' ? `${num(r.extent, 2)} ac` : `${num(r.extent)} ${r.extentUnit}`;

type CardActions = {
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (rec: RecordCard) => void;
  onArchive: (rec: RecordCard) => void;
  onDelete: (rec: RecordCard) => void;
};

function recMenu(rec: RecordCard, a: CardActions) {
  return [
    { label: 'Edit…', onClick: () => a.onEdit(rec) },
    { label: rec.status === 'archived' ? 'Unarchive' : 'Archive', onClick: () => a.onArchive(rec) },
    { label: 'Delete…', onClick: () => a.onDelete(rec), danger: true },
  ];
}

function SelectBox({ rec, a }: { rec: RecordCard; a: CardActions }) {
  // stopPropagation keeps the click off the card's Link; preventDefault
  // would cancel the checkbox toggle itself, so it must not be called.
  return (
    <span className="sel" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={a.selected} aria-label={`Select ${rec.title}`}
             onChange={() => a.onSelect(rec.id)} />
    </span>
  );
}

function Card({ rec, a }: { rec: RecordCard; a: CardActions }) {
  const art = rec.classification === 'flat' || rec.classification === 'open_plot'
    ? 'built' : rec.classification === 'shop' ? 'shop' : '';
  return (
    <Link className={`rec ${a.selected ? 'selected' : ''}`} to={`/app/records/${rec.id}`}>
      <div className={`art ${art}`}>
        <Icon name={rec.classification} size={46} />
        <span className="badges">
          <SelectBox rec={rec} a={a} />
          {rec.status !== 'owned' && <Pill kind={rec.status}>{STATUS_WORD[rec.status]}</Pill>}
          {rec.stake !== 'owned' && <Pill kind={rec.stake}>{STATUS_WORD[rec.stake]}</Pill>}
        </span>
        <Menu className="more" label={`Actions for ${rec.title}`} items={recMenu(rec, a)} />
      </div>
      <div className="meat">
        <div className="row between" style={{ flexWrap: 'nowrap' }}>
          <h3>{rec.title}</h3>
          <Pill kind={rec.classification}>{rec.classification.replace('_', ' ')}</Pill>
        </div>
        {/* Not every record names an owner; an empty line left a gap where
            the card promised a name. */}
        {rec.ownerName && (
          <p className="note" style={{ marginTop: '0.25rem' }}>{rec.ownerName}</p>
        )}
        <p className="note row tight" style={{ marginTop: '0.1875rem' }}>
          <PlaceOutlined sx={{ fontSize: 13 }} aria-hidden /> {rec.placeLine}
        </p>
        <div className="row tight" style={{ margin: '0.625rem 0' }}>
          {rec.khataNo && <Chip>● Khata {rec.khataNo}</Chip>}
          {rec.tags.map((t) => <Tag key={t} alert={t === 'boundary dispute'}>{t}</Tag>)}
        </div>
        <hr className="hr" style={{ margin: '0 0 0.625rem' }} />
        {/* One line, always: the extent reads big, the alternate unit fills
            what room is left and truncates, and the money stays pinned right.
            Wrapping here made a card look like it held two figures. */}
        <div className="row" style={{ flexWrap: 'nowrap', gap: '0.5rem', alignItems: 'baseline' }}>
          <span className="figure" style={{ flex: 'none' }}>{fmtExtent(rec)}</span>
          {rec.extentAlt && (
            <span className="note num grow"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              · {rec.extentAlt}
            </span>
          )}
          <span className="num" style={{ flex: 'none', fontSize: '0.875rem' }}>
            {inr(rec.marketValue)}
          </span>
        </div>
      </div>
    </Link>
  );
}

type SortKey = 'title' | 'owner' | 'where' | 'status' | 'extent' | 'worth';
type Sort = { key: SortKey; dir: 1 | -1 } | null;

// Extents live in three units; sorting compares them on common ground.
const SQYD: Record<string, number> = { ac: 4840, 'sq.yd': 1, 'sq.ft': 1 / 9 };
const SORT_GET: Record<SortKey, (r: RecordCard) => string | number> = {
  title: (r) => r.title.toLowerCase(),
  owner: (r) => r.ownerName.toLowerCase(),
  where: (r) => r.placeLine.toLowerCase(),
  status: (r) => r.status,
  extent: (r) => r.extent * (SQYD[r.extentUnit] ?? 1),
  worth: (r) => r.marketValue,
};

/** A sortable column heading. Declared at module scope, not inside the page:
 *  a component defined in a render body is a new type every render, so React
 *  would rebuild all six headings on every keystroke and selection — and the
 *  sort button a keyboard user just pressed would vanish from under them. */
function Th({ k, label, right, sort, setSort }: {
  k: SortKey; label: string; right?: boolean;
  sort: Sort; setSort: (s: Sort) => void;
}) {
  const dir = sort?.key === k ? sort.dir : 0;
  return (
    <th className={right ? 'right' : undefined}
        aria-sort={dir === 0 ? undefined : dir === 1 ? 'ascending' : 'descending'}>
      <button type="button" className="sortbtn"
              onClick={() => setSort(dir === 0 ? { key: k, dir: 1 }
                : dir === 1 ? { key: k, dir: -1 } : null)}>
        {label}
        <span className="arrow" aria-hidden>{dir === 1 ? '▲' : dir === -1 ? '▼' : ''}</span>
      </button>
    </th>
  );
}

export function Properties() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<Sort>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [drawer, setDrawer] = useState<{ card: RecordCard | null } | null>(null);
  const [confirm, setConfirm] =
    useState<{ kind: 'delete' | 'archive' | 'unarchive' | 'order'; ids: string[] } | null>(null);
  const [tagIds, setTagIds] = useState<string[] | null>(null);
  const [err, setErr] = useState('');

  const del = useDeleteRecords();
  const arch = useArchiveRecords();
  const tagRecs = useTagRecords();
  const order = useOrderService();

  // The URL is the filter — a filtered list is a thing you send someone.
  const filter: PropertyFilter = {
    kinds: params.getAll('kind'),
    statuses: params.getAll('status'),
    stakes: params.getAll('stake'),
    derived: params.getAll('in'),
    tags: params.getAll('tag'),
  };
  const PARAM: Record<string, string> = {
    kind: 'kind', status: 'status', stake: 'stake', derived: 'in', tags: 'tag',
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

  const { data, isLoading } = useProperties(filter);
  const active = Object.values(filter).reduce((n, arr) => n + arr.length, 0);

  // The jump box falls back here with ?q= when nothing matched its dropdown —
  // narrow the grid by it so the landing is never a silent no-op.
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const cards = useMemo(() => {
    const kept = (data?.cards ?? []).filter((c) =>
      !q || `${c.title} ${c.village} ${c.mandal} ${c.khataNo} ${c.ownerName}`
        .toLowerCase().includes(q));
    if (!sort) return kept;
    const get = SORT_GET[sort.key];
    return [...kept].sort((x, y) => {
      const a = get(x), b = get(y);
      return (a < b ? -1 : a > b ? 1 : 0) * sort.dir;
    });
  }, [data, q, sort]);
  const shownCount = q ? cards.length : data?.shown ?? 0;

  // A different filter shows a different list; carrying a selection across
  // would let "Archive" reach records no longer on screen.
  const paramKey = params.toString();
  useEffect(() => { setSelected(new Set()); }, [paramKey]);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const selShown = cards.filter((c) => selected.has(c.id)).map((c) => c.id);
  const onSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const cardActions: Omit<CardActions, 'selected'> = {
    onSelect,
    onEdit: (rec) => setDrawer({ card: rec }),
    onArchive: (rec) => setConfirm({
      kind: rec.status === 'archived' ? 'unarchive' : 'archive', ids: [rec.id] }),
    onDelete: (rec) => setConfirm({ kind: 'delete', ids: [rec.id] }),
  };

  // The bulk bar acts on the selection; empty-handed, it acts on everything
  // shown — which is exactly what its resting "Order EC ×14" label promises.
  const targets = selShown.length ? selShown : cards.map((c) => c.id);
  const targetsArchived = targets.length > 0 &&
    targets.every((id) => byId.get(id)?.status === 'archived');

  // A write that fails must say so in the dialog that asked for it. Letting
  // the rejection escape left the dialog open, the button re-enabled and
  // nothing on screen to explain why the records had not moved.
  const said = (e: unknown, fallback: string) =>
    setErr(e instanceof Error && e.message ? e.message : fallback);

  const runConfirm = async () => {
    if (!confirm) return;
    const { kind, ids } = confirm;
    setErr('');
    try {
      if (kind === 'delete') await del.mutateAsync({ ids });
      else if (kind === 'order') await order.mutateAsync({ recordIds: ids, kind: 'ec' });
      else await arch.mutateAsync({ ids, archived: kind === 'archive' });
    } catch (e) {
      said(e, 'That did not go through. Nothing was changed — try again.');
      return;
    }
    setSelected(new Set());
    setConfirm(null);
  };

  const applyTag = async (tag: string) => {
    if (!tagIds) return;
    setErr('');
    try {
      await tagRecs.mutateAsync({ ids: tagIds, tag });
    } catch (e) {
      said(e, 'The tag did not save. Try again.');
      return;
    }
    setSelected(new Set());
    setTagIds(null);
  };

  /** The visible list — filter, search and sort included — as a file. */
  const exportCsv = () => {
    const esc = (v: unknown) => {
      let s = String(v ?? '');
      // A record's title is free text. Excel and Sheets execute a cell that
      // opens with =, +, - or @, so a title like =HYPERLINK(…) would run on
      // whoever opened the export; a leading quote makes it read as text.
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      // \r counts as a line break inside a cell for strict CSV readers.
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Record', 'Kind', 'Owner', 'Village', 'Mandal', 'District', 'Khata',
      'Status', 'Stake', 'Extent', 'Unit', 'Worth (₹)', 'Tags'];
    const lines = cards.map((r) => [r.title, r.kind, r.ownerName, r.village, r.mandal,
      r.district, r.khataNo, r.status, r.stake, r.extent, r.extentUnit,
      Math.round(r.marketValue), r.tags.join('; ')].map(esc).join(','));
    // The BOM makes Excel read the ₹ column as UTF-8 instead of mojibake.
    const blob = new Blob(['\uFEFF' + [head.join(','), ...lines].join('\n')],
      { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `properties-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const confirmCopy = confirm && {
    delete: {
      title: confirm.ids.length === 1 ? 'Delete this record?'
        : `Delete ${confirm.ids.length} records?`,
      body: <>Everything filed under {confirm.ids.length === 1
          ? <strong>{byId.get(confirm.ids[0])?.title ?? 'it'}</strong>
          : 'them'} goes too — papers, photos, features, people and the money
        ledger. There is no undo. If you only want {confirm.ids.length === 1 ? 'it' : 'them'} out
        of the way, Archive instead.</>,
      action: 'Delete', danger: true,
    },
    archive: {
      title: `Archive ${plural(confirm.ids.length, 'record')}?`,
      body: <>Archived records leave the list, the map and every total, but keep
        everything filed under them. Bring them back any time from the
        <strong> Archived</strong> facet in the rail.</>,
      action: 'Archive', danger: false,
    },
    unarchive: {
      title: `Unarchive ${plural(confirm.ids.length, 'record')}?`,
      body: <>{confirm.ids.length === 1 ? 'It rejoins' : 'They rejoin'} the list,
        the map and the portfolio totals.</>,
      action: 'Unarchive', danger: false,
    },
    order: {
      title: `Order ${confirm.ids.length === 1 ? 'an EC' : `${confirm.ids.length} ECs`}?`,
      body: <>One Encumbrance Certificate order per record, ₹1,180 each. They
        appear under <strong>Services</strong> as they are placed.</>,
      action: `Order EC ×${confirm.ids.length}`, danger: false,
    },
  }[confirm.kind];

  return (
    <div className="withrail">
      <aside className="filters" aria-label="Narrow the list">
        <div className="row between">
          <span className="eyebrow" style={{ margin: 0 }}>Narrow</span>
          {active > 0 && (
            <button
              type="button"
              className="link accent"
              style={{ border: 0, background: 'none', font: 'inherit', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--w-accent)' }}
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
            >
              Clear {active}
            </button>
          )}
        </div>

        {(data?.facets ?? []).map((g) => (
          <div className="grp" key={g.key}>
            <span className="eyebrow" style={{ margin: 0 }}>{g.label}</span>
            {g.key === 'derived' || g.key === 'tags' ? (
              <div className="row tight">
                {g.options.map((o) => (
                  <Chip key={o.key} active={o.active} wash={g.key === 'derived'}
                        onClick={() => toggle(g.key, o.key)}>
                    {g.key === 'derived' && <span aria-hidden style={{ fontSize: '0.5rem' }}>●</span>}
                    {o.label}
                  </Chip>
                ))}
              </div>
            ) : (
              g.options.map((o) => (
                <label className="check" key={o.key}>
                  <input type="checkbox" checked={o.active} onChange={() => toggle(g.key, o.key)} />
                  {o.label}
                  <span className="n">{o.count}</span>
                </label>
              ))
            )}
          </div>
        ))}
      </aside>

      <main>
        <PageHead
          eyebrow="Your properties"
          title={
            <span className="row" style={{ gap: 'var(--space-sm)' }}>
              Properties
              {data && (
                <span
                  className="chip static"
                  style={{
                    fontSize: '0.8125rem', padding: '0.3125rem 0.75rem',
                    background: 'var(--w-accent-wash)', color: 'var(--w-accent)',
                    borderColor: 'color-mix(in oklab, var(--w-accent) 30%, transparent)',
                    fontWeight: 500, letterSpacing: 'normal',
                  }}
                >
                  {shownCount} of {data.total} shown
                </span>
              )}
            </span>
          }
          actions={
            <>
              <div className="segmented" role="group" aria-label="View">
                <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')} aria-label="Grid">
                  <GridViewOutlined sx={{ fontSize: 16 }} />
                </button>
                <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} aria-label="List">
                  <ViewListOutlined sx={{ fontSize: 16 }} />
                </button>
              </div>
              <button type="button" className="btn" onClick={exportCsv}
                      disabled={cards.length === 0}>
                <FileDownloadOutlined sx={{ fontSize: 16 }} /> Export
              </button>
              <button type="button" className="btn primary" onClick={() => setDrawer({ card: null })}>
                <AddOutlined sx={{ fontSize: 17 }} /> Add
              </button>
            </>
          }
        >
          {data && (data.filterSummary || q) && (
            <p className="lede">
              {[data.filterSummary && `Filtered to ${data.filterSummary}`,
                q && `matching “${params.get('q')}”`].filter(Boolean).join(' · ')}.
            </p>
          )}
        </PageHead>

        {isLoading && <Loading h="18rem" />}

        {data && view === 'grid' && (
          <div className={`cards ${selected.size > 0 ? 'selecting' : ''}`}>
            {cards.map((r) => (
              <Card key={r.id} rec={r}
                    a={{ ...cardActions, selected: selected.has(r.id) }} />
            ))}
            {data.total === 0 && (
              <div className="card dashed" style={{ display: 'grid', placeContent: 'center', textAlign: 'center', gap: '0.625rem' }}>
                <h3>Nothing here yet</h3>
                <p className="note">Add your first parcel or property — the khata, the extent and what it is worth.</p>
                <button type="button" className="btn primary" style={{ justifySelf: 'center' }}
                        onClick={() => setDrawer({ card: null })}>
                  <AddOutlined sx={{ fontSize: 17 }} /> Add a record
                </button>
              </div>
            )}
            {q && cards.length === 0 && data.total > 0 && (
              <div className="card dashed" style={{ display: 'grid', placeContent: 'center', textAlign: 'center', gap: '0.5rem' }}>
                <h3>Nothing matches “{params.get('q')}”</h3>
                <p className="note">Try a survey number, a village, a khata or an owner's name.</p>
              </div>
            )}
            {data.hidden > 0 && (
              <div className="card dashed" style={{ display: 'grid', placeContent: 'center', textAlign: 'center', gap: '0.625rem' }}>
                <span className="muted" style={{ justifySelf: 'center' }}>
                  <FilterAltOffOutlined sx={{ fontSize: 30 }} />
                </span>
                <h3>{data.hidden} propert{data.hidden === 1 ? 'y' : 'ies'} hidden by your filter</h3>
                <p className="note">
                  {data.activeCount} facet{data.activeCount === 1 ? ' is' : 's are'} on. Clearing
                  {data.activeCount === 1 ? ' it' : ' them'} brings back everything in{' '}
                  {data.hiddenPlaces.slice(0, 2).join(' and ')}.
                </p>
                <button type="button" className="btn" style={{ justifySelf: 'center' }}
                        onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {data && view === 'list' && (
          <div className="card scroll-x" style={{ padding: 0 }}>
            <table className="rectable" style={{ minWidth: '46rem' }}>
              <thead>
                <tr>
                  <th className="selcol">
                    <input
                      type="checkbox" aria-label="Select all shown"
                      checked={cards.length > 0 && selShown.length === cards.length}
                      onChange={() => setSelected(
                        selShown.length === cards.length
                          ? new Set() : new Set(cards.map((c) => c.id)))}
                    />
                  </th>
                  <Th k="title" label="Record" sort={sort} setSort={setSort} />
                  <Th k="owner" label="Owner" sort={sort} setSort={setSort} />
                  <Th k="where" label="Where" sort={sort} setSort={setSort} />
                  <Th k="status" label="Status" sort={sort} setSort={setSort} />
                  <Th k="extent" label="Extent" right sort={sort} setSort={setSort} />
                  <Th k="worth" label="Worth" right sort={sort} setSort={setSort} />
                  <th className="menucol" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {cards.map((r) => (
                  <tr key={r.id} className={selected.has(r.id) ? 'selected' : undefined}>
                    <td className="selcol">
                      <input type="checkbox" checked={selected.has(r.id)}
                             aria-label={`Select ${r.title}`}
                             onChange={() => onSelect(r.id)} />
                    </td>
                    <td><Link to={`/app/records/${r.id}`} className="accent" style={{ textDecoration: 'none' }}>{r.title}</Link></td>
                    <td className="muted">{r.ownerName || '—'}</td>
                    <td className="muted">{r.placeLine}</td>
                    <td><Pill kind={r.status}>{STATUS_WORD[r.status]}</Pill></td>
                    <td className="right num">{fmtExtent(r)}</td>
                    <td className="right num">{inr(r.marketValue)}</td>
                    <td className="menucol">
                      <Menu label={`Actions for ${r.title}`}
                            items={recMenu(r, { ...cardActions, selected: false })} />
                    </td>
                  </tr>
                ))}
                {cards.length === 0 && (
                  <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
                    Nothing to list{q ? ` for “${params.get('q')}”` : ''}.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && cards.length > 0 && (
          <section className={`card sec row between bulkbar ${selShown.length ? 'on' : ''}`}
                   style={{ flexWrap: 'nowrap', gap: 'var(--space-lg)' }}>
            <span className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)' }}>
              <span className={selShown.length ? 'accent' : 'muted'} style={{ display: 'flex' }}>
                <ChecklistOutlined sx={{ fontSize: 20 }} />
              </span>
              <span className="note" style={{ color: 'var(--w-ink-2)' }}>
                {selShown.length
                  ? `${plural(selShown.length, 'record')} selected — these buttons act on them.`
                  : 'Select cards to act on several at once — tag, move to a group, order one service for all, or archive.'}
              </span>
            </span>
            <span className="row tight" style={{ flexWrap: 'nowrap' }}>
              {selShown.length > 0 && (
                <button type="button" className="btn sm" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              )}
              <button type="button" className="btn sm" onClick={() => setTagIds(targets)}>
                Tag…
              </button>
              <button type="button" className="btn sm"
                      onClick={() => setConfirm({ kind: 'order', ids: targets })}>
                Order EC ×{targets.length}
              </button>
              <button type="button" className="btn sm"
                      onClick={() => setConfirm({
                        kind: targetsArchived ? 'unarchive' : 'archive', ids: targets })}>
                {targetsArchived ? 'Unarchive' : 'Archive'}
              </button>
              {selShown.length > 0 && (
                <button type="button" className="btn sm danger"
                        onClick={() => setConfirm({ kind: 'delete', ids: selShown })}>
                  Delete…
                </button>
              )}
            </span>
          </section>
        )}
      </main>

      {drawer && <RecordDrawer card={drawer.card} onClose={() => setDrawer(null)} />}
      {confirm && confirmCopy && (
        <ConfirmDialog
          title={confirmCopy.title} body={confirmCopy.body}
          actionLabel={confirmCopy.action} danger={confirmCopy.danger}
          busy={del.isPending || arch.isPending || order.isPending} error={err}
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
    </div>
  );
}

export { EMPTY_FILTER };
