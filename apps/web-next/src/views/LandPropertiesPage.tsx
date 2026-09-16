'use client';

/**
 * Land & Properties — functional-parity port of the predecessor pattadar app's
 * combined HoldingsView + AllHoldingsView: "<n> holdings" header, per-tab
 * stat tiles, All / Land Parcels / Properties tabs, search, quick filters
 * (kind / status / stake / family / passbook), List/Grid modes, CSV/Excel/PDF
 * export, status+stake badges on emerald hero cards, and the Add flows
 * (AI-classified Add for properties/deeds, manual Add Parcel).
 *
 * NOW BUILT ON THE COMPONENT KIT (`src/components/kit`). This screen was the
 * kit's donor — every primitive in `components/kit/**` was extracted from the
 * 828 lines that used to live here — so it is also the kit's proof: the page is
 * assembled from `ListScreen` plus the primitives, and what remains below is
 * only what the kit deliberately refuses to absorb. That refusal is the design:
 * the tab axis IS the kind axis (a predicate, never a field name), the tiles are
 * computed from the FULL dataset while the list shows the filtered rows, Family
 * matches by NAME while Passbook matches by ID, the litigation-outranks-status
 * and owned-renders-nothing pill rules are passed as data, and `formatArea`
 * (re-exported by the kit as `area`) stays the only renderer of acreage.
 *
 * Deep links: /app/parcels?pb=<passbookId> lands on Land Parcels filtered to
 * that khata; ?group=<groupId> pre-filters by family; ?tab=properties opens
 * the Properties tab (the old /app/properties route redirects here). `?pb=`
 * outranks `?tab=` through `useQueryState`'s mount-time `seed`, and `?group=`'s
 * id→name resolution runs through `seedOnce` — so "Clear all" now clears a
 * deep-linked family filter and it stays cleared.
 *
 * Contract: docs/specs/2026-09-14-web-component-kit-contract.md
 * Design authority: docs/specs/2026-07-26-ux-redesign-m3.md
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'src/routes/hooks';
import { useQueryClient } from '@tanstack/react-query';
import AddIcon from '@mui/icons-material/Add';
import {
  area,
  areaOrDash,
  CountChip,
  dash,
  exportBrand,
  FilterShortcutChip,
  inrOrDash,
  ListScreen,
  MediaCard,
  MetaChip,
  num,
  shortName,
  StatusChip,
  useFilePicker,
  useQueryState,
  useToast,
} from '../components/kit';
import type {
  ActionItem,
  Column,
  FilterField,
  FilterValues,
  PillSpec,
  StatItem,
  StatusTone,
  TabItem,
  ToastSeverity,
  ViewMode,
} from '../components/kit';
import { useHoldings } from '../data/hooks';
import { deleteParcel, deleteProperty } from '../data/pattadarActions';
import { STORAGE_OFFLINE_MSG, uploadCoverPhoto } from './documents/storage';
import { AddParcelDialog } from './holdings/AddParcelDialog';
import { AddPropertyDialog } from './holdings/AddPropertyDialog';
import { LocationDialog } from './holdings/LocationDialog';
import type { LocationTarget } from './holdings/LocationDialog';
import { StakeDialog } from './holdings/StakeDialog';
import type { StakeTarget } from './holdings/StakeDialog';
import { propertyTypeDef } from './holdings/propertyTypes';

/** One normalized row — a land parcel and a property render the same way. */
interface Holding {
  id: string;
  kind: 'parcel' | 'property';
  title: string;
  owner: string;
  location: string;
  extentLabel: string;
  value: number;
  perAc: number;
  status: string;
  litigation: boolean;
  stake: string;
  typeLabel: string;
  typeColor: 'success' | 'info';
  icon: string;
  cover?: string;
  createdAt: string;
  geoPoint: string;
  passbookId: string;
  passbook: string;
  khata: string;
  groupName: string;
}

/** The dataset the filter declarations read their options and labels from. */
type HoldingsData = ReturnType<typeof useHoldings>['data'];

type TabKey = 'all' | 'parcels' | 'properties';

/**
 * What a filter declaration needs to build its options, decide whether it is
 * offered on this tab, and name its own collapsed chip. The tab rides along
 * because two of the five filters are tab-conditional.
 */
interface FilterCtx {
  data: HoldingsData;
  tab: TabKey;
}

/** The URL-addressable state of this screen. `group` arrives as an id alias. */
type HoldingsQuery = {
  tab: TabKey;
  view: ViewMode;
  search: string;
  kind: string | undefined;
  status: string | undefined;
  stake: string | undefined;
  group: string | undefined;
  pb: string | undefined;
};

const TAB_VALUES = ['all', 'parcels', 'properties'] as const;
const VIEW_VALUES = ['list', 'grid'] as const;

const isTabKey = (value: string): value is TabKey =>
  (TAB_VALUES as readonly string[]).includes(value);

const TABS: TabItem[] = [
  { value: 'all', label: 'All' },
  { value: 'parcels', label: 'Land Parcels' },
  { value: 'properties', label: 'Properties' },
];

/**
 * Status pill for a holding card hero. DOMAIN LAW, and it stays here: litigation
 * outranks the status entirely, and the kit is handed the answer as data rather
 * than the rule. The words are the predecessor's own — lower-case, hyphens
 * spaced — and an unrecognised status has always read as owned.
 */
function statusPill(status: string, litigation: boolean): PillSpec {
  if (litigation) return { label: 'Litigation', tone: 'error' };
  const s = String(status || 'owned');
  const tones: Record<string, StatusTone> = {
    owned: 'success',
    'for-sale': 'info',
    sold: 'neutral',
    disputed: 'error',
  };
  return { label: s.replace(/-/g, ' '), tone: tones[s] ?? 'success' };
}

/** Stake pill (managed / watch) — owned holdings show no second pill. */
function stakePill(stake: string): PillSpec | undefined {
  if (stake === 'managed') return { label: 'Managed', tone: 'warning' };
  if (stake === 'watch') return { label: 'Watch', tone: 'info' };
  return undefined;
}

/**
 * The five filters, declared ONCE: the panel, the collapsed chip row, the active
 * count and the row predicate below all read this array, which is what retired
 * the five bespoke chip branches the screen used to carry.
 *
 * Two asymmetries are deliberate and documented rather than "fixed": Family
 * matches on the group NAME (the row carries a name, not an id) while Passbook
 * matches on the passbook ID; and Kind is offered only on the All tab while
 * Passbook is withheld on Properties — withheld, not cleared, so a filter set on
 * one tab survives a visit to another and stays removable from the chip row.
 */
const FILTER_FIELDS: FilterField<FilterCtx, Holding>[] = [
  {
    key: 'kind',
    label: 'Kind',
    placeholder: 'All kinds',
    options: [
      { value: 'parcel', label: '🌾 Land parcels' },
      { value: 'property', label: '🏢 Properties' },
    ],
    visible(ctx) {
      return ctx.tab === 'all';
    },
    match(row, value) {
      return row.kind === value;
    },
  },
  {
    key: 'status',
    label: 'Status',
    placeholder: 'All statuses',
    options: ['owned', 'for-sale', 'sold', 'disputed'].map((x) => ({
      value: x,
      label: x.replace(/-/g, ' '),
    })),
    match(row, value) {
      return row.status === value;
    },
  },
  {
    key: 'stake',
    label: 'My stake',
    placeholder: 'All stakes',
    options: [
      { value: 'owned', label: 'Owned' },
      { value: 'managed', label: 'Managed' },
      { value: 'watch', label: 'Watch' },
    ],
    match(row, value) {
      return row.stake === value;
    },
  },
  {
    key: 'group',
    label: 'Family / group',
    placeholder: 'All families',
    options: (ctx) => ctx.data.groups.map((g) => ({ value: g.name, label: `👪 ${g.name}` })),
    match(row, value) {
      return row.groupName === value;
    },
  },
  {
    key: 'pb',
    label: 'Passbook',
    placeholder: 'All passbooks',
    options: (ctx) =>
      ctx.data.passbooks.map((b) => ({
        value: b.id,
        label: `📗 ${b.pattadarNo} · ${shortName(b.ownerName || '') || dash}`,
      })),
    visible(ctx) {
      return ctx.tab !== 'properties';
    },
    /* A passbook chip names the khata, not the id the filter holds — and a
       stale deep link still reads as a passbook rather than as a UUID. */
    chipLabel(value, ctx) {
      const b = ctx.data.passbooks.find((x) => x.id === value);
      return `📗 ${b ? `${b.pattadarNo} · ${shortName(b.ownerName || '')}` : 'Passbook'}`;
    },
    match(row, value) {
      return row.passbookId === value;
    },
  },
];

export function LandPropertiesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isSample, isLoading } = useHoldings();

  /**
   * Tab, view, search and all five filters, in the URL. `seed` is synchronous
   * precedence — `?pb=` implies the Parcels tab whatever `?tab=` says — and
   * `group` is declared `seedOnly` because the param carries an id while the
   * filter holds a name: the raw value must never masquerade as the filter.
   */
  const qs = useQueryState<HoldingsQuery>({
    params: {
      tab: 'tab',
      view: 'view',
      search: 'q',
      kind: 'kind',
      status: 'status',
      stake: 'stake',
      group: 'group',
      pb: 'pb',
    },
    defaults: {
      tab: 'all',
      view: 'grid',
      search: '',
      kind: undefined,
      status: undefined,
      stake: undefined,
      group: undefined,
      pb: undefined,
    },
    seed: (raw) => (raw.pb ? { tab: 'parcels' } : {}),
    allow: { tab: TAB_VALUES, view: VIEW_VALUES },
    filterKeys: ['kind', 'status', 'stake', 'group', 'pb'],
    seedOnlyKeys: ['group'],
  });

  const { tab, view, search } = qs.values;

  const [showFilters, setShowFilters] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addParcelOpen, setAddParcelOpen] = useState(false);
  const [stakeTarget, setStakeTarget] = useState<StakeTarget>(null);
  const [locTarget, setLocTarget] = useState<LocationTarget>(null);

  /* The hidden picker behind "Add / Change cover photo". One input for the
     whole screen, and `pick()` resolves with the outcome, so the target no
     longer has to be parked in a ref between the click and the change event. */
  const coverPicker = useFilePicker({ accept: 'image/*' });

  const notify = useCallback(
    (msg: string, severity: ToastSeverity = 'success') => toast.notify(msg, severity),
    [toast],
  );
  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['pattadar'] }),
    [queryClient],
  );

  // ── normalize rows (verbatim semantics from AllHoldingsView) ────────────
  const gname = useMemo(() => new Map(data.groups.map((g) => [g.id, g.name])), [data.groups]);
  const holdings = useMemo<Holding[]>(() => {
    const pbLoc = new Map(
      data.passbooks.map((b) => [b.id, [b.village, b.mandal, b.district].filter(Boolean).join(', ')]),
    );
    const pbGroup = new Map(data.passbooks.map((b) => [b.id, gname.get(b.groupId || '') || '']));
    const pbLabel = new Map(
      data.passbooks.map((b) => [b.id, [b.pattadarNo, b.village].filter(Boolean).join(' · ')]),
    );
    const pbKhata = new Map(data.passbooks.map((b) => [b.id, b.pattadarNo || '']));
    const cov: Record<string, string> = {};
    for (const doc of data.documents) {
      if (doc.docType === 'photo' || doc.tags === 'photo') {
        const key = doc.parcelId || doc.propertyId;
        if (key && doc.fileRef) cov[key] = doc.fileRef;
      }
    }
    const parcels: Holding[] = data.parcels.map((p) => {
      const val = Number(p.marketValue) || Number(p.purchasePrice) || 0;
      const acres = Number(p.extent) || 0;
      return {
        id: p.id,
        kind: 'parcel',
        title: `Sy ${p.surveyNo}${p.subdivision ? '/' + p.subdivision : ''}`,
        passbookId: p.passbookId || '',
        passbook: pbLabel.get(p.passbookId) || '',
        khata: pbKhata.get(p.passbookId) || '',
        groupName: pbGroup.get(p.passbookId) || '',
        owner: p.currentOwner || '',
        location: pbLoc.get(p.passbookId) || '',
        extentLabel: area(acres),
        value: val,
        perAc: val > 0 && acres > 0 ? Math.round(val / acres) : 0,
        status: p.status || 'owned',
        litigation: !!p.litigation,
        stake: p.stake || 'owned',
        typeLabel: p.classification === 'agri' ? 'agri' : 'non-agri',
        typeColor: p.classification === 'agri' ? 'success' : 'info',
        icon: p.classification === 'agri' ? '🌾' : '🏗️',
        cover: cov[p.id],
        createdAt: p.createdAt || '',
        geoPoint: p.geoPoint || '',
      };
    });
    const properties: Holding[] = data.properties.map((p) => {
      const def = propertyTypeDef(p.type);
      return {
        id: p.id,
        kind: 'property',
        title: p.label || dash,
        passbookId: '',
        passbook: '',
        khata: '',
        groupName: gname.get(p.groupId || '') || '',
        owner: p.currentOwner || '',
        location: [p.city, p.district].filter(Boolean).join(', '),
        extentLabel: p.landArea
          ? `${p.landArea} ${p.landUnit}`
          : p.builtupArea
            ? `${p.builtupArea} ${p.builtupUnit}`
            : dash,
        value: Number(p.currentValue) || 0,
        perAc: 0,
        status: p.holdingStatus || 'owned',
        litigation: false,
        stake: p.stake || 'owned',
        typeLabel: def.label,
        typeColor: 'info',
        icon: def.icon || '🏢',
        cover: cov[p.id],
        createdAt: p.createdAt || '',
        geoPoint: '',
      };
    });
    return [...parcels, ...properties];
  }, [data, gname]);

  /* ?group=<id> deep link → the family-NAME filter, once the groups land.
     `seedOnce` stays pending while the lookup returns undefined, applies
     exactly once, and is dead to the key the moment the reader touches it —
     which is what makes "Clear all" stick on a deep-linked filter. */
  useEffect(() => {
    const raw = qs.rawParam('group');
    if (!raw) return;
    qs.seedOnce('group', gname.get(raw));
  }, [qs, gname]);

  // ── summary tiles (verbatim from HoldingsView.loadSum) ──────────────────
  const t = useMemo(() => {
    const ps = data.parcels;
    const prs = data.properties;
    return {
      parcels: ps.length,
      properties: prs.length,
      acres: ps.reduce((a, p) => a + (Number(p.extent) || 0), 0),
      invested: ps.reduce((a, p) => a + (Number(p.purchasePrice) || 0), 0),
      attention: ps.filter((p) => p.litigation || (p.status && p.status !== 'owned')).length,
      passbooks: data.passbooks.length,
      plots: prs.filter((p) => p.type === 'open_plot').length,
      sqyd: prs.reduce((a, p) => a + (Number(p.landArea) || 0), 0),
      sqft: prs.reduce((a, p) => a + (Number(p.builtupArea) || 0), 0),
      value:
        prs.reduce((a, p) => a + (Number(p.currentValue) || 0), 0) +
        ps.reduce((a, p) => a + (Number(p.marketValue) || Number(p.purchasePrice) || 0), 0),
      managed: ps.filter((p) => p.stake === 'managed').length + prs.filter((p) => p.stake === 'managed').length,
      watch: ps.filter((p) => p.stake === 'watch').length + prs.filter((p) => p.stake === 'watch').length,
    };
  }, [data]);

  /* Per-tab tile sets, computed from the FULL dataset (`data.parcels` /
     `data.properties`), never from the filtered rows — declared to the kit as
     `scope: 'dataset'` so the tiles do not move when a filter does. The unit
     suffixes are concatenated here on purpose: `num()` never appends one, so
     `Sq.yd` and `sq.ft` render byte-for-byte as they always have. */
  const stats = useMemo<StatItem[]>(() => {
    if (tab === 'parcels') {
      return [
        { key: 'parcels', label: 'Parcels', value: t.parcels },
        { key: 'extent', label: 'Total Extent', value: areaOrDash(t.acres) },
        { key: 'passbooks', label: 'Passbooks', value: t.passbooks },
        { key: 'attention', label: 'Needs Attention', value: t.attention },
      ];
    }
    if (tab === 'properties') {
      return [
        { key: 'properties', label: 'Properties', value: t.properties },
        {
          key: 'sqyd',
          label: 'Plots & Sites',
          value: t.sqyd > 0 ? `${num(t.sqyd)} Sq.yd` : dash,
        },
        { key: 'sqft', label: 'Built-up', value: t.sqft > 0 ? `${num(t.sqft)} sq.ft` : dash },
        { key: 'plots', label: 'Plots', value: t.plots },
      ];
    }
    return [
      { key: 'holdings', label: 'Holdings', value: t.parcels + t.properties },
      { key: 'farmland', label: 'Farmland', value: areaOrDash(t.acres) },
      { key: 'sqyd', label: 'Plots & Sites', value: t.sqyd > 0 ? `${num(t.sqyd)} Sq.yd` : dash },
      { key: 'passbooks', label: 'Passbooks', value: t.passbooks },
    ];
  }, [tab, t]);

  // ── filtering ───────────────────────────────────────────────────────────
  const ctx = useMemo<FilterCtx>(() => ({ data, tab }), [data, tab]);
  const filterValues = useMemo<FilterValues>(
    () => ({
      kind: qs.values.kind,
      status: qs.values.status,
      stake: qs.values.stake,
      group: qs.values.group,
      pb: qs.values.pb,
    }),
    [qs.values.kind, qs.values.status, qs.values.stake, qs.values.group, qs.values.pb],
  );

  /* The tab IS the kind axis, expressed as a predicate rather than a field
     name, and every other clause comes from the declaration above — so there is
     exactly one place where "what does this filter mean" is written down. */
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return holdings.filter(
      (h) =>
        (tab === 'all' || (tab === 'parcels' ? h.kind === 'parcel' : h.kind === 'property')) &&
        FILTER_FIELDS.every((field) => {
          const value = filterValues[field.key];
          return !value || !field.match || field.match(h, value, ctx);
        }) &&
        (!q ||
          [h.title, h.owner, h.location, h.passbook, h.groupName, h.typeLabel, h.khata, h.status]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
  }, [holdings, tab, filterValues, ctx, search]);

  // ── actions ─────────────────────────────────────────────────────────────
  // Parcels open the parcel 360, properties the property detail (source parity).
  const openDetail = useCallback(
    (h: Holding) => router.push(`/app/${h.kind === 'parcel' ? 'parcels' : 'properties'}/${h.id}`),
    [router],
  );

  const chooseCover = useCallback(
    async (h: Holding) => {
      const picked = await coverPicker.pick();
      if (picked.status !== 'ok') return;
      const file = picked.files[0];
      if (!file) return;
      const res = await uploadCoverPhoto(
        file,
        h.kind === 'property' ? { propertyId: h.id } : { parcelId: h.id },
      );
      if (res === 'ok') {
        toast.success('Cover photo updated');
        refresh();
      } else if (res === 'storage') toast.info(STORAGE_OFFLINE_MSG);
      else toast.error("Couldn't upload the photo — try again");
    },
    [coverPicker, refresh, toast],
  );

  /* Throwing is the report: `ConfirmDialog` keeps the question open and shows
     the message inline, instead of closing over a delete that did not happen. */
  const removeHolding = useCallback(
    async (h: Holding) => {
      try {
        if (h.kind === 'property') await deleteProperty(h.id);
        else await deleteParcel(h.id);
      } catch {
        throw new Error("Couldn't delete — try again");
      }
      toast.success('Deleted — files moved to Trash');
      refresh();
    },
    [refresh, toast],
  );

  const rowActions = useCallback(
    (h: Holding): ActionItem[] => [
      { key: 'open', label: 'Open', onSelect: () => openDetail(h) },
      {
        key: 'cover',
        label: h.cover ? 'Change cover photo' : 'Add cover photo',
        onSelect: () => chooseCover(h),
      },
      {
        key: 'stake',
        label: 'My stake…',
        onSelect: () =>
          setStakeTarget({ kind: h.kind, id: h.id, title: h.title, stake: h.stake || 'owned' }),
      },
      // Location on the open-source map — parcels only (source parity: ParcelLocationModal).
      ...(h.kind === 'parcel'
        ? [
            {
              key: 'location',
              label: 'Location…',
              onSelect: () =>
                setLocTarget({
                  id: h.id,
                  title: h.title,
                  geoPoint: h.geoPoint,
                  autoLocate: h.location ? `${h.location}, India` : '',
                }),
            },
          ]
        : []),
      {
        key: 'delete',
        label: 'Delete',
        danger: true,
        // The cascade copy is load-bearing, not boilerplate: deleting a holding
        // takes its documents with it.
        confirm: {
          title: `Delete ${h.title}?`,
          body: 'Its documents are also removed — files go to My Drive Trash. This cannot be undone.',
          confirmLabel: 'Delete',
          busyLabel: 'Deleting…',
          destructive: true,
        },
        onSelect: () => removeHolding(h),
      },
    ],
    [chooseCover, openDetail, removeHolding],
  );

  /* ONE column array drives the table head, the cells and the export — the two
     declarations that used to disagree are now the same ten objects. `value` is
     the exported text and `render` is the screen cell, which is how the report
     keeps raw owner / passbook / status strings while the table shows the chip,
     the 📗 and the em-dash. */
  const columns = useMemo<Column<Holding>[]>(
    () => [
      { key: 'title', header: 'Name', value: (r) => r.title },
      {
        key: 'kind',
        header: 'Kind',
        value: (r) => (r.kind === 'parcel' ? 'Land parcel' : 'Property'),
        render: (r) => <MetaChip label={r.kind === 'parcel' ? 'Land parcel' : 'Property'} />,
      },
      { key: 'typeLabel', header: 'Type', value: (r) => r.typeLabel },
      { key: 'owner', header: 'Owner', value: (r) => r.owner },
      { key: 'location', header: 'Location', value: (r) => r.location },
      {
        key: 'passbook',
        header: 'Passbook',
        value: (r) => r.passbook,
        render: (r) => (r.passbook ? `📗 ${r.passbook}` : dash),
      },
      {
        key: 'groupName',
        header: 'Family / Group',
        value: (r) => r.groupName,
        render: (r) => (r.groupName ? <MetaChip label={`👪 ${r.groupName}`} /> : dash),
      },
      { key: 'extentLabel', header: 'Extent', value: (r) => r.extentLabel },
      {
        key: 'value',
        header: 'Value (₹)',
        value: (r) => (r.value ? r.value.toLocaleString('en-IN') : ''),
        render: (r) => inrOrDash(r.value),
      },
      {
        key: 'status',
        header: 'Status',
        value: (r) => r.status,
        render: (r) =>
          r.litigation ? (
            <StatusChip label="litigation" tone="error" />
          ) : (
            <MetaChip label={String(r.status || 'owned').replace(/-/g, ' ')} />
          ),
      },
    ],
    [],
  );

  const exportName =
    tab === 'parcels' ? 'pattadar-parcels' : tab === 'properties' ? 'pattadar-properties' : 'pattadar-holdings';

  /* A khata or a family on a card is a shortcut into the page's own filters,
     and the kit's chip stops the click reaching the card it is standing on. */
  const renderCard = useCallback(
    (r: Holding) => {
      const pills: PillSpec[] = [statusPill(r.status, r.litigation)];
      const stake = stakePill(r.stake);
      if (stake) pills.push(stake);

      const khataChip =
        r.kind === 'parcel' ? (
          <FilterShortcutChip
            key="khata"
            label={`Khata ${r.khata || dash}`}
            actionLabel={r.passbookId ? `Filter by khata ${r.khata || dash}` : undefined}
            onActivate={
              r.passbookId ? () => qs.set({ tab: 'parcels', pb: r.passbookId }) : undefined
            }
          />
        ) : null;
      const groupChip = r.groupName ? (
        <FilterShortcutChip
          key="group"
          variant="outlined"
          label={`👪 ${r.groupName}`}
          actionLabel={`Filter by family ${r.groupName}`}
          onActivate={() => qs.set({ group: r.groupName })}
        />
      ) : null;

      return (
        <MediaCard
          ariaLabel={`Open ${r.title}`}
          onOpen={() => openDetail(r)}
          media={{ fileRef: r.cover, fallbackIcon: r.icon }}
          pills={pills}
          actions={rowActions(r)}
          title={r.title}
          titleChip={<StatusChip label={r.typeLabel} tone={r.typeColor} />}
          subtitle={r.owner}
          location={r.location}
          chips={khataChip || groupChip ? <>{khataChip}{groupChip}</> : undefined}
          footer={{
            figure: r.extentLabel,
            caption: r.kind === 'parcel' ? 'Land parcel' : r.typeLabel,
          }}
        />
      );
    },
    [openDetail, qs, rowActions],
  );

  return (
    <ListScreen<Holding, FilterCtx>
      header={{
        eyebrow: 'Your holdings',
        title: 'Land & Properties',
        dataState: isSample ? 'unreachable' : 'live',
        titleChips: (
          <CountChip count={t.parcels + t.properties} noun="holdings" nounPlural="holdings" />
        ),
        subtitle: `${t.parcels} land parcel${t.parcels !== 1 ? 's' : ''} (${area(t.acres)}) · ${t.properties} propert${t.properties !== 1 ? 'ies' : 'y'}${t.managed ? ` · ${t.managed} managed` : ''}${t.watch ? ` · ${t.watch} watched` : ''}.`,
      }}
      stats={{ items: stats, scope: 'dataset' }}
      tabs={{
        items: TABS,
        value: tab,
        onChange: (value) => {
          if (isTabKey(value)) qs.set({ tab: value });
        },
        ariaLabel: 'Holdings view',
        idPrefix: 'holdings',
      }}
      search={{ noun: 'holdings', value: search, onChange: (value) => qs.set({ search: value }) }}
      view={{ value: view, onChange: (value) => qs.set({ view: value }) }}
      filters={{
        fields: FILTER_FIELDS,
        values: filterValues,
        ctx,
        onChange: (next) =>
          qs.set({
            kind: next.kind,
            status: next.status,
            stake: next.stake,
            group: next.group,
            pb: next.pb,
          }),
        onClear: () => qs.reset(),
        open: showFilters,
        onOpenChange: setShowFilters,
      }}
      /* Bimodal by design: the parcels tab opens the manual form, every other
         tab opens the AI classifier that routes agricultural deeds to parcels
         and everything else to properties. */
      primaryAction={
        tab === 'parcels'
          ? { label: 'Add Parcel', icon: <AddIcon />, onClick: () => setAddParcelOpen(true) }
          : { label: 'Add', icon: <AddIcon />, onClick: () => setAddOpen(true) }
      }
      exportConfig={{ filename: exportName, brand: exportBrand('Land & Properties Register') }}
      rows={shown}
      getRowKey={(r) => `${r.kind}-${r.id}`}
      rowLabel={(r) => r.title}
      total={holdings.length}
      columns={columns}
      table={{ onRowOpen: openDetail, rowActions }}
      renderCard={renderCard}
      state={{ isLoading, isUnreachable: isSample }}
      empty={{
        icon: '🌍',
        title: 'Add your first holding',
        body: "Farmland parcels, plots, flats or commercial spaces — upload the deed, passbook or allotment letter and it's read, classified and filed in the right place automatically.",
        primaryAction: { label: '＋ Add a holding', onClick: () => setAddOpen(true) },
      }}
    >
      {/* The AI uploader classifies each document — agricultural deeds are
          filed as land parcels, everything else as properties. */}
      <AddPropertyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          refresh();
        }}
        notify={notify}
      />
      <AddParcelDialog
        open={addParcelOpen}
        onClose={() => setAddParcelOpen(false)}
        onCreated={refresh}
        passbooks={data.passbooks.map((b) => ({ id: b.id, pattadarNo: b.pattadarNo, village: b.village }))}
        notify={notify}
      />
      <StakeDialog target={stakeTarget} onClose={() => setStakeTarget(null)} onDone={refresh} notify={notify} />
      <LocationDialog target={locTarget} onClose={() => setLocTarget(null)} onDone={refresh} notify={notify} />

      {/* The managed hidden input behind the cover-photo card action. */}
      {coverPicker.element}
    </ListScreen>
  );
}
