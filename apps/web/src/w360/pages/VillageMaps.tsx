/** Cadastral maps — the survey department's village shape files, browsable.
 *
 *  Everywhere else in this app you start from a record and ask where it is.
 *  Here you start from the ground and ask whose it is, which is how an owner
 *  actually thinks: they know the village and they know their survey number,
 *  and what they want is the shape.
 *
 *  From a plot you can add it to Properties, or hand it to a record that
 *  already exists and has never had a boundary. Either way the geometry is the
 *  department's, not something traced over imagery.
 *
 *  What the inspector shows is only ever what is known. The shape file carries
 *  a number, an extent and a chaltha; the owner, the passbook and the papers
 *  come from THIS ACCOUNT'S records where one matches the plot, and where none
 *  does the panel says so rather than inventing a name for somebody's field.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import StraightenOutlined from '@mui/icons-material/StraightenOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import useMediaQuery from '@mui/material/useMediaQuery';
import PolylineOutlined from '@mui/icons-material/PolylineOutlined';
import { formatAcresGuntas, fromAcres, naturalCompare, villageKey } from '@pattadar/core';

import { apiFetch } from '../../api/client';
import { EMPTY_FILTER, usePapers, useProperties, useSaveRecord, useSetBoundary } from '../api';
import type { RecordCard } from '../api';
import { Card, Empty, FacetFilter, Failed, PageHead, PlaceLine, num, plural } from '../ui';
import type { FacetFilterHandle, HeadActions } from '../ui';
import { Sk, SkMap } from '../skeletons';
import { BANDS, VillageCanvas, bandOf } from '../VillageCanvasLazy';
import { FenceStudio } from '../FenceStudio';
import type { MeasureState, VillageCanvasHandle, VillageMode } from '../VillageCanvasLazy';
import type { MandalEntry, VillageEntry, VillageFacts } from '../villageIndex';
import {
  forgetVillage, loadGlobalOverview, loadMandalOverview, loadVillageCatalog,
  loadVillageFacts, readVillageIndex,
} from '../villageIndex';
import { recordInVillage, resolveVillage } from '../villageResolve';
import { acresText } from '../villageGeom';
import type { PlotFacts } from '../villageGeom';
import { surveyNumber } from '../surveyNumber';
import { ConfirmDialog } from './PropertyActions';

/** What the API says came of an upload. Reported in full rather than as a
 *  tick: which file each village was built from, how many of its plot numbers
 *  had to be recovered from a label sheet, and what was left over. */
interface Landed {
  village: string; key: string; plots: number; from: string; replaced: boolean;
  within: number; near: number; dropped: number; clashes: number;
  duplicates: Array<{ name: string; why: string }>;
}
interface Skipped { name: string; why: string }

/** What the filter has narrowed the map to: mandal keys, village keys and
 *  record ids. Empty everywhere is every mapped village. */
interface MapScope {
  districts: string[]; mandals: string[]; villages: string[]; properties: string[];
  /** Districts put on only because a mandal in them was ticked, so unticking
   *  that mandal takes them off again rather than widening to the district. */
  auto: string[];
}
const NO_SCOPE: MapScope = { districts: [], mandals: [], villages: [], properties: [], auto: [] };

const MODES: Array<{ key: VillageMode; label: string }> = [
  { key: 'satellite', label: 'Satellite' },
  { key: 'street', label: 'Street map' },
  { key: 'extent', label: 'Extent' },
  { key: 'boundaries', label: 'Boundaries' },
];

/** The uploaded maps, listed, added to and taken off at one path. */
const UPLOADS = '/api/gateway/pattadar/village-maps';

/** How many records the adopt list shows before it starts counting. The list
 *  scrolls (`.vm-list`) and is ranked by how close each record's own number is
 *  to the plot in hand, so the cap is a limit on height, not on reach — at
 *  eight, an owner with fifteen parcels in one village simply could not hand
 *  the plot to seven of them. */
const ADOPT_MAX = 40;
const PAPER_MAX = 6;

/** A finder is a way to reach one plot, not a second rendering of the village.
 *  Keep enough prefix matches to disambiguate a survey number without bringing
 *  the old hundreds-row plot column back over the map. */
const PLOT_SUGGESTION_MAX = 8;

/** `setBoundary` answers with a boolean and a REFUSED write is `false`, not a
 *  thrown error. Reading only the error path is what let a plot be filed as a
 *  property and then opened on a map with no shape on it — which is the one
 *  thing filing it from the village map was for. */
const savedBoundary = (r: unknown): boolean =>
  (r as { web?: { setBoundary?: boolean } })?.web?.setBoundary === true;

/** The stage is a fixed-height panel with the map absolutely inside it, so
 *  whatever stands in for the map has to fill it too. The `.hint` chrome is
 *  pinned to the top-left corner, and a single 12px line in the corner of a
 *  60rem panel reads as a panel that failed to paint rather than as a sentence
 *  about what is on it. */
/** The stage while nothing can be drawn on it yet: the whole panel pulses,
 *  the way the map will fill it. */
// The map's own stand-in (tile grid, zoom, scale), not a flat slab — design.md § Loading.
const STAGE_SK = <SkMap />;

const STAGE_FILL: CSSProperties = {
  position: 'absolute', inset: 0, display: 'grid', alignContent: 'center',
  justifyItems: 'center', overflowY: 'auto', padding: 'var(--space-lg)',
};

export function VillageMaps() {
  const nav = useNavigate();
  const [index, setIndex] = useState<VillageEntry[] | null>(null);
  const [village, setVillage] = useState<string | null>(null);
  /** The index row that is open. The name alone is not an address — two
   *  mandals can each have a MYLAVARAM — so the row travels with the name and
   *  is what the plots are read for. */
  const [openEntry, setOpenEntry] = useState<VillageEntry | null>(null);
  /** Every mandal with shipped maps, and the outlines in the current Area
   *  scope. With no Area filter that is the full global published set. */
  const [catalog, setCatalog] = useState<MandalEntry[]>([]);
  /** Only choices the reader made become FacetFilter chips. No choice means
   *  the global list/map, not a hidden automatic mandal. Several may be ticked
   *  in each group: within a group they add up, across groups they narrow. */
  const [areaFilter, setAreaFilter] = useState<MapScope>(NO_SCOPE);
  const [overview, setOverview] = useState<VillageEntry[]>([]);
  const [facts, setFacts] = useState<VillageFacts | null>(null);
  const [loading, setLoading] = useState(false);
  /** Which village's shape file could not be read, and why as far as it can be
   *  told. Held separately from `facts` because a null `facts` used to mean
   *  both "not open" and "failed", and the screen rendered the mandal for both. */
  const [villageErr, setVillageErr] = useState<{ village: string; why: string } | null>(null);
  /** Bumped by Try again. The read is cached per tab, so a retry needs both the
   *  cache forgotten and the effect re-run. */
  const [attempt, setAttempt] = useState(0);
  /** True when the uploads endpoint refused or could not be reached, so the
   *  village list is knowingly short rather than knowingly empty. It comes back
   *  with the list from the same read, so it can never describe a different
   *  attempt than the villages on screen. */
  const [uploadsGone, setUploadsGone] = useState(false);
  const [mode, setMode] = useState<VillageMode>('satellite');
  const [tilesFailed, setTilesFailed] = useState(false);
  const [numbers, setNumbers] = useState(true);
  const [measuring, setMeasuring] = useState(false);
  const [tape, setTape] = useState<MeasureState | null>(null);
  /** The tape is out to mark land that is not on the village map, and what
   *  the owner calls it. Marking IS measuring, with a property at the end. */
  const [marking, setMarking] = useState(false);
  /** On a phone the marking panel sits under the stage, so no panel covers the
   *  ground being drawn on or another panel's field (board 13/10/2026, 10). */
  const phone = useMediaQuery('(max-width:600px)');
  const [newName, setNewName] = useState('');
  const [newVillage, setNewVillage] = useState('');
  const [zoom, setZoom] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [goto, setGoto] = useState('');
  const [gotoNote, setGotoNote] = useState('');
  const [finderOpen, setFinderOpen] = useState(false);
  const [activePlotOption, setActivePlotOption] = useState(0);
  const [openPlot, setOpenPlot] = useState(true);
  // Fencing. Three metres between posts and four strands is what the sheds
  // around here are built to — the seeded features say "620 m · 4 strand" —
  // and the two prices are left empty because a rate is local and this screen
  // has no business guessing one.
  const [fencing, setFencing] = useState(false);
  const [err, setErr] = useState('');
  /** A record that was filed from this plot and did not get its boundary. Kept
   *  so the retry can be the boundary ALONE — filing again would be a second
   *  copy of a property the account already has. */
  const [orphan, setOrphan] = useState<string | null>(null);
  /** A refused removal, said beside the bin that was pressed. The uploader's
   *  own `upErr` is at the bottom of the column, two cards away from the row. */
  const [rmErr, setRmErr] = useState('');
  /** Escape pressed with corners on the map: asked before they are thrown away. */
  const [leaving, setLeaving] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState('');
  const [landed, setLanded] = useState<Landed[]>([]);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const fileBox = useRef<HTMLInputElement>(null);
  const canvas = useRef<VillageCanvasHandle>(null);
  const plotOptionsBox = useRef<HTMLDivElement>(null);
  const fenceTrigger = useRef<HTMLButtonElement>(null);
  /** A property chosen in the filter, waiting for its village's plots to
   *  load so its own plot can be the one selected. */
  const pendingPlot = useRef<string | null>(null);
  /** The filter, so a pick that opens a village can put the popover away
   *  rather than leave it over the map that just opened. */
  const facetFilter = useRef<FacetFilterHandle>(null);
  /** Measuring is a satellite-ground tool, not another display layer. Remember
   *  what the reader was studying so putting the tape away takes them back to
   *  that exact map rather than leaving a hidden mode change behind. */
  const modeBeforeMeasure = useRef<VillageMode | null>(null);
  const resetTape = () => {
    const restore = modeBeforeMeasure.current;
    modeBeforeMeasure.current = null;
    setMeasuring(false);
    setTape(null);
    setMarking(false);
    setNewName('');
    setNewVillage('');
    if (restore) setMode(restore);
  };

  // Every record, unfiltered — the village sheets have to place all of them.
  // EMPTY_FILTER rather than a literal so a new facet cannot silently leave
  // this screen behind, which is exactly what the hand-written object did.
  const records = useProperties(EMPTY_FILTER);
  // No toast: each add says its own failure beside the button, once.
  const saveRecord = useSaveRecord(false);
  const setBoundary = useSetBoundary();

  // Shipped maps and uploaded ones, merged. Without a manifest the browser has
  // no way to know which villages exist — it cannot list a directory.
  //
  // One read, not two. `uploadsGone` comes out of the same merge that built the
  // list, so the two can no longer disagree: a separate probe of the uploads
  // endpoint could answer ok for a list that had just been merged short, or
  // fail for a list that is whole, and either way the warning on screen was
  // about a different moment than the villages under it. Throwing the merged
  // index away on a failure is the data layer's job now — `readVillageIndex`
  // does not keep a partial merge, so a one-second outage is still repaired by
  // Try again.
  useEffect(() => {
    let dropped = false;
    void readVillageIndex().then(({ rows, uploadsFailed }) => {
      if (dropped) return;
      setIndex(rows);
      setUploadsGone(uploadsFailed);
    });
    void loadVillageCatalog().then((rows) => { if (!dropped) setCatalog(rows); });
    return () => { dropped = true; };
  }, []);

  // The plots, their neighbours and the village's own edge — one load, held
  // for as long as the village is open.
  //
  // Both outcomes are said. A village whose file did not come back used to
  // resolve to null, leave `loading` false and fall through to the mandal
  // overview under a head that still named the village — the same map, however
  // many times it was clicked, with nothing anywhere saying the read failed.
  // And a throw out of the geometry pass left `loading` true for good, which is
  // the corner note "Reading the shape file…" that never resolves.
  useEffect(() => {
    if (!village) { setFacts(null); setVillageErr(null); setLoading(false); return undefined; }
    let dropped = false;
    setLoading(true);
    setVillageErr(null);
    // Every village on this screen came from the manifest or a row that says a
    // file exists, and the API refuses an upload with no plots in it — so a
    // null here is a read that failed, not a village nobody has digitised.
    const failedWith = (why: string) => {
      // The read is cached per tab, including its failures, so the cache goes
      // with it. Without this the Try again below is a dead button.
      forgetVillage(openEntry?.key ?? village);
      if (dropped) return;
      setFacts(null);
      setLoading(false);
      setVillageErr({ village, why });
    };
    loadVillageFacts(openEntry ?? village)
      .then((f) => {
        if (!f) {
          failedWith(navigator.onLine
            ? 'The map file did not come back. Try again.'
            : 'This device is offline.');
          return;
        }
        if (dropped) return;
        setFacts(f);
        setLoading(false);
      })
      .catch((e) => failedWith(e instanceof Error ? e.message : 'This map file could not be opened.'));
    return () => { dropped = true; };
  }, [village, openEntry, attempt]);

  /** Measurement depends on visible ground. Entering it keeps the current
   *  display mode aside, switches to satellite imagery and locks the layer
   *  controls; leaving restores the prior mode and clears the tape. */
  const toggleTape = () => {
    if (measuring) {
      resetTape();
      return;
    }
    modeBeforeMeasure.current = mode;
    setMode('satellite');
    setTape(null);
    setMeasuring(true);
  };

  /** Corners are placed by eye on the imagery, so marking waits until the map
   *  is close enough to see a field's edge: zoom 16, the 200 m scale. */
  const MARK_ZOOM = 16;
  const canMark = zoom >= MARK_ZOOM;
  /** A record filed from a drawn shape that did not get its boundary belongs
   *  to that shape; leaving marking lets it go with the corners. */
  const leaveMarking = () => {
    setLeaving(false);
    setOrphan(null);
    setErr('');
    resetTape();
  };
  const toggleMarking = () => {
    if (marking) { leaveMarking(); return; }
    if (!canMark) return;
    // One Add the property on screen at a time: the selected parcel's card goes.
    selectFromMap(null);
    if (!measuring) {
      modeBeforeMeasure.current = mode;
      setMode('satellite');
      setMeasuring(true);
    }
    setTape(null);
    canvas.current?.clearMeasure();
    setErr('');
    setMarking(true);
  };

  /** A mode chip is a switch, not a radio button: clicking the one that is
   *  already on turns it off. "Off" for the imagery is the bare cadastre,
   *  which is what Boundaries is; off for anything else is back to the
   *  imagery, which is where the screen starts. Measuring owns Satellite, so
   *  layer changes are refused defensively as well as disabled in the UI. */
  const pickMode = (m: VillageMode) => {
    if (measuring) return;
    if (m !== mode) { setMode(m); return; }
    setMode(m === 'satellite' ? 'boundaries' : 'satellite');
  };

  // Esc backs out of whatever is on: the tape first, then the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // An open filter popover answers its own Escape; the selected plot and
      // the tape wait for the next press.
      if (document.querySelector('.vm-map-filters .fpop')) return;
      // The discard question answers its own Escape.
      if (leaving) return;
      if (fencing) {
        e.preventDefault();
        setFencing(false);
        requestAnimationFrame(() => fenceTrigger.current?.focus());
      } else if (marking) {
        if (tape?.points) setLeaving(true);
        else leaveMarking();
      } else if (measuring) toggleTape();
      else {
        setSelected(null);
        setGoto('');
        setGotoNote('');
        setFinderOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fencing, measuring, marking, leaving, tape, mode]);

  const refresh = async (keys: string[] = []) => {
    // `readVillageIndex(true)` clears the index cache itself. The separate
    // invalidate that used to open this function was left over from the shape
    // where the index and the uploads probe were two reads that could disagree.
    keys.forEach((k) => forgetVillage(k));
    const { rows, uploadsFailed } = await readVillageIndex(true);
    setIndex(rows);
    setUploadsGone(uploadsFailed);
    return rows;
  };

  const send = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    setUpErr('');
    setRmErr('');
    setLanded([]);
    setSkipped([]);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      const res = await apiFetch(UPLOADS, { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUpErr(body?.error || `That upload failed (${res.status}).`);
        setSkipped(body?.skipped ?? []);
        return;
      }
      const villages = (body.villages ?? []) as Landed[];
      setLanded(villages);
      setSkipped(body.skipped ?? []);
      const rows = await refresh(villages.map((v) => v.village));
      if (villages.length) {
        setVillage(villages[0].village);
        // An upload is keyed by its folded name; that row is the one it made.
        setOpenEntry(rows.find((r) => r.uploaded && r.key === villages[0].key)
          ?? resolveVillage(rows, villages[0].village));
        setAttempt((n) => n + 1);
        setSelected(null);
        resetTape();
        setFencing(false);
      }
    } catch (e) {
      setUpErr(e instanceof Error ? e.message : 'That upload failed.');
    } finally {
      setUploading(false);
      if (fileBox.current) fileBox.current.value = '';
    }
  };

  /** Taking an uploaded map back off.
   *
   *  Nothing is torn down until the server says the row is gone. A refused
   *  DELETE used to close the map and refresh the list anyway, so the village
   *  came straight back and the removal looked like it had undone itself — and
   *  when the refusal is a 401 or a 502 the list GET fails with it, every
   *  uploaded village disappears, and they all return on the next reload. */
  const remove = async (entry: VillageEntry) => {
    if (!entry.uploaded) return;
    setRmErr('');
    let res: Response;
    try {
      res = await apiFetch(`${UPLOADS}/${encodeURIComponent(entry.key)}`, { method: 'DELETE' });
    } catch (e) {
      setRmErr(e instanceof Error ? e.message : `${entry.village} could not be taken off.`);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRmErr(body?.error || `${entry.village} could not be taken off (${res.status}).`);
      return;
    }
    if (village === entry.village) { setVillage(null); setOpenEntry(null); setSelected(null); }
    // A pick of the map just taken off would be a chip naming nothing on file.
    const gone = new Set(mappedRecords.filter((m) => m.entry.key === entry.key).map((m) => m.record.id));
    setAreaFilter((at) => ({
      ...at,
      villages: at.villages.filter((k) => k !== entry.key),
      properties: at.properties.filter((id) => !gone.has(id)),
    }));
    pendingPlot.current = null;
    setLanded([]);
    await refresh([entry.village]);
  };

  /** No selection means the whole published list. Districts and mandals
   *  narrow it by area; a district with a mandal of its own ticked stands for
   *  just those mandals, so ticking KURICHEDU under PRAKASAM narrows PRAKASAM
   *  rather than adding to it. Villages and properties narrow it once more. The
   *  list and the unselected map derive from this same scope — neither can
   *  silently show less. */
  const pickedState = catalog[0]?.state ?? '';
  const pickedMandals = useMemo(
    () => areaFilter.mandals
      .map((key) => catalog.find((m) => m.key === key))
      .filter((m): m is MandalEntry => !!m),
    [areaFilter.mandals, catalog],
  );
  const districts = useMemo(
    () => [...new Set(catalog.filter((m) => m.state === pickedState).map((m) => m.district))].sort(),
    [catalog, pickedState],
  );
  const mandalsHere = useMemo(
    () => catalog.filter((m) => m.state === pickedState
      && (!areaFilter.districts.length || areaFilter.districts.includes(m.district)))
      .sort((a, b) => a.mandal.localeCompare(b.mandal) || a.district.localeCompare(b.district)),
    [catalog, pickedState, areaFilter.districts],
  );
  const inArea = useMemo(() => {
    const { districts: ds } = areaFilter;
    if (!ds.length && !pickedMandals.length) return () => true;
    return (entry: { district?: string; mandal?: string }) =>
      pickedMandals.some((m) => m.mandal === entry.mandal && m.district === entry.district)
      || (!!entry.district && ds.includes(entry.district)
        && !pickedMandals.some((m) => m.district === entry.district));
  }, [areaFilter, pickedMandals]);
  const villagesHere = useMemo(() => (index ?? []).filter(inArea), [index, inArea]);

  /** This account's land, each with the mapped village it sits in. Only a
   *  record that resolves to a village on file can be shown on this map, so
   *  only those are offered. */
  const mappedRecords = useMemo(() => {
    const out: Array<{ record: RecordCard; entry: VillageEntry }> = [];
    for (const r of records.data?.cards ?? []) {
      // Land only, as `mine` below: 'open_plot' is a classification, not a kind.
      if (r.kind !== 'parcel' && r.classification !== 'open_plot') continue;
      if (!r.village) continue;
      const named = (index ?? []).filter((e) => villageKey(e.village) === villageKey(r.village));
      const entry = named.length > 1
        ? named.find((e) => recordInVillage(r, e, true))
        : named[0];
      if (entry) out.push({ record: r, entry });
    }
    return out;
  }, [records.data, index]);

  /** The villages the reader picked, directly or through a property. */
  const chosenEntries = (scope: MapScope) => {
    const keys = new Set(scope.villages);
    for (const id of scope.properties) {
      const hit = mappedRecords.find((m) => m.record.id === id);
      if (hit) keys.add(hit.entry.key);
    }
    return (index ?? []).filter((e) => keys.has(e.key));
  };
  const chosen = useMemo(
    () => chosenEntries(areaFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [areaFilter, mappedRecords, index],
  );
  const shown = useMemo(
    () => (chosen.length ? villagesHere.filter((e) => chosen.includes(e)) : villagesHere),
    [chosen, villagesHere],
  );

  const areaGroups = useMemo(() => [{
    key: 'district', label: 'District', options: districts.map((district) => ({
      key: district, label: district,
      count: catalog.filter((m) => m.state === pickedState && m.district === district)
        .reduce((sum, m) => sum + m.villages, 0),
    })),
  }, {
    key: 'mandal', label: 'Mandal', options: mandalsHere.map((m) => ({
      key: m.key,
      label: areaFilter.districts.length === 1 ? m.mandal : `${m.mandal} · ${m.district}`,
      count: m.villages,
    })),
  }, {
    key: 'property', label: 'Property', options: mappedRecords
      .filter((m) => inArea(m.entry))
      .map((m) => ({ key: m.record.id, label: `${m.record.title} · ${m.entry.village}` })),
  }, {
    // Nine hundred names are found, not read down: listed once something is
    // typed, which is what the village search beside the filter used to do.
    key: 'village', label: 'Village', searchOnly: true, options: villagesHere.map((v) => ({
      key: v.key,
      label: [v.village, v.mandal].filter(Boolean).join(' · '),
      count: v.plots,
    })),
  }], [areaFilter.districts.length, catalog, districts, inArea, mandalsHere, mappedRecords,
    pickedState, villagesHere]);
  /** A chip's words when its option has left the list on screen. */
  const chipLabel = (group: string, key: string) => {
    if (group === 'village') return (index ?? []).find((e) => e.key === key)?.village ?? key;
    if (group === 'property') return mappedRecords.find((m) => m.record.id === key)?.record.title ?? key;
    return key;
  };
  /** Where the filter has narrowed to, said above it. */
  const placeLine = (() => {
    const names = [
      ...areaFilter.districts.filter((d) => !pickedMandals.some((m) => m.district === d)),
      ...pickedMandals.map((m) => `${m.district} · ${m.mandal}`),
    ];
    if (!names.length) return 'All mapped areas';
    return names.length <= 2 ? names.join(', ') : `${plural(names.length, 'area')}`;
  })();

  const clearVillage = () => {
    setVillage(null);
    setOpenEntry(null);
    setSelected(null);
  };
  const clearArea = () => {
    setAreaFilter(NO_SCOPE);
    pendingPlot.current = null;
    clearVillage();
  };
  /** One tick or untick. Districts and mandals change the area, so they put an
   *  open village away and let go of picks the new area no longer holds.
   *  Villages and properties choose what is drawn: down to exactly one village,
   *  that village opens (on the property's own plot, for a property); any
   *  other number goes back to the outlines. */
  const toggleArea = (group: string, key: string) => {
    const flip = (list: string[]) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
    let next: MapScope = areaFilter;
    if (group === 'district') {
      const districtsNext = flip(areaFilter.districts);
      next = {
        ...areaFilter,
        districts: districtsNext,
        auto: areaFilter.auto.filter((d) => d !== key),
        // A district taken off takes its mandals with it.
        mandals: areaFilter.mandals.filter((k) => {
          const m = catalog.find((c) => c.key === k);
          return !!m && districtsNext.includes(m.district);
        }),
      };
    } else if (group === 'mandal') {
      const picked = catalog.find((m) => m.key === key);
      if (!picked) return;
      const mandalsNext = flip(areaFilter.mandals);
      const adding = mandalsNext.includes(key);
      const d = picked.district;
      // Ticking a mandal puts its district on as well, so the chips read as
      // the place they narrow to. Unticking the last mandal of a district put
      // on that way takes the district off with it.
      const lastOfAuto = !adding && areaFilter.auto.includes(d)
        && !mandalsNext.some((k) => catalog.find((c) => c.key === k)?.district === d);
      const addDistrict = adding && !areaFilter.districts.includes(d);
      next = {
        ...areaFilter,
        mandals: mandalsNext,
        districts: addDistrict ? [...areaFilter.districts, d]
          : lastOfAuto ? areaFilter.districts.filter((x) => x !== d) : areaFilter.districts,
        auto: addDistrict ? [...areaFilter.auto, d]
          : lastOfAuto ? areaFilter.auto.filter((x) => x !== d) : areaFilter.auto,
      };
    } else if (group === 'village') {
      next = { ...areaFilter, villages: flip(areaFilter.villages) };
    } else if (group === 'property') {
      next = { ...areaFilter, properties: flip(areaFilter.properties) };
    } else return;

    if (group === 'district' || group === 'mandal') {
      // The picks the new area still holds stay picked.
      const nextMandals = next.mandals
        .map((k) => catalog.find((c) => c.key === k))
        .filter((m): m is MandalEntry => !!m);
      const holds = (e: { district?: string; mandal?: string }) =>
        (!next.districts.length && !nextMandals.length)
        || nextMandals.some((m) => m.mandal === e.mandal && m.district === e.district)
        || (!!e.district && next.districts.includes(e.district)
          && !nextMandals.some((m) => m.district === e.district));
      next = {
        ...next,
        villages: next.villages.filter((k) => {
          const e = (index ?? []).find((v) => v.key === k);
          return !!e && holds(e);
        }),
        properties: next.properties.filter((id) => {
          const m = mappedRecords.find((r) => r.record.id === id);
          return !!m && holds(m.entry);
        }),
      };
      setAreaFilter(next);
      pendingPlot.current = null;
      clearVillage();
      return;
    }

    setAreaFilter(next);
    const picks = chosenEntries(next);
    if (picks.length === 1) {
      const only = group === 'property' && next.properties.includes(key) ? key : null;
      facetFilter.current?.close();
      // Already open and read: select the property's plot now. Opening it
      // again would drop the selection and wait for plots that never change.
      if (openEntry?.key === picks[0].key && village && facts) {
        pendingPlot.current = null;
        if (only) {
          for (const [lp, r] of mine) if (r.id === only) { setSelected(lp); break; }
        }
        return;
      }
      openVillage(picks[0].village, picks[0]);
      pendingPlot.current = only;
    } else {
      pendingPlot.current = null;
      resetTape();
      setFencing(false);
      clearVillage();
    }
  };

  // A property picked in the filter selects its own plot once its village's
  // plots have been read.
  useEffect(() => {
    const want = pendingPlot.current;
    if (!want || !facts) return;
    pendingPlot.current = null;
    for (const [lp, r] of mine) {
      if (r.id === want) { setSelected(lp); return; }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts]);

  // No area loads the root overview and fits every village in the list. Only
  // mandals uses their smaller manifests; anything with a whole district in it
  // filters the global answer. Picked villages narrow either. A failed read
  // gives no outlines rather than leaving the previous scope drawn.
  const onlyMandals = pickedMandals.length > 0
    && areaFilter.districts.every((d) => pickedMandals.some((m) => m.district === d));
  useEffect(() => {
    let dropped = false;
    const job = onlyMandals
      ? Promise.all(pickedMandals.map(loadMandalOverview))
        .then((parts) => (parts.some((p) => p === null) ? null : parts.flat() as VillageEntry[]))
      : loadGlobalOverview();
    void job.then((rows) => {
      if (dropped) return;
      const all = (rows ?? []).filter(inArea);
      setOverview(chosen.length
        ? all.filter((row) => chosen.some((c) => c.key === row.key
          || (villageKey(c.village) === villageKey(row.village) && (c.mandal ?? '') === (row.mandal ?? ''))))
        : all);
    });
    return () => { dropped = true; };
  }, [onlyMandals, pickedMandals, inArea, chosen, index]);

  /** Whether this account's records have actually answered.
   *
   *  Not `records.isLoading`: in react-query v5 that is `isPending && isFetching`,
   *  so a query paused for being offline reports false with no data behind it,
   *  and the screen goes straight back to telling an owner that their own plot
   *  is not one of their records. The presence of an answer is the only safe
   *  test; the status is used for nothing but the wording. */
  const answered = records.data !== undefined;
  const recordsFailed = !answered && records.isError;
  const sharedName = useMemo(() => {
    if (!openEntry) return false;
    const name = villageKey(openEntry.village);
    return (index ?? []).some((entry) => entry.key !== openEntry.key
      && villageKey(entry.village) === name);
  }, [index, openEntry]);

  /** Which of this account's records sit in this village, by plot number. The
   *  only place an owner name or a passbook on this screen can honestly come
   *  from — the shape file has neither. */
  const mine = useMemo(() => {
    const out = new Map<string, RecordCard>();
    if (!village) return out;
    const plotNumbers = new Map((facts?.plots ?? []).map((p) => [surveyNumber(p.lp), p.lp]));
    for (const r of records.data?.cards ?? []) {
      // Land only. A flat in the same village is titled "Flat 4B", and the
      // number in it is a door — claiming plot 4 of the village for it would
      // put a stranger's field under somebody's apartment.
      //
      // `kind` is only ever 'parcel' or 'property' (see _cards in web360.py);
      // 'flat', 'shop' and 'open_plot' are values of `classification`. Reading
      // an open plot off `kind` matched nothing, so this was parcels-only by
      // accident — and it has to agree with the adopt list below, or a plot
      // could be handed to an open plot that then never shows as yours on it.
      if (r.kind !== 'parcel' && r.classification !== 'open_plot') continue;
      if (!recordInVillage(r, openEntry ?? { village }, sharedName)) continue;
      const number = surveyNumber(r.title);
      const lp = number ? plotNumbers.get(number) : undefined;
      if (lp && !out.has(lp)) out.set(lp, r);
    }
    return out;
  }, [records.data, village, facts, openEntry, sharedName]);

  const plot: PlotFacts | null = selected ? facts?.byLp.get(selected) ?? null : null;
  const record = plot ? mine.get(plot.lp) ?? null : null;
  const papers = usePapers(record?.id);
  const neighbours = plot ? facts?.neighbours.get(plot.lp) ?? [] : [];

  /** Plot-number suggestions are prefix-only. Typing `1` offers `1`, `10`,
   *  `1234` and so on; it does not surface every number that happens to contain
   *  a one. An exact whole survey number is ranked first, while subdivision
   *  identity remains intact (`214` can suggest `214/2`, but never becomes it
   *  until that full option is chosen). */
  const plotMatches = useMemo(() => {
    const prefix = surveyNumber(goto);
    if (!prefix) return [];
    return [...(facts?.plots ?? [])]
      .filter((p) => surveyNumber(p.lp).startsWith(prefix))
      .sort((a, b) => {
        const aNo = surveyNumber(a.lp);
        const bNo = surveyNumber(b.lp);
        const exact = Number(aNo !== prefix) - Number(bNo !== prefix);
        return exact || naturalCompare(aNo, bNo);
      });
  }, [facts, goto]);
  const suggestedPlots = plotMatches.slice(0, PLOT_SUGGESTION_MAX);
  const finderExpanded = finderOpen && goto.trim().length > 0 && suggestedPlots.length > 0;

  // Active-descendant keeps keyboard focus in the input. Make its visual row
  // follow the arrow keys too, including the seventh and eighth matches below
  // the compact listbox's first screenful.
  useEffect(() => {
    if (!finderExpanded) return;
    const i = Math.min(activePlotOption, suggestedPlots.length - 1);
    plotOptionsBox.current?.querySelector<HTMLElement>(`#vm-plot-option-${i}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activePlotOption, finderExpanded, suggestedPlots.length]);

  /** Every village outline in the current Area scope. With no filter this is
   *  the global set: the list and map answer the same question. Without a
   *  catalog (an older /vm/ build, or only uploads), use whatever outlines the
   *  index itself carries. */
  const mandal = useMemo(
    () => (catalog.length ? overview : shown.filter((v) => (v.outline?.length ?? 0) > 0)),
    [catalog, overview, shown],
  );

  /** Land marked on the all-villages map has no village yet. The mapped
   *  villages whose centres lie within 10 km of the shape are suggested,
   *  nearest first, and the nearest is filled in; the owner can type another
   *  — the shape is theirs, the name only a guess. */
  const ringKey = tape && tape.ring.length >= 3 ? tape.ring.map((p) => p.join(',')).join(';') : '';
  const nearVillages = useMemo(() => {
    if (village || !ringKey || !tape) return [];
    const lat = tape.ring.reduce((a, p) => a + p[0], 0) / tape.ring.length;
    const lon = tape.ring.reduce((a, p) => a + p[1], 0) / tape.ring.length;
    const kx = Math.cos((lat * Math.PI) / 180);
    const near = new Map<string, number>();
    for (const m of mandal) {
      if (!m.centre) continue;
      const km = Math.hypot((m.centre[0] - lat) * 111.32, (m.centre[1] - lon) * 111.32 * kx);
      if (km < 10 && km < (near.get(m.village) ?? Infinity)) near.set(m.village, km);
    }
    return [...near].sort((a, b) => a[1] - b[1]).map(([name]) => name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ringKey stands for the tape's ring
  }, [village, ringKey, mandal]);
  const nearVillage = nearVillages[0] ?? '';
  useEffect(() => {
    if (marking && nearVillage && !newVillage) setNewVillage(nearVillage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- offer once; a typed name is kept
  }, [marking, nearVillage]);

  /** Open a village. A row off the list or the map is exact; a bare name (the
   *  mandal map's click hands back the name it drew) is looked up in the
   *  mandal on screen first, where names are unique, then in the index. */
  function openVillage(name: string, entry?: VillageEntry) {
    const want = villageKey(name);
    setOpenEntry(entry
      ?? overview.find((v) => villageKey(v.village) === want)
      ?? resolveVillage(index ?? [], name));
    resetTape();
    setFencing(false);
    setVillage(name);
    setSelected(null);
    setGoto('');
    setGotoNote('');
    setFinderOpen(false);
    setActivePlotOption(0);
    setRmErr('');
  }

  // A half-filed record and the failure line that explains it belong to the
  // plot they came from; moving to another plot must not offer to put THIS
  // plot's shape on the record that one left behind.
  useEffect(() => {
    setOrphan(null);
    setErr('');
    setFencing(false);
  }, [selected, village]);

  const bandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of facts?.plots ?? []) {
      const b = bandOf(p.acres).key;
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return counts;
  }, [facts]);

  /** What the fence calculator would open on: the shape just walked if the
   *  tape is out with something in it, otherwise the plot that is selected.
   *  The tape wins because it is the more deliberate act — somebody drew that
   *  on purpose. */
  const toFence = useMemo(() => {
    if (tape?.error) return null;
    if (tape && tape.ring.length >= 2) {
      return {
        title: 'The shape you measured',
        subtitle: `${tape.points} points`,
        figure: plural(tape.points, 'point'),
        ring: tape.ring,
        closed: tape.ring.length >= 3,
      };
    }
    if (plot) {
      const ac = acresText(plot);
      return {
        title: `Parcel ${plot.lp}`,
        subtitle: village ?? '',
        // The head's figure is the parcel's extent: the village is its eyebrow.
        // A measured sliver prints "0.00", and no zero is drawn as a fact.
        figure: Number(ac) > 0 ? `${ac} ac` : '',
        ring: plot.ring,
        closed: true,
      };
    }
    return null;
  }, [tape, plot, village]);

  const showPlot = (hit: PlotFacts, move: boolean) => {
    if (move && !canvas.current?.goTo(hit.lp)) return false;
    setSelected(hit.lp);
    setOpenPlot(true);
    setGoto(hit.lp);
    setGotoNote(`Parcel ${hit.lp} · ${acresText(hit)} ac`);
    setFinderOpen(false);
    setActivePlotOption(0);
    setHovered(null);
    return true;
  };

  const flyTo = (lp: string) => {
    const hit = facts?.byLp.get(lp);
    return hit ? showPlot(hit, true) : false;
  };

  /** Canvas polygons are pointer targets, while the finder is their keyboard
   *  equivalent. Whichever one selects the plot updates the other, so a click
   *  on an unfamiliar shape immediately names its survey number. */
  const selectFromMap = (lp: string | null) => {
    if (!lp) {
      setSelected(null);
      setGoto('');
      setGotoNote('');
      setFinderOpen(false);
      return;
    }
    const hit = facts?.byLp.get(lp);
    if (hit) showPlot(hit, false);
  };

  const goToPlot = (preferred?: PlotFacts) => {
    const wanted = goto.trim();
    if (!wanted) return;
    const number = surveyNumber(wanted);
    if (!number) {
      setGotoNote('Enter a survey number, for example 1234 or 1234/2.');
      setFinderOpen(false);
      return;
    }
    const exact = facts?.plots.find((p) => surveyNumber(p.lp) === number);
    const hit = preferred ?? exact ?? plotMatches[0];
    if (!hit) {
      setGotoNote(`No parcel number starts with ${wanted} in this village.`);
      setFinderOpen(false);
      return;
    }
    showPlot(hit, true);
  };

  /** Land drawn on the imagery becomes a property the same way a mapped
   *  parcel does: the record, then its shape, and Properties only once the
   *  shape is really on it. */
  const fileDrawn = () => {
    const name = newName.trim();
    const at = village ?? newVillage.trim();
    if (!at || !surveyNumber(name) || !tape || tape.acres == null || tape.error || orphan) return;
    const ring = tape.ring;
    setErr('');
    saveRecord.mutate({
      input: {
        kind: 'parcel', title: name, classification: 'agri', status: 'owned',
        stake: 'owned', village: at, extent: Number(tape.acres.toFixed(2)), extentUnit: 'ac',
      },
    }, {
      onSuccess: (res) => {
        const id = (res as { web?: { saveRecord?: string } })?.web?.saveRecord;
        if (!id) { setErr('That land could not be added to Properties.'); return; }
        // Kept so the retry is the boundary alone, never a second record.
        const refused = (how: string) => {
          setOrphan(id);
          setErr(`${name} was added to Properties, but its boundary ${how}. `
               + 'Try the boundary again, or open Properties and draw the shape.');
        };
        setBoundary.mutate({ recordId: id, ring: ring.flat() }, {
          onSuccess: (r) => {
            if (savedBoundary(r)) { resetTape(); nav(`/properties/${id}/location`); return; }
            refused('was refused');
          },
          onError: () => refused('could not be saved'),
        });
      },
      onError: () => setErr('That land could not be added to Properties.'),
    });
  };

  const fileNew = () => {
    if (!plot || !village) return;
    setErr('');
    saveRecord.mutate({
      input: {
        kind: 'parcel', title: plot.lp, classification: 'agri', status: 'owned',
        stake: 'owned', village, extent: plot.acres, extentUnit: 'ac',
      },
    }, {
      onSuccess: (res) => {
        const id = (res as { web?: { saveRecord?: string } })?.web?.saveRecord;
        if (!id) { setErr('That parcel could not be added to Properties.'); return; }
        // The shape is the whole point of adding it from here, so it goes on
        // in the same breath rather than leaving a record with no boundary —
        // and Properties opens only once that shape is actually on it. The
        // navigation used to hang off onSettled, which fires on failure too,
        // so a refused boundary could look like a completed add.
        setBoundary.mutate({ recordId: id, ring: plot.ring.flat() }, {
          onSuccess: (r) => {
            if (savedBoundary(r)) { setOrphan(null); nav(`/properties/${id}/location`); return; }
            setOrphan(id);
            setErr(`${plot.lp} was added to Properties, but its boundary was refused. `
                 + 'Try the boundary again, or open Properties and draw the shape.');
          },
          onError: (e) => {
            setOrphan(id);
            setErr(`${plot.lp} was added to Properties, but its boundary could not be saved`
                 + `${e instanceof Error ? ` — ${e.message}` : ''}. `
                 + 'Try the boundary again, or open Properties and draw the shape.');
          },
        });
      },
      onError: () => setErr('That parcel could not be added to Properties.'),
    });
  };

  /** The retry for a record that was filed without its shape. The boundary
   *  alone: the record exists, and filing it a second time would leave the
   *  account holding two copies of one plot. */
  const retryBoundary = () => {
    // A drawn shape's record takes the corners on the map; a parcel's, the parcel.
    const ring = marking ? tape?.ring : plot?.ring;
    if (!orphan || !ring) return;
    const id = orphan;
    setErr('');
    setBoundary.mutate({ recordId: id, ring: ring.flat() }, {
      onSuccess: (r) => {
        if (!savedBoundary(r)) {
          setErr('That boundary was refused again — the shape may have fewer than '
               + 'three usable corners.');
          return;
        }
        setOrphan(null);
        if (marking) resetTape();
        nav(`/properties/${id}/location`);
      },
      onError: (e) => setErr(e instanceof Error ? e.message : 'That boundary could not be saved.'),
    });
  };

  const linkTo = (recordId: string) => {
    if (!plot) return;
    setErr('');
    setBoundary.mutate({ recordId, ring: plot.ring.flat() }, {
      // A refused write answers `false` rather than throwing, and moving to the
      // record's map on that is how a boundary that was never saved came to
      // look saved.
      onSuccess: (r) => {
        if (savedBoundary(r)) { nav(`/properties/${recordId}/location`); return; }
        setErr('That boundary was refused — the shape may have fewer than three '
             + 'usable corners, or that property is no longer yours.');
      },
      onError: (e) => setErr(e instanceof Error ? e.message : 'That boundary could not be saved.'),
    });
  };

  /** Records this plot could be given to: land, in the village being browsed,
   *  with no boundary on it yet — which is exactly what this card offers.
   *
   *  Village alone was not enough. The list included flats and shops, so one
   *  click could put two acres of somebody's field under an apartment, and it
   *  included records that already carry a surveyed ring, which `linkTo` then
   *  overwrote with no warning at all — the record's own Boundary tab calls
   *  that "Replace the boundary with this plot" for good reason.
   *
   *  Ranked by how near each record's own number is to the plot in hand, so in
   *  a village where the account holds fifteen parcels the right one is at the
   *  top rather than lost alphabetically below the cap. */
  const adoptable = useMemo(() => {
    const rows = records.data?.cards ?? [];
    if (!village) return [];
    const leadingSurvey = (value: string) => {
      const head = surveyNumber(value).split('/')[0];
      const n = Number(head);
      return Number.isFinite(n) ? n : Number.NaN;
    };
    const wanted = leadingSurvey(plot?.lp ?? '');
    const distance = (r: RecordCard) => {
      const n = leadingSurvey(r.title);
      if (!Number.isFinite(n) || !Number.isFinite(wanted)) return Number.POSITIVE_INFINITY;
      return Math.abs(n - wanted);
    };
    return rows
      // 'open_plot' is a classification, not a kind — see `mine` above.
      .filter((r) => (r.kind === 'parcel' || r.classification === 'open_plot')
                  && recordInVillage(r, openEntry ?? { village }, sharedName)
                  && r.ring.length === 0)
      .sort((a, b) => distance(a) - distance(b) || naturalCompare(a.title, b.title));
  }, [records.data, village, plot, openEntry, sharedName]);

  if (index === null) {
    return (
      <main className="vm">
        <PageHead title="Cadastral maps" summary={<Sk w="18rem" h="1rem" r="var(--radius-xs)" />} />
        {/* The page's own boxes, grey: the place line and filter band, then
            the stage at its real height, so nothing moves when the index lands. */}
        <section className="vm-map-filters" aria-hidden>
          <div className="placeline"><Sk w="6rem" /><Sk w="12rem" /></div>
          <div className="filterbar band">
            <Sk w="5.5rem" h="1.9rem" r="var(--radius-pill)" />
            <span className="grow" />
            <Sk w="4rem" />
          </div>
        </section>
        <div className="vm-body solo" role="status" aria-busy="true" aria-label="Loading the cadastral maps">
          <div className="vm-stage" aria-hidden>{STAGE_SK}</div>
        </div>
      </main>
    );
  }

  /** What the stage is actually drawing, which is not the same question as
   *  which village is chosen. Fit and Print act on the canvas, and there is no
   *  canvas while a shape file is being read or after one failed — "Fit
   *  village" over the mandal overview was aiming at a map that is not the
   *  village named beside it. */
  const stage: 'village' | 'mandal' | null =
    facts ? 'village' : (!villageErr && mandal.length > 0 ? 'mandal' : null);

  /** Upload is a page action when maps exist and the empty state's primary
   *  action when none do. The picker and its outcome are separate so the
   *  header does not become a card merely to report what the file produced. */
  const uploadTitle = 'Add a village that is not on the map yet, from its map file (KMZ or KML)';
  const openPicker = () => fileBox.current?.click();
  /** The file box behind every "Add a cadastral map": drawn once, outside
   *  the head, so the head's command is data (design.md § Page head). */
  const fileInput = (
    <input
      ref={fileBox} type="file" multiple accept=".kml,.kmz"
      aria-label="Cadastral map file" style={{ display: 'none' }}
      onChange={(e) => void send(e.target.files)}
    />
  );
  /** The empty state's own add: the one filled button on a first-run page. */
  const uploadPicker = (filled: boolean) => (
    <div className="row tight">
      {/* For a village the map does not have yet: the survey department's
          shape file for it, as KMZ or KML, adds it here for this account. */}
      <button type="button" className={`btn${filled ? ' primary' : ''}`} disabled={uploading}
              title={uploadTitle} onClick={openPicker}>
        <UploadFileOutlined sx={{ fontSize: 16 }} />
        {uploading ? 'Reading…' : 'Add a cadastral map'}
      </button>
    </div>
  );
  const uploadReport = () => (
    <>
      {upErr && (
        <p className="note" style={{ color: 'var(--w-danger)', marginTop: 'var(--space-sm)' }}>
          {upErr}
        </p>
      )}
      {landed.map((v) => (
        <div key={v.key} className="note" style={{ marginTop: 'var(--space-sm)' }}>
          <strong>{v.village}</strong> — {plural(v.plots, 'parcel')}
          {v.replaced ? ', replacing the one on file' : ''}, from {v.from}.
          {(v.within + v.near) > 0 && (
            <> {num(v.within + v.near)} parcel numbers were read off a separate label sheet.</>
          )}
          {v.dropped > 0 && (
            <> {num(v.dropped)} shape{v.dropped === 1 ? '' : 's'} had no number
              and {v.dropped === 1 ? 'was' : 'were'} left out.</>
          )}
          {v.clashes > 0 && (
            <> {num(v.clashes)} parcel number{v.clashes === 1 ? ' is' : 's are'} claimed
              by more than one shape.</>
          )}
          {v.duplicates.map((d) => (
            <span key={d.name}> {d.name} was not used ({d.why}).</span>
          ))}
        </div>
      ))}
      {skipped.map((sk) => (
        <p key={sk.name} className="note" style={{ marginTop: 'var(--space-xs)' }}>
          {sk.name} — {sk.why}
        </p>
      ))}
    </>
  );
  const uploader = (filled: boolean) => <>{uploadPicker(filled)}{uploadReport()}</>;

  const tileNotice = tilesFailed && (
    <div className="vc-legend vc-tile-error" role="status">
      <span className="note">{mode === 'street' ? 'Street map' : 'Imagery'} could not fully load.</span>
      <button type="button" className="btn sm" onClick={() => canvas.current?.retryTiles()}>Retry map</button>
    </div>
  );

  /** What sits above the title: the level above this one, never this level
   *  itself (spec § Village maps, "Three levels"). The mandal is the page, so
   *  nothing; a village sits under the page; a plot with a tool open on it sits
   *  under its village. Naming the level itself put "Village maps" on the first
   *  screen three times with the rail, and a village's name twice. */
  const above = fencing && toFence ? village : village ? 'Cadastral maps' : null;

  /** Back up one level out of a village. Picks that opened it go with it,
   *  or the chips would name a village no longer on screen. */
  const leaveVillage = () => {
    resetTape();
    setFencing(false);
    pendingPlot.current = null;
    // Picks that resolve to just this village are what opened it, so they go
    // with it. A wider set of picks is the overview being gone back to.
    if (chosen.length === 1 && chosen[0].key === openEntry?.key) {
      setAreaFilter((at) => ({ ...at, villages: [], properties: [] }));
    }
    clearVillage();
  };
  /** The head's commands (design.md § Page head): outlined secondaries, the
   *  ⋮, then "Add a cadastral map" as the one filled primary (F3).
   *
   *  The fence calculator is open on ONE parcel, so the only way out of it is
   *  up: back to the village the parcel is in. The map's own buttons are not
   *  attached to anything on screen while it has the stage, and the studio
   *  carries its own Print. Off a village, "All villages" stays even when its
   *  map failed — it is the only way out from there. Only a map this account
   *  uploaded can be taken off; that sits in the ⋮. */
  const headActions: HeadActions | undefined = fencing && toFence
    ? {
      secondaries: [{
        label: village ? `Back to ${village}` : 'Back to the village',
        icon: <ArrowBackOutlined sx={{ fontSize: 16 }} />,
        onClick: () => {
          setFencing(false);
          requestAnimationFrame(() => fenceTrigger.current?.focus());
        },
      }],
    }
    : fencing
      ? undefined
      : {
        secondaries: [
          ...(village
            ? [{ label: 'All villages', icon: <ArrowBackOutlined sx={{ fontSize: 16 }} />, onClick: leaveVillage }]
            : []),
          ...(stage
            ? [{ label: 'Print', icon: <PrintOutlined sx={{ fontSize: 16 }} />, onClick: () => window.print() }]
            : []),
        ],
        overflow: village && openEntry?.uploaded
          ? [{
            label: 'Remove this map', icon: <DeleteOutlineOutlined sx={{ fontSize: 16 }} />, danger: true,
            onClick: () => void remove(openEntry),
          }]
          : undefined,
        overflowLabel: village ? `Actions for ${village}` : undefined,
        // First-run (no maps at all): the empty card carries the one add.
        primary: index.length > 0
          ? {
            label: uploading ? 'Reading…' : 'Add a cadastral map',
            icon: <UploadFileOutlined sx={{ fontSize: 16 }} />,
            tip: uploadTitle,
            disabled: uploading,
            onClick: openPicker,
          }
          : undefined,
      };
  /** Figures under the title (design.md § Page head, "Summary"). Off a
   *  village it is the totals on file, whatever the filter lets through — the
   *  band's tally counts that — so a filter that matches nothing leaves it
   *  standing; with the uploads unread those totals are knowingly short, so
   *  there are none (the band's warning says why). An open village carries
   *  its own figures. While its shape file is read the line is a placeholder
   *  — `facts` still holds the last village until then — and once that read
   *  has failed it is nothing (the Failed card says so): what must never
   *  stand under a village's name is the overview's or another village's
   *  figures. */
  const parcelsOnFile = index.reduce((t, v) => t + (v.plots ?? 0), 0);
  const summary: ReactNode = fencing && toFence
    ? toFence.figure
    : village && facts && !loading
      ? [
        plural(facts.plots.length, 'parcel'),
        facts.acres >= 0.005 ? `${num(facts.acres, 2)} ac` : '',
      ].filter(Boolean).join(' · ')
      : village
        ? (villageErr ? undefined : <Sk w="18rem" h="1rem" r="var(--radius-xs)" />)
        : index.length && !uploadsGone
          ? [
            plural(index.length, 'village'),
            parcelsOnFile > 0 ? plural(parcelsOnFile, 'parcel') : '',
          ].filter(Boolean).join(' · ')
          : undefined;

  /** The Mark a new boundary toggle and the tape's panel, shared by a
   *  village's map and the all-villages map: land can be marked anywhere the
   *  imagery is close enough to see it. Above the 200 m scale it is not drawn
   *  at all (Reddy, 13/10/2026): it appears once marking can work. */
  const markButton = (marking || canMark) && (
    <button type="button" className="btn sm"
            aria-pressed={marking}
            disabled={!marking && measuring}
            aria-describedby={marking ? undefined : measuring ? 'vm-mark-off' : undefined}
            onClick={toggleMarking}>
      <PolylineOutlined sx={{ fontSize: 15 }} aria-hidden />
      Mark a new boundary
    </button>
  );
  const tapePanel = (
    <>
      {measuring && (
        <div className="vc-legend vc-measure">
          <span className="eyebrow">
            {marking ? 'Marking a new boundary' : 'Measuring'} · Satellite view on
          </span>
          <span id="vm-measure-ground" className="note">
            {tape && tape.points > 1
              ? `${tape.points >= 3 ? 'Perimeter' : 'Distance'} ${num(tape.metres, 1)} m · ${tape.points} points`
              : marking ? 'Choose each corner of your land on the map.' : 'Choose each corner.'}
          </span>
          {/* The two ground tools shut each other off; the one that is off says why. */}
          <span id={marking ? 'vm-measure-off' : 'vm-mark-off'} className="note">
            {marking
              ? 'Turn Mark a new boundary off to measure on satellite.'
              : 'Turn Measure on satellite off to mark a new boundary.'}
          </span>
          {/* The precision that is filed, as every parcel label prints it. */}
          {tape?.acres != null && (
            <span className="note">Encloses {tape.acres.toFixed(2)} ac</span>
          )}
          {/* An unusable shape is an error, said as the save error is. */}
          {tape?.error && (
            <span className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{tape.error}</span>
          )}
          <span className="row tight">
            <button type="button" className="btn sm" disabled={!tape?.points}
                    onClick={() => canvas.current?.undoMeasure()}>Undo point</button>
            <button type="button" className="btn sm" disabled={!tape?.points}
                    onClick={() => canvas.current?.clearMeasure()}>
              {marking ? 'Clear corners' : 'Clear measure'}
            </button>
          </span>
          {marking && tape?.acres != null && !tape.error && (
            <span style={{ display: 'grid', gap: 'var(--space-xs)' }}>
              {!village && (
        <>
          <label className="eyebrow" htmlFor="vm-new-village">Village</label>
          <input id="vm-new-village" type="text" value={newVillage} maxLength={80}
                 list={nearVillages.length ? 'vm-near-villages' : undefined}
                 onChange={(e) => { setErr(''); setNewVillage(e.target.value); }} />
          <datalist id="vm-near-villages">
            {nearVillages.map((v) => <option key={v} value={v} />)}
          </datalist>
          {newVillage && newVillage === nearVillage && (
            <span className="note">The nearest mapped village. Change it if your land is in another.</span>
          )}
        </>
      )}
      <label className="eyebrow" htmlFor="vm-new-name">Survey number</label>
              <input id="vm-new-name" type="text" value={newName} maxLength={80}
                     placeholder="For example 123/4"
                     aria-invalid={newName.trim() !== '' && !surveyNumber(newName)}
                     aria-describedby={newName.trim() && !surveyNumber(newName) ? 'vm-new-name-bad' : undefined}
                     onChange={(e) => { if (!orphan) setErr(''); setNewName(e.target.value); }} />
              {newName.trim() && !surveyNumber(newName) && (
                <span id="vm-new-name-bad" className="note">Enter a survey number, for example 1234 or 1234/2.</span>
              )}
              {orphan ? (
                // The record is filed; only its shape is missing.
                <button type="button" className="btn sm primary" disabled={setBoundary.isPending}
                        onClick={retryBoundary}>
                  {setBoundary.isPending ? 'Saving…' : 'Try the boundary again'}
                </button>
              ) : (
                <button type="button" className="btn sm primary"
                        disabled={!surveyNumber(newName) || !(village ?? newVillage.trim()) || saveRecord.isPending || setBoundary.isPending}
                        aria-describedby={newName.trim() && !surveyNumber(newName) ? 'vm-new-name-bad' : undefined}
                        onClick={fileDrawn}>
                  {saveRecord.isPending || setBoundary.isPending ? 'Adding…' : 'Add the property'}
                </button>
              )}
            </span>
          )}
          {marking && err && <span className="note" role="alert" style={{ color: 'var(--w-danger)' }}>{err}</span>}
        </div>
      )}
    </>
  );

  return (
    <main className="vm">
      {/* The shared page head (design.md § Page head). The eyebrow is the
          level ABOVE this one only (spec § Village maps); the mandal is the
          page, so it has none. */}
      <PageHead
        eyebrow={above ?? undefined}
        title={fencing && toFence ? toFence.title : village ?? 'Cadastral maps'}
        actions={headActions}
        summary={summary}
      />
      {fileInput}

      {!fencing && index.length > 0 && (
        <section className="vm-map-filters" aria-label="Cadastral map filters">
          {catalog.length > 0 && (
            <PlaceLine>
              <span>India · {pickedState}</span>
              <strong>{placeLine}</strong>
            </PlaceLine>
          )}
          <FacetFilter
            groups={areaGroups}
            selected={{
              district: areaFilter.districts,
              mandal: areaFilter.mandals,
              property: areaFilter.properties,
              village: areaFilter.villages,
            }}
            onToggle={toggleArea}
            onClear={clearArea}
            ref={facetFilter}
            fold={villageKey}
            missingOptionLabel={chipLabel}
            tally={plural(shown.length, 'village')}
            ariaLabel="Narrow the cadastral map"
            searchPlaceholder="Search areas, villages or properties"
          />
          {uploadsGone && (
            <p className="note" style={{ color: 'var(--w-danger)', marginTop: 'var(--space-sm)' }}>
              Your uploaded cadastral maps could not be loaded.{' '}
              <button type="button" className="btn sm" onClick={() => void refresh()}>Try again</button>
            </p>
          )}
          {rmErr && <p className="note" style={{ color: 'var(--w-danger)' }}>{rmErr}</p>}
          {uploadReport()}
        </section>
      )}

      {index.length === 0 ? (
        // "None on file" and "could not ask" are different sentences, and only
        // one of them is answered by uploading a KMZ. Telling an owner who has
        // eight villages on file to upload them again, because the gateway is
        // down, is asking for the work to be done twice against a server that
        // is not listening.
        <Card title={uploadsGone ? 'Cadastral maps could not be loaded' : 'No cadastral maps yet'}>
          {uploadsGone && (
            <>
              <p className="note" style={{ color: 'var(--w-danger)' }}>
                Your uploaded cadastral maps could not be loaded.
              </p>
              <div className="row tight" style={{ margin: 'var(--space-sm) 0 var(--space-md)' }}>
                {/* The filled button, because this is the answer: the maps
                    are on file and the read failed. The upload below it is
                    still there for a village that is genuinely new. */}
                <button type="button" className="btn sm primary" onClick={() => void refresh()}>
                  Try again
                </button>
              </div>
            </>
          )}
          {uploader(!uploadsGone)}
        </Card>
      ) : (
        // `solo` — the inspector says which plot is selected and how big it is,
        // and the fence calculator's own bar says the same in the same words.
        // While the calculator has the stage that column stands down and gives
        // it the width: two panels answering one question is one too many.
        <div className={`vm-body${(fencing && toFence) || !plot ? ' solo' : ''}`}>
          <div className="vm-stage">
            {fencing && toFence ? (
              <FenceStudio
                title={toFence.title}
                subtitle={toFence.subtitle}
                ring={toFence.ring}
                closed={toFence.closed}
                // Only when this plot IS one of the account's records. A fence
                // request has to hang off something that exists.
                recordId={record?.id}
                recordTitle={record?.title}
                onClose={() => {
                  setFencing(false);
                  requestAnimationFrame(() => fenceTrigger.current?.focus());
                }}
              />
            ) : facts ? (
              <>
                <VillageCanvas
                  // Keyed so the mandal overview and a village's plots are
                  // never the same Leaflet instance with its props swapped
                  // underneath it. The overview used to be torn down by the
                  // corner-note branch in between; now that it stays up while
                  // the shape file is read, the key is what keeps that true.
                  key={`village:${facts.village}`}
                  ref={canvas}
                  village={facts.village}
                  plots={facts.plots}
                  outline={facts.outline}
                  mode={mode}
                  numbers={numbers}
                  selected={selected}
                  hovered={hovered}
                  measuring={measuring}
                  onSelect={selectFromMap}
                  onHover={setHovered}
                  onZoom={setZoom}
                  onMeasure={setTape}
                  onTilesFailed={setTilesFailed}
                />

                <div className="vc-tl">
                  <span className="row tight" role="group" aria-label="Map layer">
                    {MODES.map((m) => (
                      <button key={m.key} type="button"
                              className="chip wash"
                              aria-pressed={mode === m.key}
                              disabled={measuring}
                              title={measuring
                                ? 'Satellite is locked while measuring.'
                                : mode === m.key ? `Turn ${m.label.toLowerCase()} off` : ''}
                              onClick={() => pickMode(m.key)}>
                        {m.label}
                      </button>
                    ))}
                  </span>
                  <span className="row tight">
                    {/* View chips, washed when pressed, as on a property's
                        Location tab: they change what you see, not the
                        record. Fill on this screen is for the one action
                        that commits. */}
                    <button type="button" className="chip wash"
                            aria-pressed={numbers}
                            onClick={() => setNumbers((on) => !on)}>
                      Numbers
                    </button>
                    <button type="button" className="chip wash"
                            aria-pressed={measuring && !marking}
                            disabled={marking}
                            aria-describedby={marking ? 'vm-measure-off' : measuring ? 'vm-measure-ground' : undefined}
                            onClick={toggleTape}>
                      Measure on satellite
                    </button>
                    {markButton}
                  </span>
                  {tileNotice}
                  {mode === 'extent' && (
                    <div className="vc-legend">
                      <span className="eyebrow">Extent</span>
                      {BANDS.map((b) => (
                        <span key={b.key} className="row tight">
                          <i style={{ background: b.hex }} aria-hidden />
                          <span className="grow">{b.label}</span>
                          <span className="num">{num(bandCounts.get(b.key) ?? 0)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {!phone && tapePanel}
                </div>

                <span className="vc-badge">
                  {facts.village} · zoom {zoom || '—'} · numbers {numbers ? 'on' : 'off'}
                </span>

                <div className={marking ? 'vc-tr marking' : 'vc-tr'}>
                  <label className="eyebrow" htmlFor="vm-goto">Find a parcel or survey number</label>
                  <span className="row tight">
                    <input
                      id="vm-goto"
                      value={goto}
                      role="combobox"
                      aria-label="Find a parcel or survey number"
                      aria-autocomplete="list"
                      aria-controls="vm-plot-options"
                      aria-expanded={finderExpanded}
                      aria-activedescendant={finderExpanded
                        ? `vm-plot-option-${Math.min(activePlotOption, suggestedPlots.length - 1)}`
                        : undefined}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Start typing, e.g. 1234"
                      onFocus={() => setFinderOpen(true)}
                      onBlur={() => { setFinderOpen(false); setHovered(null); }}
                      onChange={(e) => {
                        setGoto(e.target.value);
                        setGotoNote('');
                        setFinderOpen(true);
                        setActivePlotOption(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && suggestedPlots.length) {
                          e.preventDefault();
                          setFinderOpen(true);
                          setActivePlotOption((i) => Math.min(i + 1, suggestedPlots.length - 1));
                        } else if (e.key === 'ArrowUp' && suggestedPlots.length) {
                          e.preventDefault();
                          setFinderOpen(true);
                          setActivePlotOption((i) => Math.max(i - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          goToPlot(suggestedPlots[Math.min(activePlotOption, suggestedPlots.length - 1)]);
                        } else if (e.key === 'Escape') {
                          e.stopPropagation();
                          setFinderOpen(false);
                          setHovered(null);
                        }
                      }}
                    />
                    <button type="button" className="btn sm" aria-label="Find parcel"
                            onClick={() => goToPlot()}>
                      <ArrowForwardOutlined sx={{ fontSize: 15 }} />
                    </button>
                  </span>
                  <span className="note" role="status" aria-live="polite">
                    {gotoNote || (!goto.trim()
                      ? ''
                      : !surveyNumber(goto)
                        ? 'Use a number such as 1234 or 1234/2.'
                        : plotMatches.length
                          ? `${plural(plotMatches.length, 'matching parcel')}`
                            + (plotMatches.length > PLOT_SUGGESTION_MAX
                              ? ` · first ${PLOT_SUGGESTION_MAX} shown` : '')
                          : `No parcel number starts with ${goto.trim()} in this village.`)}
                  </span>
                  {finderExpanded && (
                    <div ref={plotOptionsBox} id="vm-plot-options" className="vc-plot-options"
                         role="listbox" aria-label="Matching parcels">
                      {suggestedPlots.map((p, i) => (
                        <button
                          key={p.lp}
                          id={`vm-plot-option-${i}`}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          aria-selected={i === activePlotOption}
                          className="vc-plot-option"
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => { setActivePlotOption(i); setHovered(p.lp); }}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => showPlot(p, true)}>
                          <span>Parcel <strong>{p.lp}</strong></span>
                          <span className="note num">{acresText(p)} ac</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : villageErr ? (
              /* The village that could not be read, said here rather than
                 bounced silently back to the mandal overview. Try again is a
                 real read: the failed one has been forgotten from the tab's
                 cache (see the effect above), so this is not the same answer
                 handed back instantly. */
              <div style={STAGE_FILL}>
                <Failed
                  what={`${villageErr.village}’s map`}
                  error={villageErr.why}
                  onRetry={() => setAttempt((n) => n + 1)}
                />
              </div>
            ) : mandal.length ? (
              <>
                <VillageCanvas
                  key="mandal"
                  ref={canvas}
                  village="mandal"
                  plots={[]}
                  outline={[]}
                  overview={mandal}
                  onPickVillage={openVillage}
                  mode={mode}
                  numbers
                  selected={null}
                  hovered={null}
                  measuring={measuring}
                  onSelect={() => undefined}
                  onHover={() => undefined}
                  onZoom={setZoom}
                  onMeasure={setTape}
                  onTilesFailed={setTilesFailed}
                />
                <div className="vc-tl">
                  <span className="row tight" role="group" aria-label="Map layer">
                    {MODES.filter((m) => m.key !== 'extent').map((m) => (
                      <button key={m.key} type="button"
                              className="chip wash"
                              aria-pressed={mode === m.key}
                              disabled={measuring}
                              onClick={() => pickMode(m.key)}>
                        {m.label}
                      </button>
                    ))}
                  </span>
                  {markButton && <span className="row tight">{markButton}</span>}
                  {tileNotice}
                  {!phone && tapePanel}
                </div>
                {/* The mandal stays up while a village is read. Tearing the
                    map down for a corner note meant the screen went blank for
                    the second or two a shape file takes, which reads as a
                    panel that failed rather than as work in progress. */}
                <span className="vc-badge">
                  {loading && village
                    ? `Reading ${village}’s map file…`
                    : plural(mandal.length, 'village')}
                </span>
              </>
            ) : loading ? (
              // No outlines to hold the stage, so it holds its shape instead.
              <div role="status" aria-busy="true" aria-label={`Reading ${village ?? 'the village'}’s map file`}
                   style={{ position: 'absolute', inset: 0 }}>
                {STAGE_SK}
              </div>
            ) : (
              <div style={STAGE_FILL}>
                <Empty icon="map" title={`${plural(index.length, 'cadastral map')} on file`}>
                  Use Filter to find a village or one of your properties.
                </Empty>
              </div>
            )}
          </div>
          {phone && !(fencing && toFence) && (facts || (!villageErr && mandal.length > 0)) && (
            <div className="vm-tape-below">{tapePanel}</div>
          )}

          {!(fencing && toFence) && plot && (
          <aside className="vm-side">
            {plot && (
              <Card title="Selected parcel">
                <div className="vm-plot">
                  <span className="vm-plotno">
                    <small>Parcel</small>
                    {plot.lp}
                  </span>
                  <span>
                    {/* The figure the finder and the map label print (acresText),
                        so one plot has one extent on this screen. */}
                    <span className="vm-acres">{acresText(plot)}</span>
                    {acresText(plot) === '1' ? ' acre' : ' acres'}
                    <span className="note" style={{ display: 'block' }}>
                      {formatAcresGuntas(plot.acres)} ·{' '}
                      {fromAcres(plot.acres, 'hectare').toFixed(3)} ha
                    </span>
                  </span>
                </div>
                {/* Which number this is matters: one comes off the sheet, one is
                    measured off the polygon, and they are not the same claim. */}
                <p className="note">
                  {plot.measured
                    ? 'Measured from the shape.'
                    : 'As stated on the map file.'}
                  {plot.chaltha ? ` · Chaltha ${plot.chaltha}` : ''}
                </p>

                <dl className="vm-facts">
                  {/* "Not one of your properties" is a claim about the account,
                      and it cannot be made until the account has answered. It
                      used to be printed while the records query was in flight —
                      and to stand for good if the query failed — over a plot
                      the owner was looking at precisely because it is theirs. */}
                  <dt>Owner</dt>
                  <dd>
                    {!answered
                      ? (
                        <span className="note"
                              style={recordsFailed ? { color: 'var(--w-danger)' } : undefined}>
                          {recordsFailed
                            ? 'Your properties could not be loaded'
                            : 'Checking your properties…'}
                        </span>
                      )
                      : record
                        ? record.ownerName || record.title
                        : <span className="note">Not one of your properties</span>}
                  </dd>
                  <dt>Passbook</dt>
                  <dd>
                    {!answered
                      ? <span className="note">{recordsFailed ? 'Not known' : '…'}</span>
                      : record?.khataNo || <span className="note">—</span>}
                  </dd>
                  <dt>Centroid</dt>
                  <dd className="num">
                    {plot.centre[0].toFixed(5)}, {plot.centre[1].toFixed(5)}
                  </dd>
                  {/* No Village row: the village is the page's title and the
                      switch above this card, and a fourth copy of its name
                      here told the owner nothing new. */}
                </dl>

                {openPlot && (
                  <>
                    {neighbours.length > 0 && (
                      <>
                        <span className="eyebrow">Adjoining parcels</span>
                        <div className="row tight" style={{ marginTop: '0.25rem' }}>
                          {neighbours.map((n) => (
                            <button key={n} type="button" className="chip"
                                    onMouseEnter={() => setHovered(n)}
                                    onMouseLeave={() => setHovered(null)}
                                    onClick={() => flyTo(n)}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {record && (
                      <>
                        <hr className="hr" style={{ margin: 'var(--space-md) 0 var(--space-sm)' }} />
                        <span className="eyebrow">Documents on file</span>
                        {/* Three states, three sentences. A two-way branch on
                            `data?.length` said "nothing filed" for a parcel
                            with six documents on it — before the query came
                            back, and for good if it failed. The error branch
                            keeps rows that are already on screen: a failed
                            background refetch must not downgrade a list the
                            owner can see into a denial that it exists. */}
                        {papers.isPending && !papers.data
                          ? <p className="note" aria-busy="true">Looking for documents…</p>
                          : papers.isError && !papers.data
                            ? (
                              <p className="note" style={{ color: 'var(--w-danger)' }}>
                                The documents on {record.title} could not be loaded.{' '}
                                <button type="button" className="btn sm"
                                        onClick={() => void papers.refetch()}>
                                  Try again
                                </button>
                              </p>
                            )
                            : papers.data?.length
                              ? (
                                <>
                                  {papers.data.length > PAPER_MAX && (
                                    <p className="note" style={{ margin: 'var(--space-2xs) 0 var(--space-xs)' }}>
                                      first {PAPER_MAX} of {num(papers.data.length)}
                                    </p>
                                  )}
                                  <div className="rows">
                                    {papers.data.slice(0, PAPER_MAX).map((p) => (
                                      <span key={p.id} className="row between">
                                        <span className="grow">{p.title}</span>
                                        <span className="note">{plural(p.pageCount || 0, 'page')}</span>
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )
                              : <p className="note">No documents on {record.title} yet.</p>}
                      </>
                    )}
                  </>
                )}

                {/* Only where there is something to disclose. On an isolated
                    plot that is nobody's record, More turned the chevron,
                    reported itself expanded and revealed empty space. */}
                {(neighbours.length > 0 || record) && (
                  <button type="button" className="vm-more" aria-expanded={openPlot}
                          onClick={() => setOpenPlot((v) => !v)}>
                    {openPlot ? 'Less' : 'More'} <ExpandMoreOutlined sx={{ fontSize: 16 }} />
                  </button>
                )}

                {err && <p className="note" style={{ color: 'var(--w-danger)' }}>{err}</p>}
                {/* The record exists; only its shape is missing. So the retry
                    is the boundary alone — filing again would be a second copy
                    of the same plot. */}
                {orphan && (
                  <button type="button" className="btn sm" disabled={setBoundary.isPending}
                          style={{ marginTop: 'var(--space-xs)' }}
                          onClick={retryBoundary}>
                    {setBoundary.isPending ? 'Saving…' : 'Try the boundary again'}
                  </button>
                )}

                <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                  {record ? (
                    <button type="button" className="btn sm primary"
                            onClick={() => nav(`/properties/${record.id}/location`)}>
                      Open {record.title}
                    </button>
                  ) : (
                    // Adding waits for the records to answer. On unknown data
                    // this button cannot tell a new plot from one the account
                    // already holds, and the wrong guess is a duplicate record.
                    <button type="button" className="btn sm primary"
                            disabled={!answered || saveRecord.isPending || setBoundary.isPending}
                            onClick={fileNew}>
                      {saveRecord.isPending ? 'Adding…' : 'Add the property'}
                    </button>
                  )}
                  {/* Fencing is a job you do to a shape, so it opens over the
                      map rather than into this column — see FenceStudio. */}
                  <button ref={fenceTrigger} type="button" className="btn sm"
                          disabled={!toFence}
                          onClick={() => setFencing(true)}>
                    <StraightenOutlined sx={{ fontSize: 15 }} /> Fence calculator
                  </button>
                </div>

                {!record && !answered && (
                  <p className="note" style={{
                    marginTop: 'var(--space-xs)',
                    ...(recordsFailed ? { color: 'var(--w-danger)' } : {}),
                  }}>
                    {recordsFailed
                      ? 'Your properties could not be loaded.'
                      : 'Checking your properties…'}
                    {recordsFailed && (
                      <>
                        {' '}
                        <button type="button" className="btn sm"
                                onClick={() => void records.refetch()}>
                          Try again
                        </button>
                      </>
                    )}
                  </p>
                )}

                {!record && adoptable.length > 0 && (
                  <>
                    <hr className="hr" style={{ margin: 'var(--space-md) 0 var(--space-sm)' }} />
                    <span className="eyebrow">Or give it to a property in this village</span>
                    {/* Count what is cut: a list that stops at forty with no
                        total simply puts the other records out of reach. */}
                    <p className="note" style={{ margin: 'var(--space-2xs) 0 var(--space-xs)' }}>
                      {adoptable.length > ADOPT_MAX
                        ? `first ${ADOPT_MAX} of ${num(adoptable.length)}`
                        : plural(adoptable.length, 'property', 'properties')}
                    </p>
                    <div className="rows vm-list">
                      {adoptable.slice(0, ADOPT_MAX).map((r) => (
                        <button key={r.id} type="button" className="villagerow"
                                disabled={setBoundary.isPending}
                                onClick={() => linkTo(r.id)}>
                          <span className="grow">{r.title}</span>
                          <span className="note">
                            {r.extentUnit === 'ac' ? `${num(r.extent, 2)} ac` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            )}

          </aside>
          )}
        </div>
      )}
      {leaving && (
        <ConfirmDialog
          title="Discard these corners?"
          body={`The ${plural(tape?.points ?? 0, 'corner')} you placed will be cleared.`}
          actionLabel="Discard"
          danger
          onConfirm={leaveMarking}
          onClose={() => setLeaving(false)}
        />
      )}
    </main>
  );
}
