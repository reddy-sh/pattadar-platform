/** Village maps — the survey department's own shape files, browsable.
 *
 *  Everywhere else in this app you start from a record and ask where it is.
 *  Here you start from the ground and ask whose it is, which is how an owner
 *  actually thinks: they know the village and they know their survey number,
 *  and what they want is the shape.
 *
 *  From a plot you can file it as a new property, or hand it to a record that
 *  already exists and has never had a boundary. Either way the geometry is the
 *  department's, not something traced over imagery.
 *
 *  What the inspector shows is only ever what is known. The shape file carries
 *  a number, an extent and a chaltha; the owner, the passbook and the papers
 *  come from THIS ACCOUNT'S records where one matches the plot, and where none
 *  does the panel says so rather than inventing a name for somebody's field.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import StraightenOutlined from '@mui/icons-material/StraightenOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import { formatAcresGuntas, fromAcres, naturalCompare, villageKey } from '@pattadar/core';

import { apiFetch } from '../../api/client';
import { EMPTY_FILTER, usePapers, useProperties, useSaveRecord, useSetBoundary } from '../api';
import type { RecordCard } from '../api';
import { Card, Empty, Failed, Loading, num, plural } from '../ui';
import { BANDS, VillageCanvas, bandOf } from '../VillageCanvasLazy';
import { FenceStudio } from '../FenceStudio';
import type { MeasureState, VillageCanvasHandle, VillageMode } from '../VillageCanvasLazy';
import type { VillageEntry, VillageFacts } from '../villageIndex';
import {
  forgetVillage, loadVillageFacts, readVillageIndex,
} from '../villageIndex';
import type { PlotFacts } from '../villageGeom';
import { surveyNumber } from '../surveyNumber';

/** What the API says came of an upload. Reported in full rather than as a
 *  tick: which file each village was built from, how many of its plot numbers
 *  had to be recovered from a label sheet, and what was left over. */
interface Landed {
  village: string; key: string; plots: number; from: string; replaced: boolean;
  within: number; near: number; dropped: number; clashes: number;
  duplicates: Array<{ name: string; why: string }>;
}
interface Skipped { name: string; why: string }

const MODES: Array<{ key: VillageMode; label: string }> = [
  { key: 'satellite', label: 'Satellite' },
  { key: 'street', label: 'Street map' },
  { key: 'extent', label: 'Plot size' },
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
const STAGE_FILL: CSSProperties = {
  position: 'absolute', inset: 0, display: 'grid', alignContent: 'center',
  justifyItems: 'center', overflowY: 'auto', padding: 'var(--space-lg)',
};

export function VillageMaps() {
  const nav = useNavigate();
  const [index, setIndex] = useState<VillageEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [village, setVillage] = useState<string | null>(null);
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
  const [zoom, setZoom] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [goto, setGoto] = useState('');
  const [gotoNote, setGotoNote] = useState('');
  const [find, setFind] = useState('');
  const [openPlot, setOpenPlot] = useState(true);
  // Fencing. Three metres between posts and four strands is what the sheds
  // around here are built to — the seeded features say "620 m · 4 strand" —
  // and the two prices are left empty because a rate is local and this screen
  // has no business guessing one.
  const [fencing, setFencing] = useState(false);
  const [openVillages, setOpenVillages] = useState(true);
  const [err, setErr] = useState('');
  /** A record that was filed from this plot and did not get its boundary. Kept
   *  so the retry can be the boundary ALONE — filing again would be a second
   *  copy of a property the account already has. */
  const [orphan, setOrphan] = useState<string | null>(null);
  /** A refused removal, said beside the bin that was pressed. The uploader's
   *  own `upErr` is at the bottom of the column, two cards away from the row. */
  const [rmErr, setRmErr] = useState('');

  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState('');
  const [landed, setLanded] = useState<Landed[]>([]);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const fileBox = useRef<HTMLInputElement>(null);
  const canvas = useRef<VillageCanvasHandle>(null);
  const fenceTrigger = useRef<HTMLButtonElement>(null);
  const resetTape = () => {
    setMeasuring(false);
    setTape(null);
  };

  // Every record, unfiltered — the village sheets have to place all of them.
  // EMPTY_FILTER rather than a literal so a new facet cannot silently leave
  // this screen behind, which is exactly what the hand-written object did.
  const records = useProperties(EMPTY_FILTER);
  const saveRecord = useSaveRecord();
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
      forgetVillage(village);
      if (dropped) return;
      setFacts(null);
      setLoading(false);
      setVillageErr({ village, why });
    };
    loadVillageFacts(village)
      .then((f) => {
        if (!f) {
          failedWith(navigator.onLine
            ? 'The shape file did not come back.'
            : 'This device is offline.');
          return;
        }
        if (dropped) return;
        setFacts(f);
        setLoading(false);
      })
      .catch((e) => failedWith(e instanceof Error ? e.message : 'The shape file could not be read.'));
    return () => { dropped = true; };
  }, [village, attempt]);

  /** The same geographic points can be measured over imagery, roads or the
   *  bare survey. Changing the background never changes the tape. */
  const toggleTape = () => {
    setMeasuring((on) => !on);
  };

  /** A mode chip is a switch, not a radio button: clicking the one that is
   *  already on turns it off. "Off" for the imagery is the bare cadastre,
   *  which is what Boundaries is; off for anything else is back to the
   *  imagery, which is where the screen starts. */
  const pickMode = (m: VillageMode) => {
    if (m !== mode) { setMode(m); return; }
    setMode(m === 'satellite' ? 'boundaries' : 'satellite');
  };

  // Esc backs out of whatever is on: the tape first, then the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (fencing) {
        e.preventDefault();
        setFencing(false);
        requestAnimationFrame(() => fenceTrigger.current?.focus());
      } else if (measuring) toggleTape();
      else setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fencing, measuring, mode]);

  const refresh = async (keys: string[] = []) => {
    // `readVillageIndex(true)` clears the index cache itself. The separate
    // invalidate that used to open this function was left over from the shape
    // where the index and the uploads probe were two reads that could disagree.
    keys.forEach((k) => forgetVillage(k));
    const { rows, uploadsFailed } = await readVillageIndex(true);
    setIndex(rows);
    setUploadsGone(uploadsFailed);
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
      await refresh(villages.map((v) => v.village));
      if (villages.length) {
        setVillage(villages[0].village);
        setAttempt((n) => n + 1);
        setSelected(null);
        resetTape();
        setFencing(false);
        setOpenVillages(false);       // straight to the map it just took
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
    if (village === entry.village) { setVillage(null); setSelected(null); }
    setLanded([]);
    await refresh([entry.village]);
  };

  const shown = useMemo(() => {
    const all = index ?? [];
    const needle = villageKey(q);
    if (!needle) return all;
    // Matched on the folded key, so "Chintagunta" finds "CHINTHAGUNTA" — the
    // same one-letter difference that loses a village map elsewhere.
    return all.filter((v) => v.key.includes(needle) || villageKey(v.village).includes(needle));
  }, [index, q]);

  /** Whether this account's records have actually answered.
   *
   *  Not `records.isLoading`: in react-query v5 that is `isPending && isFetching`,
   *  so a query paused for being offline reports false with no data behind it,
   *  and the screen goes straight back to telling an owner that their own plot
   *  is not one of their records. The presence of an answer is the only safe
   *  test; the status is used for nothing but the wording. */
  const answered = records.data !== undefined;
  const recordsFailed = !answered && records.isError;

  /** Which of this account's records sit in this village, by plot number. The
   *  only place an owner name or a passbook on this screen can honestly come
   *  from — the shape file has neither. */
  const mine = useMemo(() => {
    const out = new Map<string, RecordCard>();
    if (!village) return out;
    const key = villageKey(village);
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
      if (villageKey(r.village) !== key) continue;
      const number = surveyNumber(r.title);
      const lp = number ? plotNumbers.get(number) : undefined;
      if (lp && !out.has(lp)) out.set(lp, r);
    }
    return out;
  }, [records.data, village, facts]);

  const plot: PlotFacts | null = selected ? facts?.byLp.get(selected) ?? null : null;
  const record = plot ? mine.get(plot.lp) ?? null : null;
  const papers = usePapers(record?.id);
  const neighbours = plot ? facts?.neighbours.get(plot.lp) ?? [] : [];

  const listed = useMemo(() => {
    const all = facts?.plots ?? [];
    const needle = find.trim().toLowerCase();
    const rows = !needle ? all : all.filter((p) => {
      if (p.lp.toLowerCase().includes(needle)) return true;
      const r = mine.get(p.lp);
      return !!r && (r.ownerName.toLowerCase().includes(needle)
                  || r.khataNo.toLowerCase().includes(needle)
                  || r.title.toLowerCase().includes(needle));
    });
    return [...rows].sort((a, b) => naturalCompare(a.lp, b.lp));
  }, [facts, find, mine]);

  /** Every village that can be drawn without being opened. This is the landing
   *  state: the question is "which village", and eight outlines on one map
   *  answer it better than eight names in a list. */
  const mandal = useMemo(
    () => (index ?? []).filter((v) => (v.outline?.length ?? 0) > 0),
    [index],
  );

  const openVillage = (name: string) => {
    resetTape();
    setFencing(false);
    setVillage(name);
    setSelected(null);
    setGoto('');
    setGotoNote('');
    setFind('');
    setRmErr('');
    setOpenVillages(false);
  };

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
        ring: tape.ring,
        closed: tape.ring.length >= 3,
      };
    }
    if (plot) {
      return {
        title: `Plot ${plot.lp}`,
        subtitle: village ?? '',
        ring: plot.ring,
        closed: true,
      };
    }
    return null;
  }, [tape, plot, village]);

  const flyTo = (lp: string) => {
    const ok = canvas.current?.goTo(lp);
    if (ok) { setSelected(lp); setOpenPlot(true); }
    return ok;
  };

  const goToPlot = () => {
    const wanted = goto.trim();
    if (!wanted) return;
    const number = surveyNumber(wanted);
    const hit = facts?.byLp.get(wanted)
      ?? (number ? facts?.plots.find((p) => surveyNumber(p.lp) === number) : undefined);
    if (!hit) { setGotoNote(`No plot ${wanted} in this village.`); return; }
    setGotoNote(`Plot ${hit.lp} · ${hit.acres.toFixed(2)} ac`);
    flyTo(hit.lp);
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
        if (!id) { setErr('That property could not be created.'); return; }
        // The shape is the whole point of filing it from here, so it goes on
        // in the same breath rather than leaving a record with no boundary —
        // and the map is only opened once the shape is actually on it. The
        // navigation used to hang off onSettled, which fires on failure too,
        // so a refused boundary landed the owner on an empty outline with no
        // word about it.
        setBoundary.mutate({ recordId: id, ring: plot.ring.flat() }, {
          onSuccess: (r) => {
            if (savedBoundary(r)) { setOrphan(null); nav(`/app/records/${id}/map`); return; }
            setOrphan(id);
            setErr(`${plot.lp} was filed as a property, but its boundary was refused. `
                 + 'Try the boundary again, or open the record and draw the shape.');
          },
          onError: (e) => {
            setOrphan(id);
            setErr(`${plot.lp} was filed as a property, but its boundary could not be saved`
                 + `${e instanceof Error ? ` — ${e.message}` : ''}. `
                 + 'Try the boundary again, or open the record and draw the shape.');
          },
        });
      },
      onError: (e) => setErr(e instanceof Error ? e.message : 'That property could not be created.'),
    });
  };

  /** The retry for a record that was filed without its shape. The boundary
   *  alone: the record exists, and filing it a second time would leave the
   *  account holding two copies of one plot. */
  const retryBoundary = () => {
    if (!orphan || !plot) return;
    const id = orphan;
    setErr('');
    setBoundary.mutate({ recordId: id, ring: plot.ring.flat() }, {
      onSuccess: (r) => {
        if (!savedBoundary(r)) {
          setErr('That boundary was refused again — the shape may have fewer than '
               + 'three usable corners.');
          return;
        }
        setOrphan(null);
        nav(`/app/records/${id}/map`);
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
        if (savedBoundary(r)) { nav(`/app/records/${recordId}/map`); return; }
        setErr('That boundary was refused — the shape may have fewer than three '
             + 'usable corners, or that record is no longer yours.');
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
    const key = villageKey(village);
    const wanted = Number(plot?.lp ?? '');
    const distance = (r: RecordCard) => {
      const number = surveyNumber(r.title);
      const n = number ? Number(number) : NaN;
      if (!Number.isFinite(n) || !Number.isFinite(wanted)) return Number.POSITIVE_INFINITY;
      return Math.abs(n - wanted);
    };
    return rows
      // 'open_plot' is a classification, not a kind — see `mine` above.
      .filter((r) => (r.kind === 'parcel' || r.classification === 'open_plot')
                  && villageKey(r.village) === key
                  && r.ring.length === 0)
      .sort((a, b) => distance(a) - distance(b) || naturalCompare(a.title, b.title));
  }, [records.data, village, plot]);

  if (index === null) return <main><Loading h="70vh" /></main>;

  /** What the stage is actually drawing, which is not the same question as
   *  which village is chosen. Fit and Print act on the canvas, and there is no
   *  canvas while a shape file is being read or after one failed — "Fit
   *  village" over the mandal overview was aiming at a map that is not the
   *  village named beside it. */
  const stage: 'village' | 'mandal' | null =
    facts ? 'village' : (!villageErr && mandal.length > 0 ? 'mandal' : null);

  /** The same control in both places it is needed: the empty state, where it
   *  is the only thing to do, and beside the village list, where it is how the
   *  next one arrives. */
  const uploader = (
    <>
      <p className="note">
        A village&rsquo;s KMZ or KML, as the survey department issues it — a few
        hundred kilobytes covering thousands of plots. If yours came as two
        files, the shapes in one and the plot numbers in the other, choose both
        together: neither half is a map on its own.
      </p>
      <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
        <button type="button" className="btn primary sm" disabled={uploading}
                onClick={() => fileBox.current?.click()}>
          <UploadFileOutlined sx={{ fontSize: 16 }} />
          {uploading ? 'Reading…' : 'Choose KMZ or KML'}
        </button>
        <input
          ref={fileBox} type="file" multiple accept=".kml,.kmz"
          aria-label="Village map file" style={{ display: 'none' }}
          onChange={(e) => void send(e.target.files)}
        />
      </div>
      {upErr && (
        <p className="note" style={{ color: 'var(--w-danger)', marginTop: 'var(--space-sm)' }}>
          {upErr}
        </p>
      )}
      {landed.map((v) => (
        <div key={v.key} className="note" style={{ marginTop: 'var(--space-sm)' }}>
          <strong>{v.village}</strong> — {num(v.plots)} plots
          {v.replaced ? ', replacing the one on file' : ''}, from {v.from}.
          {(v.within + v.near) > 0 && (
            <> {num(v.within + v.near)} plot numbers were read off a separate label sheet.</>
          )}
          {v.dropped > 0 && (
            <> {num(v.dropped)} shape{v.dropped === 1 ? '' : 's'} had no number
              and {v.dropped === 1 ? 'was' : 'were'} left out.</>
          )}
          {v.clashes > 0 && (
            <> {num(v.clashes)} plot number{v.clashes === 1 ? ' is' : 's are'} claimed
              by more than one shape — worth checking against the sheet.</>
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

  const tileNotice = tilesFailed && (
    <div className="vc-legend vc-tile-error" role="status">
      <span className="note">{mode === 'street' ? 'Street map' : 'Imagery'} could not fully load. Survey plots remain visible.</span>
      <button type="button" className="btn sm" onClick={() => canvas.current?.retryTiles()}>Retry map</button>
    </div>
  );

  return (
    <main className="vm">
      {/* Three levels, and the head says which one you are on: the mandal, a
          village in it, or one parcel of that village with a tool open on it.
          Each says what is above it, and the button beside goes there. */}
      <p className="eyebrow">
        Village maps
        {village && ` · ${village}`}
      </p>
      <header className="pagehead">
        <div className="grow">
          <h1>{fencing && toFence ? toFence.title : village ?? 'Maps'}</h1>
          <p className="lede" style={{ marginTop: '0.375rem' }}>
            {fencing && toFence
              ? toFence.subtitle
              : facts
                ? `${num(facts.plots.length)} plots · ${num(facts.acres, 1)} ac`
                // The head still names the village that failed, because the
                // list beside it still shows that village chosen. What must not
                // stand under that name is the MANDAL's totals, which is what
                // this line silently fell back to.
                : villageErr
                  ? 'Its shape file could not be read, so there are no plots to show.'
                  : mandal.length
                    ? `${plural(mandal.length, 'village')} on record · `
                      + `${num(mandal.reduce((t, v) => t + (v.plots ?? 0), 0))} plots`
                    : 'The survey department’s own shape file for a village — every plot in it. '
                      + 'Find your land here and the boundary comes with it.'}
          </p>
        </div>
        {/* The fence calculator is open on ONE parcel, so the only way out of it
            is up: back to the village the parcel is in. The map's own buttons
            are not attached to anything on screen while it has the stage, and
            the studio carries its own Print. */}
        {fencing && toFence && (
          <div className="actions">
            <button type="button" className="btn" onClick={() => {
              setFencing(false);
              requestAnimationFrame(() => fenceTrigger.current?.focus());
            }}>
              <ArrowBackOutlined sx={{ fontSize: 16 }} />
              {village ? ` Back to ${village}` : ' Back to the village'}
            </button>
          </div>
        )}
        {!fencing && (
          <div className="actions">
            <Link className="btn" to="/app/properties?view=map">Your land on map</Link>
            {/* The way out stays on a village whose map failed — it is the
                only one from there. */}
            {village && (
              <button type="button" className="btn"
                      onClick={() => {
                        resetTape();
                        setFencing(false);
                        setVillage(null);
                        setSelected(null);
                        setOpenVillages(true);
                      }}>
                <ArrowBackOutlined sx={{ fontSize: 16 }} /> All villages
              </button>
            )}
            {stage && (
              <>
                <button type="button" className="btn" onClick={() => canvas.current?.fit()}>
                  <FitScreenOutlined sx={{ fontSize: 16 }} />
                  {stage === 'village' ? ' Fit village' : ' Fit mandal'}
                </button>
                <button type="button" className="btn" onClick={() => window.print()}>
                  <PrintOutlined sx={{ fontSize: 16 }} /> Print
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {index.length === 0 ? (
        // "None on file" and "could not ask" are different sentences, and only
        // one of them is answered by uploading a KMZ. Telling an owner who has
        // eight villages on file to upload them again, because the gateway is
        // down, is asking for the work to be done twice against a server that
        // is not listening.
        <Card title={uploadsGone ? 'Village maps could not be loaded' : 'No village maps yet'}>
          {uploadsGone && (
            <>
              <p className="note" style={{ color: 'var(--w-danger)' }}>
                Your uploaded village maps could not be read, so any village you have
                sent up is missing from this screen. Nothing has been lost.
              </p>
              <div className="row tight" style={{ margin: 'var(--space-sm) 0 var(--space-md)' }}>
                <button type="button" className="btn sm" onClick={() => void refresh()}>
                  Try again
                </button>
              </div>
            </>
          )}
          {uploader}
          <p className="note" style={{ marginTop: 'var(--space-md)' }}>
            For a whole folder at once there is still the desk route: put the
            files in <code>data/vm/</code> and run{' '}
            <code>python3 scripts/village-map-import.py data/vm</code>, which
            ships them with the app instead of storing them.
          </p>
        </Card>
      ) : (
        // `solo` — the inspector says which plot is selected and how big it is,
        // and the fence calculator's own bar says the same in the same words.
        // While the calculator has the stage that column stands down and gives
        // it the width: two panels answering one question is one too many.
        <div className={`vm-body${fencing && toFence ? ' solo' : ''}`}>
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
                  onSelect={(lp) => { setSelected(lp); if (lp) setOpenPlot(true); }}
                  onHover={setHovered}
                  onZoom={setZoom}
                  onMeasure={setTape}
                  onTilesFailed={setTilesFailed}
                />

                <div className="vc-tl">
                  <span className="row tight">
                    {MODES.map((m) => (
                      <button key={m.key} type="button"
                              className="chip"
                              aria-pressed={mode === m.key}
                              title={mode === m.key ? `Turn ${m.label.toLowerCase()} off` : ''}
                              onClick={() => pickMode(m.key)}>
                        {m.label}
                      </button>
                    ))}
                  </span>
                  <span className="row tight">
                    <button type="button" className={`btn sm${numbers ? ' primary' : ''}`}
                            aria-pressed={numbers}
                            onClick={() => setNumbers((on) => !on)}>
                      Numbers
                    </button>
                    <button type="button" className={`btn sm${measuring ? ' primary' : ''}`}
                            aria-pressed={measuring}
                            title={measuring ? 'Put the tape away' : 'Measure on the ground'}
                            onClick={toggleTape}>
                      <StraightenOutlined sx={{ fontSize: 15 }} /> Measure
                    </button>
                  </span>
                  {tileNotice}
                  {mode === 'extent' && (
                    <div className="vc-legend">
                      <span className="eyebrow">Plot size</span>
                      {BANDS.map((b) => (
                        <span key={b.key} className="row tight">
                          <i style={{ background: b.hex }} aria-hidden />
                          <span className="grow">{b.label}</span>
                          <span className="num">{num(bandCounts.get(b.key) ?? 0)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {measuring && (
                    <div className="vc-legend vc-measure">
                      <span className="eyebrow">Measure</span>
                      <span className="note">
                        {tape && tape.points > 1
                          ? `${tape.points >= 3 ? 'Perimeter' : 'Distance'} ${num(tape.metres, 1)} m · ${tape.points} points`
                          : 'Tap each corner. Three points enclose an area.'}
                      </span>
                      {tape?.acres != null && (
                        <span className="note">Encloses {tape.acres.toFixed(3)} ac</span>
                      )}
                      {tape?.error && <span className="note" role="status">{tape.error}</span>}
                      <span className="row tight">
                        <button type="button" className="btn sm" disabled={!tape?.points}
                                onClick={() => canvas.current?.undoMeasure()}>Undo point</button>
                        <button type="button" className="btn sm" disabled={!tape?.points}
                                onClick={() => canvas.current?.clearMeasure()}>Clear measure</button>
                      </span>
                    </div>
                  )}
                </div>

                <span className="vc-badge">
                  {facts.village} · zoom {zoom || '—'} · numbers {numbers ? 'on' : 'off'}
                </span>

                <div className="vc-tr">
                  <label className="eyebrow" htmlFor="vm-goto">Go to plot no.</label>
                  <span className="row tight">
                    <input id="vm-goto" value={goto}
                           placeholder="Enter plot no. to fly there"
                           onChange={(e) => { setGoto(e.target.value); setGotoNote(''); }}
                           onKeyDown={(e) => { if (e.key === 'Enter') goToPlot(); }} />
                    <button type="button" className="btn sm primary" aria-label="Go to plot"
                            onClick={goToPlot}>
                      <ArrowForwardOutlined sx={{ fontSize: 15 }} />
                    </button>
                  </span>
                  {/* The placeholder now says what the box is for, so this
                      line is only ever the answer: the plot found, or that the
                      village has no such number. */}
                  {gotoNote && <span className="note">{gotoNote}</span>}
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
                  measuring={false}
                  onSelect={() => undefined}
                  onHover={() => undefined}
                  onZoom={setZoom}
                  onTilesFailed={setTilesFailed}
                />
                <div className="vc-tl">
                  <span className="row tight">
                    {MODES.filter((m) => m.key !== 'extent').map((m) => (
                      <button key={m.key} type="button"
                              className="chip"
                              aria-pressed={mode === m.key}
                              onClick={() => pickMode(m.key)}>
                        {m.label}
                      </button>
                    ))}
                  </span>
                  {tileNotice}
                </div>
                {/* The mandal stays up while a village is read. Tearing the
                    map down for a corner note meant the screen went blank for
                    the second or two a shape file takes, which reads as a
                    panel that failed rather than as work in progress. */}
                <span className="vc-badge">
                  {loading && village
                    ? `Reading ${village}’s shape file…`
                    : `${plural(mandal.length, 'village')} · click one to open it`}
                </span>
              </>
            ) : loading ? (
              // No outlines to hold the stage, so it holds its shape instead.
              <div style={{ position: 'absolute', inset: 'var(--space-md)' }}>
                <Loading h="100%" />
              </div>
            ) : (
              <div style={STAGE_FILL}>
                <Empty icon="map" title={`${plural(index.length, 'village map')} on file`}>
                  Pick one from the list beside this panel to see its plots. None of
                  them carries a village outline, so there is no mandal map to draw
                  until one is open.
                </Empty>
              </div>
            )}
          </div>

          {!(fencing && toFence) && (
          <aside className="vm-side">
            <Card title={village ? 'Village' : 'Villages on record'}>
              {/* Said whether or not the list ends up empty: with shipped maps
                  on the bundle the list is never empty, and the uploaded
                  villages would simply be gone from it without a word. */}
              {uploadsGone && (
                <p className="note" style={{ color: 'var(--w-danger)', marginBottom: 'var(--space-sm)' }}>
                  Your uploaded village maps could not be loaded, so any village you
                  sent up is missing from this list.{' '}
                  <button type="button" className="btn sm" onClick={() => void refresh()}>
                    Try again
                  </button>
                </p>
              )}
              <button type="button" className="vm-switch" aria-expanded={openVillages}
                      onClick={() => setOpenVillages((v) => !v)}>
                <span className="grow">{village ?? 'Choose a village'}</span>
                {facts && (
                  <span className="note">
                    {num(facts.plots.length)} plots · {num(facts.acres, 0)} ac
                  </span>
                )}
                <ExpandMoreOutlined sx={{ fontSize: 18 }} />
              </button>
              {openVillages && (
                <>
                  <span className="search" style={{ width: '100%', marginTop: 'var(--space-sm)' }}>
                    <SearchOutlined sx={{ fontSize: 17 }} aria-hidden />
                    <input value={q} onChange={(e) => setQ(e.target.value)}
                           placeholder="Search a village" aria-label="Search a village" />
                  </span>
                  {/* Its own class: village rows and plot rows share a look
                      but are not the same list, and one selector that matched
                      both counted 140 plots as 140 villages. */}
                  <div className="rows vm-villages" style={{ marginTop: 'var(--space-sm)' }}>
                    {shown.map((v) => (
                      <span key={v.file} className="row tight" style={{ flexWrap: 'nowrap' }}>
                        <button type="button" className="villagerow grow"
                                aria-pressed={village === v.village}
                                // Folded away once a village is chosen. The
                                // list is how you get here; the plot is what
                                // you came for, and it should not be below
                                // eight other villages.
                                onClick={() => openVillage(v.village)}>
                          <span className="grow">{v.village}</span>
                          {v.plots ? <span className="note">{num(v.plots)}</span> : null}
                        </button>
                        {/* Only what was uploaded can be taken back off. The
                            shipped maps are in the bundle and are not this
                            screen's to delete. */}
                        {v.uploaded && (
                          <button type="button" className="iconbtn"
                                  aria-label={`Remove ${v.village}`}
                                  style={{ border: 0, background: 'none' }}
                                  onClick={() => void remove(v)}>
                            <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
                          </button>
                        )}
                      </span>
                    ))}
                    {shown.length === 0 && (
                      <p className="note">No village map on file matching that.</p>
                    )}
                  </div>
                  {/* Beside the bin that was pressed. The uploader's own error
                      line is two cards down the column, which is not where
                      anybody looks after clicking a row up here. */}
                  {rmErr && <p className="note" style={{ color: 'var(--w-danger)' }}>{rmErr}</p>}
                </>
              )}
            </Card>

            {plot && (
              <Card title="Selected plot">
                <div className="vm-plot">
                  <span className="vm-plotno">
                    <small>Plot</small>
                    {plot.lp}
                  </span>
                  <span>
                    <span className="vm-acres">{plot.acres.toFixed(3)}</span> acres
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
                    ? 'Measured from the shape — this export states no extent.'
                    : 'As stated on the shape file.'}
                  {plot.chaltha ? ` · Chaltha ${plot.chaltha}` : ''}
                </p>

                <dl className="vm-facts">
                  {/* "Not one of your records" is a claim about the account,
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
                            ? 'Your records could not be loaded'
                            : 'Checking your records…'}
                        </span>
                      )
                      : record
                        ? record.ownerName || record.title
                        : <span className="note">Not one of your records</span>}
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
                  <dt>Village</dt>
                  <dd>{village}</dd>
                </dl>

                {openPlot && (
                  <>
                    {neighbours.length > 0 && (
                      <>
                        <span className="eyebrow">Adjoining plots</span>
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
                        <span className="eyebrow">Papers on file</span>
                        {/* Three states, three sentences. A two-way branch on
                            `data?.length` said "nothing filed" for a parcel
                            with six documents on it — before the query came
                            back, and for good if it failed. The error branch
                            keeps rows that are already on screen: a failed
                            background refetch must not downgrade a list the
                            owner can see into a denial that it exists. */}
                        {papers.isPending && !papers.data
                          ? <p className="note" aria-busy="true">Looking for papers…</p>
                          : papers.isError && !papers.data
                            ? (
                              <p className="note" style={{ color: 'var(--w-danger)' }}>
                                The papers filed against {record.title} could not be loaded.{' '}
                                <button type="button" className="btn sm"
                                        onClick={() => void papers.refetch()}>
                                  Try again
                                </button>
                              </p>
                            )
                            : papers.data?.length
                              ? (
                                <div className="rows">
                                  {papers.data.slice(0, 6).map((p) => (
                                    <span key={p.id} className="row between">
                                      <span className="grow">{p.title}</span>
                                      <span className="note">{p.pageCount || 0} pp</span>
                                    </span>
                                  ))}
                                </div>
                              )
                              : <p className="note">Nothing filed against {record.title} yet.</p>}
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
                  {/* Fencing is a job you do to a shape, so it opens over the
                      map rather than into this column — see FenceStudio. */}
                  <button ref={fenceTrigger} type="button" className="btn sm"
                          disabled={!toFence}
                          onClick={() => setFencing(true)}>
                    <StraightenOutlined sx={{ fontSize: 15 }} /> Fence calculator
                  </button>
                  {record ? (
                    <button type="button" className="btn sm primary"
                            onClick={() => nav(`/app/records/${record.id}/map`)}>
                      Open {record.title}
                    </button>
                  ) : (
                    // Filing waits for the records to answer. On unknown data
                    // this button cannot tell a new plot from one the account
                    // already holds, and the wrong guess is a duplicate record.
                    <button type="button" className="btn sm primary"
                            disabled={!answered || saveRecord.isPending || setBoundary.isPending}
                            onClick={fileNew}>
                      {saveRecord.isPending ? 'Filing…' : 'File this as a new property'}
                    </button>
                  )}
                </div>

                {/* Why filing is off, and why nothing is offered below it: the
                    adopt list is built from the same records, so while they are
                    unknown it is empty, and an empty list here reads as "you
                    have nothing in this village". */}
                {!record && !answered && (
                  <p className="note" style={{
                    marginTop: 'var(--space-xs)',
                    ...(recordsFailed ? { color: 'var(--w-danger)' } : {}),
                  }}>
                    {recordsFailed
                      ? 'Your records could not be loaded, so filing is off and no record '
                        + 'can be offered this plot — either would risk a second copy of '
                        + 'land you already hold.'
                      : 'Your records have not answered yet. Filing waits for them, so this '
                        + 'plot cannot be filed twice.'}
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
                    <span className="eyebrow">Or give it to a record in this village</span>
                    {/* Counted the way the All plots card counts, because a
                        list that stops at eight with no total simply put the
                        other seven out of reach. */}
                    <p className="note" style={{ margin: 'var(--space-2xs) 0 var(--space-xs)' }}>
                      {adoptable.length > ADOPT_MAX
                        ? `first ${ADOPT_MAX} of ${num(adoptable.length)}`
                        : plural(adoptable.length, 'record')}
                      {' · nearest number first'}
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
                    {adoptable.length > ADOPT_MAX && (
                      <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
                        A record that is not listed here can still take this plot from
                        its own Boundary tab.
                      </p>
                    )}
                  </>
                )}
              </Card>
            )}

            {facts && (
              <Card title="All plots">
                <span className="search" style={{ width: '100%' }}>
                  <SearchOutlined sx={{ fontSize: 17 }} aria-hidden />
                  <input value={find} onChange={(e) => setFind(e.target.value)}
                         placeholder="Plot no., owner or passbook…"
                         aria-label="Find a plot" />
                </span>
                <p className="note" style={{ marginTop: 'var(--space-xs)' }}>
                  {listed.length > 140
                    ? `first 140 of ${num(listed.length)}`
                    : `${num(listed.length)} plots`}
                </p>
                {/* The owner column and the owner half of this search both come
                    from the account's records. Until those answer, an empty
                    column reads as "none of these are yours" and a search for
                    an owner's name answers "No plot matches that" — both of
                    which are statements this screen cannot yet make. */}
                {!answered && (
                  <p className="note"
                     style={recordsFailed ? { color: 'var(--w-danger)' } : undefined}>
                    {recordsFailed
                      ? 'Owner and passbook could not be read from your records, so this '
                        + 'list is plot numbers only.'
                      : 'Owner and passbook are still coming from your records, so this '
                        + 'list searches plot numbers until they do.'}
                  </p>
                )}
                <div className="rows vm-list">
                  {listed.slice(0, 140).map((p) => {
                    const r = mine.get(p.lp);
                    return (
                      <button key={p.lp} type="button" className="villagerow"
                              aria-pressed={selected === p.lp}
                              onMouseEnter={() => setHovered(p.lp)}
                              onMouseLeave={() => setHovered(null)}
                              onClick={() => flyTo(p.lp)}>
                        <span className="num" style={{ minWidth: '3.25rem' }}>{p.lp}</span>
                        <span className="grow note">
                          {answered
                            ? (r ? r.ownerName || r.title : '')
                            : (recordsFailed ? '' : '…')}
                        </span>
                        <span className="note num">{p.acres.toFixed(2)} ac</span>
                      </button>
                    );
                  })}
                  {listed.length === 0 && <p className="note">No plot matches that.</p>}
                </div>
              </Card>
            )}

            <Card title="Add a village map">
              {uploader}
            </Card>
          </aside>
          )}
        </div>
      )}
    </main>
  );
}
