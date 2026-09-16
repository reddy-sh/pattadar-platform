/** W04 — the sketch over the ground, and what to do when a stone has moved.
 *
 *  The FMB sheet is a government document and is never edited. What the owner
 *  edits is a MARK: a numbered point with its own history. Accepting a new
 *  position keeps the old one, and deleting a mark keeps it in History — which
 *  is why the destructive action can sit on the page at all.
 *
 *  The map supports either streets or satellite imagery, with measurements
 *  independent of the chosen basemap. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import GpsFixedOutlined from '@mui/icons-material/GpsFixedOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import TimelineOutlined from '@mui/icons-material/TimelineOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import StraightenOutlined from '@mui/icons-material/StraightenOutlined';
import MyLocationOutlined from '@mui/icons-material/MyLocationOutlined';
import FullscreenOutlined from '@mui/icons-material/FullscreenOutlined';
import {
  checkLocation, compassPoint, formatDistance, formatExtent, haversineKm, mapsAppFor,
  mapsAppName, mapsLink, parseBoundaryFile, placeCandidates, ringAreaSqM, ringCentroid,
  ringPerimM, ringSides, cornerLabel, LENGTH_FT, SQ_M_PER_ACRE, toBoundaryGeoJson,
  boundaryFileName,
} from '@pattadar/core';

import {
  useBoundary, useAcceptMark, useAddMark, useDeleteMark, useSetPin, useSetBoundary,
  useUpdateMark, useMarksFromBoundary, useMoveMark,
} from '../api';
import { Card, Failed, KV, Loading, Menu, coords, num, pairs } from '../ui';
import { MapCanvas } from '../MapCanvasLazy';
import type { Basemap, MapHandle } from '../MapCanvasLazy';
import { useRecordCtx } from './Record';
import { SectionHead } from './RecordHead';
import { checkBoundaryDraft } from './boundaryDraft';

/** Shown once and then forgotten, as asked. Not per record: the reveal
 *  explains how the screen reads, and that only needs saying the first time. */
const INTRO_KEY = 'w360-boundary-intro';

/** What to call this record in a sentence. A flat is not a parcel, and the
 *  place note under the map called every record one. These three lines are
 *  RecordPapers', kept in step by hand: ui.tsx is where they belong and is not
 *  this change's to edit. */
const nounFor = (kind: string, cls: string) =>
  kind === 'parcel' ? 'parcel'
    : cls === 'flat' ? 'flat'
    : cls === 'shop' ? 'shop'
    : cls === 'open_plot' ? 'plot' : 'property';

export function RecordBoundary() {
  const rec = useRecordCtx();
  const currentRecord = useRef(rec.id);
  currentRecord.current = rec.id;
  const nav = useNavigate();
  /** The order flow's half of the hand-off, in two search params: `draw=1`
   *  arms the boundary tool on arrival, and `back=` is the half-composed order
   *  to return to once a real outline has been saved. Neither is ever written
   *  back, so a reload lands on the same errand rather than on a bare map. */
  const [params] = useSearchParams();
  const { data, isLoading, error } = useBoundary(rec.id);
  const accept = useAcceptMark();
  const remove = useDeleteMark();
  const setPin = useSetPin();
  const addMark = useAddMark();
  const editMark = useUpdateMark();
  const moveMark = useMoveMark();
  const marksFromRing = useMarksFromBoundary();
  /** The mark being named: a new one at a clicked point, or an existing one
   *  being renamed. A stone is identified by what it is called, not by the
   *  number it happens to have, so a mark is never filed without asking. */
  const [naming, setNaming] = useState<
    { at?: [number, number]; id?: string; label: string; detail: string } | null>(null);
  const saveRing = useSetBoundary();
  // One editing mode at a time: arming two ways to interpret a map click is
  // how you end up placing a pin while trying to drop a corner.
  const [mode, setMode] = useState<'idle' | 'pin' | 'draw' | 'mark' | 'move-mark'>('idle');
  const [movingMark, setMovingMark] = useState<{ id: string; label: string } | null>(null);
  const [draft, setDraft] = useState<Array<[number, number]>>([]);
  const [pinErr, setPinErr] = useState('');
  // What the map settled on when the record could not place itself. W03's card
  // has always said this; W04 — the screen that claims to show real ground —
  // was the one screen that would frame a whole district in silence.
  // Both halves of the map's answer are kept. The second argument is its
  // verdict on a pin that disagrees with the place it settled on, and handing
  // the setter in bare threw that away — which is what let the note below
  // assert that nothing on this record says where the land is, directly under
  // the pin the Location card prints a few inches away.
  const [shownPlace, setShownPlace] = useState<{ label: string; suspect: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [draftSource, setDraftSource] = useState('');
  const [importPreview, setImportPreview] = useState(0);
  const pendingRead = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftCheck = useMemo(() => checkBoundaryDraft(draft), [draft]);

  const draftAcres = useMemo(
    () => (draft.length >= 3 ? ringAreaSqM(draft) / SQ_M_PER_ACRE : 0), [draft]);

  const stopEditing = () => {
    pendingRead.current += 1;
    setBusy('');
    setMode('idle');
    setDraft([]);
    setDraftSource('');
    setMovingMark(null);
  };
  useEffect(() => () => { pendingRead.current += 1; }, [rec.id]);

  /** Save whatever the naming form holds — a new mark at a clicked point, or
   *  a rename of one already on the record. */
  const saveNaming = () => {
    if (!naming || addMark.isPending || editMark.isPending) return;
    const label = naming.label.trim();
    if (!label) return;                       // the button is disabled; belt and braces
    setPinErr('');
    const done = {
      onSuccess: (res: unknown) => {
        if (currentRecord.current !== rec.id) return;
        const result = (res as { web?: { addMark?: string; updateMark?: boolean } })?.web;
        if (!(naming.id ? result?.updateMark : result?.addMark)) {
          setPinErr('That mark could not be saved to this record.');
          return;
        }
        setNaming(null);
      },
      onError: (e: unknown) => {
        if (currentRecord.current === rec.id) {
          setPinErr(e instanceof Error ? e.message : 'The mark did not save. Try again.');
        }
      },
    };
    if (naming.id) {
      editMark.mutate({ markId: naming.id, label, detail: naming.detail.trim() }, done);
    } else if (naming.at) {
      addMark.mutate({
        recordId: rec.id, label, detail: naming.detail.trim(),
        lat: naming.at[0], lon: naming.at[1],
      }, done);
    }
  };
  /** Which mark each of these two is working on. The pending label used to be
   *  read off `isPending` alone, inside the loop, so deleting one stone made
   *  every other stone's menu report itself as being deleted. react-query
   *  keeps `variables` after a mutation settles, which is why the isPending
   *  half of the test is load-bearing rather than belt and braces. */
  const accepting = accept.isPending ? accept.variables?.markId : undefined;
  const removing = remove.isPending ? remove.variables?.markId : undefined;

  /** Accepting a new position and deleting a mark were the only two writes on
   *  this screen that said nothing at all when they failed: the menu closed,
   *  the mark stayed exactly as it was, and an owner who believed they had
   *  deleted a stone found it still on the record next time they opened it.
   *  Both resolvers answer true whatever happens — a refusal looks like a
   *  success in the payload — so the error is the only signal there is, and it
   *  goes where every other write on this screen puts one.
   *
   *  Both also refuse a second firing while the first is in flight. A label
   *  reading "Deleting…" stops nobody, and MenuItem has no disabled state to
   *  set, so the handler is the only place the guard can live. */
  const acceptMark = (markId: string) => {
    if (accept.isPending) return;
    setPinErr('');
    accept.mutate({ markId }, {
      onSuccess: (res) => {
        if (!res.web.acceptMark) setPinErr('That mark could not be accepted.');
      },
      onError: (e) => setPinErr(
        e instanceof Error ? e.message : 'That mark could not be accepted.'),
    });
  };
  const deleteMark = (markId: string) => {
    if (remove.isPending) return;
    setPinErr('');
    remove.mutate({ markId }, {
      onSuccess: (res) => {
        if (!res.web.deleteMark) setPinErr('That mark could not be deleted.');
      },
      onError: (e) => setPinErr(
        e instanceof Error ? e.message : 'That mark could not be deleted.'),
    });
  };

  const [copied, setCopied] = useState(false);

  /** The tip's Copy button lives in a popup Leaflet creates and destroys, so
   *  it is caught by delegation rather than bound to an element that may not
   *  exist yet. */
  const onPlotClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (el.closest?.('[data-close]')) { setPinnedSide(null); setPinnedCorner(null); return; }
    const btn = el.closest?.('[data-copy]') as HTMLElement | null;
    if (!btn) return;
    if (!navigator.clipboard) {
      setPinErr('The clipboard is not available in this browser.');
      return;
    }
    void navigator.clipboard.writeText(btn.getAttribute('data-copy') ?? '').then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); },
      () => setPinErr('The clipboard is not available in this browser.'),
    );
  };

  const saveDraft = (pts: Array<[number, number]>, note: string) => {
    if (saveRing.isPending) return;
    const checked = pts.length ? checkBoundaryDraft(pts) : { ring: [], error: '' };
    if (checked.error) { setPinErr(checked.error); return; }
    setPinErr('');
    setBusy(note);
    saveRing.mutate(
      { recordId: rec.id, ring: checked.ring.flat() },
      {
        onSuccess: (res) => {
          if (currentRecord.current !== rec.id) return;
          setBusy('');
          // The mutation answers false when the record is not the caller's or
          // the ring is not land; a silent no-op would look like a save.
          const ok = (res as { web?: { setBoundary?: boolean } })?.web?.setBoundary;
          if (ok !== true) { setPinErr('That boundary could not be saved to this record.'); return; }
          setPlot(null);
          setPinnedSide(null);
          setPinnedCorner(null);
          stopEditing();
          /** Back to the order that sent them here — but only for a boundary
           *  that now exists.
           *
           *  The corner count is load-bearing, not defensive: THIS function is
           *  also what "Remove saved boundary" calls, with an empty ring. With
           *  no test, withdrawing an outline would hand the owner straight back
           *  to their half-composed order exactly as though they had just drawn
           *  one — and that order would then be finished against a record with
           *  no boundary left to send. Three corners is the fewest that
           *  encloses anything, which is the same bar `surveyed` uses.
           *
           *  The prefix is the other half. `back` is whatever the URL says, so
           *  it can spell "https://…" or "//…", and nav() would walk the owner
           *  off this app mid-order. It is tested exactly as URLSearchParams
           *  hands it over: that is already percent-decoded, and decoding a
           *  second time is how a %252f payload gets under a prefix test. */
          const back = params.get('back') ?? '';
          if (checked.ring.length >= 3 && back.startsWith('/app/')) nav(back);
        },
        onError: (e) => {
          if (currentRecord.current !== rec.id) return;
          setBusy('');
          setPinErr(e instanceof Error ? e.message : 'The boundary did not save. Try again.');
        },
      },
    );
  };

  /** A KML or GeoJSON the owner already has — from a surveyor's GPS, from
   *  Google Earth — preview its corners before the owner saves the boundary. */
  const readFile = async (file: File | undefined) => {
    if (!file || saveRing.isPending) return;
    const request = ++pendingRead.current;
    setPinErr('');
    setBusy(`Reading ${file.name}…`);
    try {
      const parsed = parseBoundaryFile(await file.text(), file.name);
      if (request !== pendingRead.current) return;
      const checked = checkBoundaryDraft(parsed.ring);
      if (checked.error) throw new Error(checked.error);
      setDraft(checked.ring);
      setDraftSource(file.name);
      setImportPreview((version) => version + 1);
      setMode('draw');
      setPlot(null);
      setVillageOn(false);
      setPinnedSide(null);
      setPinnedCorner(null);
    } catch (e) {
      if (request === pendingRead.current) {
        setPinErr(e instanceof Error ? e.message : 'That file could not be read.');
      }
    } finally {
      if (request === pendingRead.current) setBusy('');
    }
  };
  const [satellite, setSatellite] = useState(true);
  // On by default. The lengths and the corner letters ARE the useful view of
  // a boundary — a bare outline on imagery tells you where the land is but
  // nothing about it — so the screen opens showing them rather than making
  // that a thing you have to know to ask for.
  const [measuring, setMeasuring] = useState(true);
  const [villageOn, setVillageOn] = useState(false);
  /** A plot picked out of the village map, held until it is adopted or
   *  dismissed. Nothing is written to the record by clicking. */
  const [plot, setPlot] = useState<
    { lp: string; ac?: string; ring: Array<[number, number]> } | null>(null);
  const [plotQuery, setPlotQuery] = useState('');
  const [vmState, setVmState] = useState<{ count: number; found: boolean } | null>(null);
  // Lengths convert; areas do not. The switch governs every length on the
  // screen at once and never touches the acreage — that rule is written into
  // the FMB viewer and the Swift twin, and this is the third place to honour it.
  const [lengthUnit, setLengthUnit] = useState<'m' | 'ft'>('m');
  // Hover previews a side; a click pins it, because reading the tip means
  // moving the pointer off the row it came from.
  const [hoverSide, setHoverSide] = useState<number | null>(null);
  const [pinnedSide, setPinnedSide] = useState<number | null>(null);
  /** A corner picked on its own account. Mutually exclusive with a side: they
   *  answer different questions and the tip can only hold one answer. */
  const [pinnedCorner, setPinnedCorner] = useState<number | null>(null);
  const pickSide = (i: number | null) => { setPinnedCorner(null); setPinnedSide(i); };
  const pickCorner = (i: number | null) => { setPinnedSide(null); setPinnedCorner(i); };
  /** The side table's row buttons, so a dismissal can put focus back on the
   *  row the tip was opened from. */
  const sideBtns = useRef<Array<HTMLButtonElement | null>>([]);
  /** True between a mouse press on a row and the click it produces. The ring
   *  below is drawn by hand because w360.css owns the module's :focus-visible
   *  rules and this screen cannot add one for a control that exists only here;
   *  this flag keeps the ring off a mouse press, which is the whole of what
   *  the pseudo-class would have done. */
  const pointer = useRef(false);
  const [keyFocus, setKeyFocus] = useState<number | null>(null);
  const plotEl = useRef<HTMLDivElement>(null);
  /** Set when a side is pinned from the keyboard. The tip is drawn over the
   *  map, and the map comes before this table in the DOM — so Tab out of a row
   *  moves AWAY from the Copy button the pin was for, and only Shift+Tab back
   *  through the zoom cluster and the whole map reaches it. A keyboard pin
   *  therefore hands focus to the tip; a mouse pin leaves the pointer alone. */
  const toTip = useRef(false);
  useEffect(() => {
    if (!toTip.current) return;
    toTip.current = false;
    if (pinnedSide == null) return;
    // Copy, not the close ×: reading both corners down a phone to a surveyor
    // is the reason the side was pinned.
    plotEl.current?.querySelector<HTMLButtonElement>('.w-tip [data-copy]')?.focus();
  }, [pinnedSide]);
  /** Escape gets out of a pinned side or corner. Clicking the row again and
   *  the tip's × were the only two dismissals, both of them mouse work, and
   *  the keyboard had just been handed focus inside the tip with no way home. */
  const dropPin = () => {
    const back = pinnedSide;
    setPinnedSide(null);
    setPinnedCorner(null);
    if (back != null) sideBtns.current[back]?.focus();
  };
  /** The reveal plays once, ever. Read AND written at mount, so a re-render
   *  cannot replay it while the first one is still running. */
  const [introduce] = useState(() => {
    try {
      if (localStorage.getItem(INTRO_KEY)) return false;
      localStorage.setItem(INTRO_KEY, '1');
      return true;
    } catch {
      return false;              // private mode: skip the flourish, lose nothing
    }
  });
  const activeSide = pinnedSide ?? hoverSide;
  const [activeMark, setActiveMark] = useState<string | null>(null);
  const mapRef = useRef<MapHandle>(null);
  useEffect(() => {
    if (importPreview > 0) mapRef.current?.fit();
  }, [importPreview]);
  useEffect(() => {
    stopEditing();
    setNaming(null);
    setPinErr('');
    setShownPlace(null);
    setPlot(null);
    setVillageOn(false);
    setPlotQuery('');
    setVmState(null);
    setPinnedSide(null);
    setPinnedCorner(null);
    setHoverSide(null);
    setActiveMark(null);
  }, [rec.id]);

  // Surveyed corners, in the order the sheet walks them. Three is the fewest
  // that encloses anything; below that the record has a pin and no shape.
  const ring = useMemo(() => pairs(data?.ring ?? []), [data?.ring]);
  const surveyed = ring.length >= 3;

  // Both of these are handed to the map, whose redraw effect keys on identity.
  // Rebuilt inline they would be new objects every render, and the map would
  // clear and redraw its layers continuously — visible as flicker, and as a
  // tooltip that can never stay open long enough to read.
  const marks = useMemo(
    () => (data?.marks ?? []).filter((m) => m.state !== 'deleted'),
    [data?.marks],
  );
  const pin = useMemo(
    () => ({ lat: data?.lat ?? 0, lon: data?.lon ?? 0 }),
    [data?.lat, data?.lon],
  );
  /** A record can hold four different answers to "where is this land": the
   *  surveyed boundary, the pin, the stones, and the village on the paper.
   *  They are written at different times by different people and nothing has
   *  ever made them argue. Once there IS a boundary it is the most exact of
   *  the four, so it is what the others are checked against — and a
   *  disagreement is reported rather than quietly drawn as though it were
   *  agreement. */
  const centre = useMemo(
    () => (surveyed
      ? ringCentroid(ring.map(([latitude, longitude]) => ({ latitude, longitude })))
      : null),
    [surveyed, ring],
  );
  const pinVsRing = useMemo(() => {
    if (!centre || !data) return null;
    if (!data.lat && !data.lon) return null;          // no pin is not a conflict
    const v = checkLocation({ latitude: data.lat, longitude: data.lon }, centre);
    return v.suspect ? v : null;
  }, [centre, data]);

  const strayMarks = useMemo(() => {
    if (!centre) return [];
    return marks.filter((m) => (m.lat || m.lon)
      && haversineKm({ latitude: m.lat, longitude: m.lon }, centre) > 5);
  }, [centre, marks]);

  /** Every side of the saved boundary, with the whole-parcel figures.
   *
   *  Precision is the decision that matters here. A ring traced over satellite
   *  imagery is good to a few metres, and the stored coordinates are rounded to
   *  six decimals (±0.55 m on their own), so a length is printed in WHOLE
   *  metres or feet. Copying the FMB viewer's two decimals would assert
   *  centimetre knowledge of a line drawn with a mouse. */
  const measure = useMemo(() => {
    if (!surveyed) return null;
    const sides = ringSides(ring);
    const perimM = ringPerimM(ring);
    const acres = ringAreaSqM(ring) / SQ_M_PER_ACRE;
    const len = (m: number) => (lengthUnit === 'm'
      ? `${Math.round(m).toLocaleString('en-IN')} m`
      : `${Math.round(m * LENGTH_FT.m).toLocaleString('en-IN')} ft`);
    return {
      sides, perimM, acres, len,
      labels: sides.map((x) => len(x.metres)),
    };
  }, [surveyed, ring, lengthUnit]);

  /** Traced-against-recorded: the one comparison worth making on this screen.
   *  Deliberately soft — a traced ring differing from the register by a few
   *  percent is normal, not evidence of encroachment, so this reports a
   *  difference and never a verdict. */
  const vsRecorded = useMemo(() => {
    if (!measure || !rec.extent || rec.extentUnit !== 'ac') return null;
    const diff = measure.acres - rec.extent;
    const pct = (diff / rec.extent) * 100;
    const off = Math.abs(pct);
    // Three bands, because one sentence cannot cover 2% and 900%. Drift is
    // normal; a tenfold difference is a mistake, and calling that "worth a
    // look" would be the screen refusing to say what it can plainly see.
    return { diff, pct, band: off <= 5 ? 'close' : off <= 25 ? 'check' : 'wrong' };
  }, [measure, rec.extent, rec.extentUnit]);

  /** The tip that opens on the selected side. Plain HTML rather than React:
   *  Leaflet owns the popup's lifetime, and mounting a React tree into a
   *  layer that Leaflet destroys on its own schedule is how you get a stale
   *  root. The copy button is wired by delegation below. */
  const sideTip = useMemo(() => {
    // PINNED only, never hover. Hovering a row lights its side, which is a
    // cheap preview; a tip is a thing you read, and one that opened and shut
    // as the pointer crossed the table would be unreadable — and clicking to
    // dismiss it could not work while the pointer still counted as a hover.
    if (!measure || pinnedSide == null) return null;
    const side = measure.sides[pinnedSide];
    if (!side) return null;
    const a = ring[pinnedSide];
    const b = ring[(pinnedSide + 1) % ring.length];
    if (!a || !b) return null;
    const fix = (p: [number, number]) => `${p[0].toFixed(6)}, ${p[1].toFixed(6)}`;
    const nameA = cornerLabel(side.from - 1);
    const nameB = cornerLabel(side.to - 1);
    const metres = Math.round(side.metres).toLocaleString('en-IN');
    const feet = Math.round(side.metres * LENGTH_FT.m).toLocaleString('en-IN');
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    // Both units, always, in the tip — this is the thing someone reads aloud
    // over a phone to a surveyor, and a toggle they cannot see is no use there.
    return `
      <button type="button" class="close" data-close aria-label="Close">×</button>
      <dl>
        <dt>Corner ${nameA}</dt><dd>${esc(fix(a))}</dd>
        <dt>Corner ${nameB}</dt><dd>${esc(fix(b))}</dd>
        <dt>Between</dt><dd>${metres} m · ${feet} ft · ${esc(compassPoint(side.bearing))}</dd>
      </dl>
      <div class="row">
        <button type="button" data-copy="${esc(
          `${rec.title} corner ${nameA}: ${fix(a)}\n`
          + `${rec.title} corner ${nameB}: ${fix(b)}\n`
          + `between: ${metres} m (${feet} ft) ${compassPoint(side.bearing)}`)}">Copy both</button>
        <a href="${esc(mapsLink({ latitude: a[0], longitude: a[1] },
          { label: `${rec.title} corner ${nameA}` }))}" target="_blank" rel="noreferrer">Corner ${nameA} ↗</a>
        <a href="${esc(mapsLink({ latitude: b[0], longitude: b[1] },
          { label: `${rec.title} corner ${nameB}` }))}" target="_blank" rel="noreferrer">Corner ${nameB} ↗</a>
      </div>`;
  }, [measure, pinnedSide, ring, rec.title]);

  /** The boundary as a file. Built and downloaded in the browser: it is the
   *  record's own ring, written in the format every surveyor's tool reads,
   *  and nothing about it needs a server. */
  const exportGeoJson = () => {
    setPinErr('');
    const village = (rec.placeLine.split(',')[0] || '').trim();
    try {
      const text = toBoundaryGeoJson(ring, {
        title: rec.title, village, khataNo: rec.khataNo, ownerName: rec.ownerName,
        areaAcres: measure?.acres, perimeterM: measure?.perimM,
      });
      const url = URL.createObjectURL(new Blob([text], { type: 'application/geo+json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = boundaryFileName(rec.title, village);
      a.click();
      // Revoked on a later tick: released immediately and the download never
      // starts; never released and the blob is held for the life of the tab.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setPinErr(err instanceof Error ? err.message : 'The boundary could not be exported.');
    }
  };

  /** One corner, on its own. Clicking a node used to be impossible; clicking
   *  its side answered a different question — two corners and the distance
   *  between them. Asked about corner 3, this says corner 3.
   *
   *  Still mouse-only, and knowingly so: corners have no table to hang a
   *  button off the way sides do, so the only way to pick one is the marker on
   *  the map. The side tip prints both of its endpoint coordinates, which
   *  covers the field use — reading a corner down a phone — for every corner
   *  the ring has. Reaching one on its own needs either arrow keys on the
   *  focused side row stepping through side.from/side.to, or Leaflet's own
   *  keypress event bound alongside click in MapCanvas. */
  const cornerTip = useMemo(() => {
    if (pinnedCorner == null) return null;
    const c = ring[pinnedCorner];
    if (!c) return null;
    const at = `${c[0].toFixed(6)}, ${c[1].toFixed(6)}`;
    const n = cornerLabel(pinnedCorner);
    const esc = (t: string) => t.replace(/[&<>"]/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
    return `
      <button type="button" class="close" data-close aria-label="Close">×</button>
      <dl>
        <dt>Corner ${n}</dt><dd>${esc(at)}</dd>
      </dl>
      <div class="row">
        <button type="button" data-copy="${esc(`${rec.title} corner ${n}: ${at}`)}">Copy</button>
        <a href="${esc(mapsLink({ latitude: c[0], longitude: c[1] },
          { label: `${rec.title} corner ${n}` }))}" target="_blank" rel="noreferrer">Navigate ↗</a>
      </div>`;
  }, [pinnedCorner, ring, rec.title]);

  // Nothing known at all — no ring, no stones, no pin. Fall back to the
  // record's own address rather than opening on an arbitrary point.
  const place = useMemo(() => placeCandidates(rec.placeLine), [rec.placeLine]);
  /** The village the record is filed in — the first part of its place line,
   *  which is how the shape files are named. */
  const village = useMemo(
    () => (rec.placeLine.split(',')[0] || '').trim(), [rec.placeLine]);

  /** The record's survey number as a village map spells it. A record is "Sy
   *  123/1" — survey 123, subdivision 1 — and the shape file numbers the whole
   *  survey, so 123 is what will match. */
  const surveyNo = useMemo(() => {
    const m = rec.title.match(/(\d+)/);
    return m ? m[1] : '';
  }, [rec.title]);

  // Where the hand-off drops its pin: the centre of the land if we know the
  // shape, the filed pin if we only know that. No maps app takes a boundary.
  const away = useMemo(() => {
    const centre = surveyed
      ? ringCentroid(ring.map(([latitude, longitude]) => ({ latitude, longitude })))
      : null;
    const at = centre ?? { latitude: data?.lat ?? 0, longitude: data?.lon ?? 0 };
    if (!at.latitude && !at.longitude) return null;
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    const app = mapsAppFor(ua);
    // Survey number AND village. "Sy 71/2" alone is not an identifier — the
    // same number exists in every village in the district — and a dropped pin
    // captioned only that tells you nothing once you are inside Apple Maps.
    // Kept to two parts on purpose: Apple treats this as a search field and
    // will try to match a longer, more address-like string against a POI.
    const village = (rec.placeLine.split(',')[0] || '').trim();
    const label = [data?.title, village].filter(Boolean).join(', ');
    return { href: mapsLink(at, { label, userAgent: ua }), app };
  }, [surveyed, ring, data?.lat, data?.lon, data?.title, rec.placeLine]);

  /** `saving` and the draw tool both used to live below the early returns,
   *  beside `editing`. The `?draw=1` hand-off has to arm beginDrawing from an
   *  effect, and an effect is a hook — it cannot sit under a `return` — so the
   *  tool, and the flag the tool consults, come up here with it. */
  const saving = saveRing.isPending || setPin.isPending || moveMark.isPending;

  const beginDrawing = () => {
    if (saving || busy) return;
    setPinErr('');
    setDraftSource('');
    setDraft(surveyed ? ring : []);
    setPlot(null);
    setPinnedSide(null);
    setPinnedCorner(null);
    setMode('draw');
  };

  /** "Go and draw it, then come back."
   *
   *  A service that needs corners cannot be sold against a record that has
   *  none, so the order flow hands the owner over here with `draw=1` rather
   *  than refusing. Landing on a read-only map and having to find "Draw
   *  boundary" for themselves would make that hand-off a fetch quest; the tool
   *  is armed on arrival instead, which is the whole of what was promised.
   *
   *  Once, ever, and the ref is the entirety of what makes that true. `draw=1`
   *  stays in the URL for the whole visit, so every re-render — every corner
   *  placed, every keystroke elsewhere on the screen — sees the same param;
   *  and beginDrawing re-seeds the draft with `surveyed ? ring : []`, so a
   *  second firing would silently throw away every corner the owner had placed
   *  since they got here and start them again on the saved outline. One
   *  attempt is the contract: the ref is spent whether or not beginDrawing
   *  takes, so nothing can come back round and re-arm.
   *
   *  It waits for the boundary to land rather than firing on the first render.
   *  While `data` is still undefined there is nothing sensible to draw into —
   *  `ring` is empty then — and a record that already has an outline would be
   *  handed a blank draft to redraw from scratch instead of its own corners.
   *
   *  beginDrawing is deliberately not in the dependency list: it is rebuilt on
   *  every render, so listing it would run this on every render. The ref is
   *  the guard, not the list. */
  const armedDraw = useRef(false);
  useEffect(() => {
    if (armedDraw.current || params.get('draw') !== '1') return;
    if (isLoading || !data) return;
    armedDraw.current = true;
    beginDrawing();
  }, [params, isLoading, data]);

  if (isLoading) return <main><Loading h="70vh" what="this boundary" /></main>;
  if (!data) return <main><Failed what="This boundary" error={error} boxed h="26rem" /></main>;

  // The sketch is drawn in its own 0..1 space; marks sit on its corners in order.

  /** The two things the place note under the map has to know: whether this
   *  record carries a pin at all, and what to call it in a sentence. coords()
   *  is the same guard the Location card uses, so an unset 0,0 — a real point
   *  in the Gulf of Guinea — does not count as one. */
  const pinned = coords(data.lat, data.lon);
  const noun = nounFor(rec.kind, rec.classification);

  const editing = mode !== 'idle';
  const showMeasurements = measuring && surveyed && !editing;
  const basemap: Basemap = satellite ? 'satellite' : 'street';

  const savePinAt = (lat: number, lon: number) => {
    if (setPin.isPending) return;
    pendingRead.current += 1;
    setBusy('');
    setPinErr('');
    setPin.mutate({ recordId: rec.id, lat, lon }, {
      onSuccess: (res) => {
        if (currentRecord.current !== rec.id) return;
        if ((res as { web?: { setPin?: boolean } })?.web?.setPin !== true) {
          setPinErr('That pin could not be saved to this record.');
          return;
        }
        stopEditing();
      },
      onError: (e) => {
        if (currentRecord.current === rec.id) {
          setPinErr(e instanceof Error ? e.message : 'The pin did not save. Try again.');
        }
      },
    });
  };

  return (
    <>
      <SectionHead
        title="Where this land is"
        /* What the record knows about its own location, in the order it gets
           known: a pin someone stood on, the corners around it, and the
           village that is true even when neither of those exists. The place
           line and the status pill moved up to the record header, which is
           chrome on every hanger now — this screen used to restate both
           because it was the only one that had them. */
        sub={(
          <>
            {[
              pinned ? 'pin placed' : 'no pin',
              surveyed ? 'boundary drawn' : 'no boundary',
              rec.village ? 'village known' : 'village not recorded',
            ].join(' · ')}
            {/* How a parcel is named out loud, for whoever opens a shared /map
                link or is standing in a field deciding whether this is the
                right one. */}
            {[
              rec.khataNo && `Khata ${rec.khataNo}`,
              rec.extentDetail || `${num(rec.extent, 2)} ${rec.extentUnit}`,
              rec.ownerName,
            ].filter(Boolean).length > 0 && (
              <>
                <br />
                {[
                  rec.khataNo && `Khata ${rec.khataNo}`,
                  rec.extentDetail || `${num(rec.extent, 2)} ${rec.extentUnit}`,
                  rec.ownerName,
                ].filter(Boolean).join(' · ')}
              </>
            )}
          </>
        )}
        actions={(
          <>
          {/* The picker the primary opens. Hidden, and deliberately next to the
              button that opens it rather than beside the tools that moved to
              the map — filing the sheet is a record action, not a map one. */}
          <input
            ref={fileRef}
            type="file"
            accept=".kml,.json,.geojson,application/vnd.google-earth.kml+xml,application/geo+json,application/json"
            hidden
            onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }}
          />
          {/* Into the order flow, not the old free-text /request?kind=survey
              form: a survey asked for from the map is the same catalogue order
              as one placed from Properties, and it has to be priced, reviewed
              and made idempotent the same way. `why=boundary` is the one thing
              this route knows that the flow does not — it writes "Asked for
              from the boundary screen" onto the order, so whoever picks it up
              knows the owner was looking at their own land when they asked. */}
          <Link className="btn" to={`/app/records/${rec.id}/order?service=survey&step=pick&why=boundary`}>
            <StraightenOutlined sx={{ fontSize: 16 }} /> Order a survey
          </Link>

          {/* One primary, and it is the thing a record without a boundary
              actually needs: the corner file a surveyor sent. The rest are
              one-off errands — they belong behind the overflow rather than in
              a row of seven that wraps onto two lines.

              It read "File the FMB sheet" until it was held against the accept
              list directly above. The picker takes a KML or a GeoJSON and
              nothing else, so an owner holding the sheet in the form the survey
              office issues it — a scan, a photograph — opened this and found
              their own document greyed out, and forcing one through said only
              that the file could not be read. The label now names the file the
              picker will actually take; the paper itself is filed on the
              record's Papers tab, which the sheet card below says out loud on
              the records that have no sheet. */}
          <button type="button" className="btn primary" disabled={!!busy || saving}
                  onClick={() => fileRef.current?.click()}>
            <UploadFileOutlined sx={{ fontSize: 16 }} /> Import KML / GeoJSON
          </button>
          <Menu label="More for this map" items={[
            ...(surveyed ? [{
              label: 'Export GeoJSON',
              // Down, because it leaves the app. The pair of these is the one
              // place an icon can say the opposite of its label.
              icon: <FileDownloadOutlined sx={{ fontSize: 17 }} />,
              onClick: exportGeoJson,
            }] : []),
            ...(away ? [{
              label: `Open in ${mapsAppName(away.app)}`,
              icon: <OpenInNewOutlined sx={{ fontSize: 17 }} />,
              // Named for the app that will actually open, so it never
              // promises Apple Maps to somebody on a Pixel. A real link, so it
              // can still be copied or opened in a new tab from a menu.
              href: away.href,
              onClick: () => undefined,
            }] : []),
            {
              label: 'Print this map',
              icon: <PrintOutlined sx={{ fontSize: 17 }} />,
              onClick: () => window.print(),
            },
          ]} />
          </>
        )}
      />

      <div className="split">
        {/* Escape is caught here rather than on the tip, which is drawn by the
            map component: the keydown bubbles out of it either way, and this is
            the one node that contains both the tip and everything else a
            pinned side can leave focus sitting on. */}
        {/* 34rem is a working floor, not a nicety: the edit bar, the corner
            hint, the caption and Leaflet's scale are all pixel-sized and sit on
            the bottom of this panel, so a shorter map starts covering the land
            it is drawing. See the note on `.split > .plot.live`. */}
        <div className="plot live" ref={plotEl} style={{ minHeight: '34rem' }}
             onClick={onPlotClick}
             onKeyDown={(e) => {
               if (e.key !== 'Escape') return;
               if (editing && !saving) { e.preventDefault(); stopEditing(); return; }
               if (pinnedSide == null && pinnedCorner == null) return;
               e.preventDefault();
               dropPin();
             }}>
          {/* Everything that acts on the map now lives ON the map. The header
              was seven buttons wide and not seven of a kind: two of them chose
              what you were looking at, three of them changed the record, and
              they sat in one undifferentiated row above a map they were all
              about. Up here the layers are chips and the tools are a panel
              that says out loud which of them write. */}
          <div className="maptools" onClick={(e) => e.stopPropagation()}>
            <span className="row tight">
              <button type="button" className="chip"
                      aria-pressed={satellite}
                      title={satellite ? 'Show the street map' : 'Show satellite imagery'}
                      onClick={() => setSatellite((on) => !on)}>
                Satellite
              </button>
              {village && (
                <button type="button" className="chip" aria-pressed={villageOn}
                        disabled={editing}
                        title={editing ? 'Finish editing to choose a village plot' : `Every survey plot in ${village}`}
                        onClick={() => {
                          const on = !villageOn;
                          setVillageOn(on);
                          setPlot(null);
                          setVmState(null);
                          // Start by looking for the record's own survey
                          // number. An owner turning this on is asking one
                          // question, and they already know the answer's name.
                          setPlotQuery(on ? surveyNo : '');
                        }}>
                  Village map
                </button>
              )}
              {surveyed && (
                <button type="button" className="chip" aria-pressed={measuring}
                        disabled={editing}
                        title={measuring
                          ? 'Hide measurements' : 'Show boundary measurements'}
                        onClick={() => setMeasuring((on) => {
                          if (on) { pickSide(null); pickCorner(null); }
                          return !on;
                        })}>
                  Measure
                </button>
              )}
            </span>

            {/* Named for what they do to the record, not for what they are.
                Measure is deliberately NOT in here — it changes what you see
                and nothing else, and a group headed "changes the record" has
                to be true of every row in it. */}
            <div className={`tools${mode === 'idle' ? '' : ' armed'}`}>
              {/* Armed, the panel shrinks to the tool that is armed. It stands
                  on the map, and the next thing to happen is a click on the
                  map — a full menu sitting over the corner you meant to place
                  is the tool getting in the way of itself. */}
              {mode === 'idle' && <span className="eyebrow">Changes the record</span>}
              <button type="button" className={mode === 'mark' || mode === 'move-mark' ? 'on' : ''}
                      aria-pressed={mode === 'mark' || mode === 'move-mark'}
                      disabled={saving || !!busy || !!naming}
                      onClick={() => {
                        if (mode === 'move-mark') { stopEditing(); return; }
                        setPinErr('');
                        setDraft([]);
                        setPlot(null);
                        setMode((m) => (m === 'mark' ? 'idle' : 'mark'));
                      }}>
                <PlaceOutlined sx={{ fontSize: 16 }} />
                {mode === 'mark' || mode === 'move-mark' ? 'Click the map — or cancel' : 'Add boundary mark'}
              </button>
              <button type="button" className={mode === 'pin' ? 'on' : ''}
                      aria-pressed={mode === 'pin'}
                      disabled={saving || !!busy || !!naming}
                      onClick={() => { setPinErr(''); setDraft([]);
                                       setPlot(null);
                                       setMode((m) => (m === 'pin' ? 'idle' : 'pin')); }}>
                <GpsFixedOutlined sx={{ fontSize: 16 }} />
                {setPin.isPending ? 'Saving…' : mode === 'pin' ? 'Click the map — or cancel' : 'Move the pin'}
              </button>
              <button type="button" className={mode === 'draw' ? 'on' : ''}
                      aria-pressed={mode === 'draw'}
                      disabled={saving || !!busy || !!naming}
                      onClick={() => {
                        if (mode === 'draw') { stopEditing(); return; }
                        beginDrawing();
                      }}>
                <TimelineOutlined sx={{ fontSize: 16 }} />
                {mode === 'draw' ? 'Drawing — or cancel' : surveyed ? 'Redraw boundary' : 'Draw boundary'}
              </button>
            </div>

          </div>

          {/* What the map is SAYING — the instruction, the draft bar, a
              location error. Pinned to the bottom rather than stacked under
              the tools: in draw mode that stack grew tall enough to cover the
              corner you were about to click, and the test that files four
              corners quietly got three. */}
          <div className="mapsays" onClick={(e) => e.stopPropagation()}>
            {/* The hint sits above the map in the stacking order, so it keeps
                working as a caption rather than becoming a Leaflet pane. */}
            {pinErr && (
              <p className="nogeo low" role="alert" style={{ color: 'var(--w-danger)' }}>{pinErr}</p>
            )}
            <p className="hint">
              {mode === 'mark'
                ? 'Click where the stone is. It is numbered in the order marks were added, and nothing is overwritten.'
                : mode === 'move-mark'
                ? `Click the corrected location for ${movingMark?.label || 'this mark'}. Its previous position is kept.`
                : mode === 'pin'
                ? 'Click where the land actually is — or use your current location if you are standing on it.'
                : mode === 'draw'
                  ? draftSource
                    ? `Previewing ${draftSource}. Check the outline, then save it to this record.`
                    : 'Click each corner in order. Drag a corner to adjust it, then save the outline.'
                  : 'Add a named boundary mark, or choose “Move this mark” from its menu to correct its position.'}
            </p>

            {mode === 'draw' && draft.length >= 3 && draftCheck.error && (
              <p className="note" role="status" style={{ color: 'var(--w-danger)' }}>{draftCheck.error}</p>
            )}

            {/* The bar only exists while something is being edited, and it holds
                the actions that finish the job — the header holds the ones that
                start it. */}
            {(mode !== 'idle' || busy) && (
              <div className="editbar">
                {busy && <span className="note">{busy}</span>}

                {mode === 'pin' && (
                  <button type="button" className="btn sm"
                          disabled={saving || !!busy}
                          onClick={() => {
                            setPinErr('');
                            if (!navigator.geolocation) {
                              setPinErr('This browser will not share a location.');
                              return;
                            }
                            const request = ++pendingRead.current;
                            setBusy('Reading your location…');
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                if (request !== pendingRead.current) return;
                                savePinAt(pos.coords.latitude, pos.coords.longitude);
                              },
                              // Denied, unavailable, or timed out — all three are
                              // ordinary, and none of them should look like a bug.
                              (err) => {
                                if (request !== pendingRead.current) return;
                                setBusy('');
                                setPinErr(
                                  err.code === err.PERMISSION_DENIED
                                    ? 'Location permission was refused, so the pin was not moved.'
                                    : 'Your location could not be read. Click the map instead.');
                              },
                              { enableHighAccuracy: true, timeout: 12_000 },
                            );
                          }}>
                    <MyLocationOutlined sx={{ fontSize: 15 }} /> Use my current location
                  </button>
                )}

                {mode === 'draw' && (
                  <>
                    <span className="num" style={{ fontSize: '0.8125rem' }}>
                      {draft.length} {draft.length === 1 ? 'corner' : 'corners'}
                      {draftAcres > 0 && !draftCheck.error && (draftAcres < 0.01
                        ? ` · ${Math.round(draftAcres * SQ_M_PER_ACRE)} m²`
                        : ` · ${draftAcres.toFixed(2)} ac`)}
                      {draft.length >= 3 && ` · ${Math.round(ringPerimM(draft)
                        * (lengthUnit === 'ft' ? LENGTH_FT.m : 1)).toLocaleString('en-IN')} ${lengthUnit} around`}
                    </span>
                    <button type="button" className="btn sm" disabled={!draft.length || saving || !!busy}
                            onClick={() => setDraft((d) => d.slice(0, -1))}>
                      Undo corner
                    </button>
                    <button type="button" className="btn sm" disabled={!draft.length || saving || !!busy}
                            onClick={() => setDraft([])}>
                      Clear
                    </button>
                    <button type="button" className="btn primary sm"
                            disabled={!!draftCheck.error || saving || !!busy}
                            onClick={() => saveDraft(draft, 'Saving the boundary…')}>
                      {saveRing.isPending ? 'Saving…' : 'Save boundary'}
                    </button>
                    {/* Withdrawing a wrong outline has to be as easy as drawing
                        one, or the map fills up with shapes nobody trusts. */}
                    {surveyed && (
                      <button type="button" className="btn sm danger"
                              disabled={saving || !!busy}
                              onClick={() => saveDraft([], 'Removing the boundary…')}>
                        Remove saved boundary
                      </button>
                    )}
                  </>
                )}

                <button type="button" className="btn sm" disabled={saving} onClick={stopEditing}>Cancel</button>
              </div>
            )}
          </div>

          <MapCanvas
            ref={mapRef}
            ring={ring}
            pin={pin}
            marks={marks}
            place={place}
            /* Both arguments: the place the map settled on, and its verdict on
               a pin that does not agree with it. Safe as an inline arrow —
               MapCanvas holds this callback in a ref during render, so it is
               not one of its effect's dependencies. */
            onPlace={(label, msg) =>
              setShownPlace(label ? { label, suspect: msg ?? '' } : null)}
            village={village}
            /* Everything after the village: the mandal and district a hit has to
               agree with before it is believed. */
            placeWithin={rec.placeLine.split(',').slice(1).map((x) => x.trim())}
            showVillage={villageOn && !editing}
            findPlot={villageOn && !editing ? plotQuery : null}
            onVillageState={setVmState}
            activePlot={plot?.lp ?? null}
            onVillagePlot={villageOn && !editing ? setPlot : undefined}
            sideLabels={showMeasurements ? measure?.labels : undefined}
            activeSide={showMeasurements ? activeSide : null}
            onSideClick={showMeasurements
              ? (i) => pickSide(pinnedSide === i ? null : i)
              : undefined}
            onCornerClick={showMeasurements
              ? (i) => pickCorner(pinnedCorner === i ? null : i)
              : undefined}
            activeCorner={showMeasurements ? pinnedCorner : null}
            tip={showMeasurements ? (cornerTip ?? sideTip) : null}
            dimOutside={showMeasurements && !villageOn}
            introduce={introduce}
            picking={!saving && (mode === 'pin' || mode === 'mark' || mode === 'move-mark')}
            drawing={mode === 'draw'}
            editDisabled={saving || !!busy}
            draft={draft}
            onDraft={(points) => { if (!saving && !busy) setDraft(points); }}
            onPick={(lat, lon) => {
              if (saving) return;
              if (mode === 'move-mark' && movingMark) {
                setPinErr('');
                moveMark.mutate({ markId: movingMark.id, lat, lon }, {
                  onSuccess: (res) => {
                    if (currentRecord.current !== rec.id) return;
                    if ((res as { web?: { moveMark?: boolean } })?.web?.moveMark !== true) {
                      setPinErr('That mark could not be moved.');
                      return;
                    }
                    stopEditing();
                  },
                  onError: (e) => {
                    if (currentRecord.current === rec.id) {
                      setPinErr(e instanceof Error ? e.message : 'That mark could not be moved.');
                    }
                  },
                });
                return;
              }
              if (mode === 'mark') {
                setMode('idle');
                setPinErr('');
                // Ask what it is before filing it. Placing a mark called
                // "Mark 3" and leaving no way to rename it was the whole
                // complaint: a stone nobody can name is not a record of
                // anything.
                setNaming({ at: [lat, lon], label: '', detail: '' });
                return;
              }
              if (mode === 'pin') savePinAt(lat, lon);
            }}
            basemap={basemap}
            activeMarkId={activeMark}
            onMarkClick={setActiveMark}
            title={data.title}
          />

          {/* Attribution is a licence condition and Leaflet already prints it
              in the corner; the caption stays the record's own sentence. */}
          <span className="cap">
            {surveyed
              ? `${data.caption} · ${basemap === 'satellite' ? 'Esri World Imagery' : 'OpenStreetMap'}`
              : data.caption}
          </span>
          {villageOn && !editing && (
            <div className="plotfind">
              <label className="eyebrow" htmlFor="w360-plotfind">Find plot no.</label>
              <input
                id="w360-plotfind"
                value={plotQuery}
                inputMode="numeric"
                placeholder={surveyNo || '123'}
                onChange={(e) => { setPlotQuery(e.target.value); setPlot(null); setVmState(null); }}
              />
              {plotQuery.trim() !== '' && vmState && !vmState.found && (
                <span className="note" style={{ color: 'var(--w-danger)' }}>
                  No plot {plotQuery.trim()} in this village map.
                </span>
              )}
            </div>
          )}

          {/* A plot picked out of the village map. This is the answer for an
              owner with no FMB: the survey department already holds the exact
              shape of every plot in the village, so the question is not "draw
              your land" but "which of these is yours". Nothing is written
              until they say so, and the extent is shown beside the record's
              own so a wrong plot is obvious before it is adopted. */}
          {plot && !editing && (
            <div className="plotpick">
              <div>
                <span className="eyebrow">From the village map</span>
                <strong style={{ display: 'block', fontSize: '0.9375rem' }}>
                  Plot {plot.lp}
                </strong>
                <span className="note">
                  {plot.ac ? `${plot.ac} ac on the village map` : 'extent not stated'}
                  {rec.extentUnit === 'ac' && rec.extent
                    ? ` · ${num(rec.extent, 2)} ac on this record`
                    : ''}
                </span>
                {plot.ac && rec.extentUnit === 'ac' && rec.extent > 0
                  && Math.abs(Number(plot.ac) - rec.extent) / rec.extent > 0.1 && (
                  <span className="note" style={{ display: 'block', color: 'var(--w-danger)' }}>
                    That is a different size from what this record says it owns.
                  </span>
                )}
              </div>
              <div className="row tight">
                <button type="button" className="btn primary sm"
                        disabled={saveRing.isPending}
                        onClick={() => saveDraft(plot.ring, `Taking plot ${plot.lp}…`)}>
                  {saveRing.isPending
                    ? 'Saving…'
                    : surveyed ? 'Replace the boundary with this plot' : 'This is my land'}
                </button>
                <button type="button" className="btn sm" onClick={() => setPlot(null)}>
                  Not this one
                </button>
              </div>
            </div>
          )}

          {copied && <p className="nogeo low">Coordinates copied.</p>}

          {/* Three states, not one. The map also calls back for a record that
              HAS a pin, when that pin is implausibly far from the village
              written on it — and the single sentence here then said nothing on
              this record says where the land sits, contradicting the
              coordinates printed in the Location card beside it. The check's
              own message names the distance, so it is printed as it stands
              rather than paraphrased into something vaguer.

              `!surveyed` stays, and is load-bearing: MapCanvas leaves its
              place-finding effect early once a ring exists and never calls
              back with null, so a boundary drawn on this very screen would
              otherwise leave the last label standing underneath it. */}
          {shownPlace && !surveyed && (
            <p className="nogeo low">
              {!pinned
                ? `The map is showing ${shownPlace.label} — not this ${noun}. Nothing on this record says where within it the land sits.`
                : shownPlace.suspect
                  || `The map is showing ${shownPlace.label}; this record's pin falls outside it.`}
            </p>
          )}
          <div className="zoom">
            <button type="button" aria-label="Zoom in"
                    onClick={() => mapRef.current?.zoomIn()}>+</button>
            <button type="button" aria-label="Zoom out"
                    onClick={() => mapRef.current?.zoomOut()}>−</button>
            <button type="button" aria-label="Recentre"
                    onClick={() => mapRef.current?.fit()}>
              <MyLocationOutlined sx={{ fontSize: 15 }} />
            </button>
          </div>
        </div>

        <aside className="stack">
          {showMeasurements && measure && (
            <Card
              title="Measurements"
              aside={
                <span className="row tight">
                  <span className="segmented" role="group" aria-label="Length unit">
                    {(['m', 'ft'] as const).map((u) => (
                      <button key={u} type="button" aria-pressed={lengthUnit === u}
                              onClick={() => setLengthUnit(u)}>
                        {u === 'm' ? 'Metres' : 'Feet'}
                      </button>
                    ))}
                  </span>
                  {/* Measurements are on by default now, so the way OUT has to
                      be on the thing itself. The header toggle is a filled
                      button, which reads as an action to take rather than a
                      state to leave — fine when you switched it on yourself,
                      useless when you never did. */}
                  <button type="button" className="cardx" aria-label="Hide measurements"
                          title="Hide measurements"
                          onClick={() => { setMeasuring(false); pickSide(null); pickCorner(null); }}>
                    ×
                  </button>
                </span>
              }
            >
              <KV
                rows={[
                  { k: 'Sides', v: String(measure.sides.length) },
                  { k: 'Around', v: measure.len(measure.perimM) },
                  // Areas do not convert. Acres and guntas is how land is
                  // spoken about here, whatever the sides are measured in.
                  // Whole guntas. formatAcresGuntas keeps two decimals, which
                  // is right for an extent read off a passbook and wrong for
                  // one measured off imagery — 0.54 of a gunta is 24 m².
                  { k: 'Area', v: measure.acres < 1 / 40
                    ? `${num(measure.acres * SQ_M_PER_ACRE, 0)} m²`
                    : formatExtent(Math.round(measure.acres * 40) / 40, 'acres-guntas') },
                  { k: 'On record', v: rec.extentDetail || `${num(rec.extent, 2)} ${rec.extentUnit}` },
                ]}
              />
              <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                Approximate measurements from the saved outline.
              </p>
              {vsRecorded && (
                <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                  {vsRecorded.band === 'close'
                    ? `Within ${Math.abs(vsRecorded.pct).toFixed(1)}% of the extent on record — as close as a traced boundary gets.`
                    : vsRecorded.band === 'check'
                      ? `${Math.abs(vsRecorded.pct).toFixed(1)}% ${vsRecorded.diff > 0 ? 'larger' : 'smaller'} than the extent on record. A traced outline drifts by a few percent, so this is worth a look rather than an alarm.`
                      : `${Math.abs(vsRecorded.pct).toFixed(0)}% ${vsRecorded.diff > 0 ? 'larger' : 'smaller'} than the extent on record. That is far too big a gap to be tracing error — either this outline is not the parcel, or the recorded extent is wrong.`}
                </p>
              )}

              <table className="sidetable" style={{ marginTop: 'var(--space-md)' }}>
                <thead>
                  <tr><th>Side</th><th>Length</th><th>Direction</th></tr>
                </thead>
                <tbody>
                  {measure.sides.map((side, i) => (
                    <tr key={`${side.from}-${side.to}`}
                        className={pinnedSide === i || keyFocus === i ? 'lit' : undefined}
                        onMouseEnter={() => setHoverSide(i)}
                        onMouseLeave={() => setHoverSide(null)}>
                      {/* A real button in the first cell, not a clickable row.
                          The <tr> carried the click, so the screen's central
                          interaction — light the side, open the tip, copy both
                          corners to read down a phone to a surveyor — was
                          mouse-only: Tab skipped every row and Enter did
                          nothing. role="button" on the <tr> was not the way
                          out: inside a table it replaces the row role and cuts
                          the three cells off from their column headers, which
                          costs a screen-reader user the Side / Length /
                          Direction reading they came for. A <button> answers
                          Enter and Space on its own. */}
                      <td className="num">
                        <button type="button"
                                ref={(el) => { sideBtns.current[i] = el; }}
                                aria-pressed={pinnedSide === i}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left',
                                  background: 'none', border: 0, padding: 0,
                                  font: 'inherit', color: 'inherit', cursor: 'pointer',
                                  ...(keyFocus === i
                                    ? {
                                      outline: '2px solid var(--color-focus)',
                                      outlineOffset: '-2px',
                                    }
                                    : null),
                                }}
                                onMouseDown={() => { pointer.current = true; }}
                                onFocus={() => {
                                  // Focus previews the side the way hover does,
                                  // so tabbing down the table walks the
                                  // boundary on the map.
                                  setHoverSide(i);
                                  if (!pointer.current) setKeyFocus(i);
                                }}
                                onBlur={() => { setHoverSide(null); setKeyFocus(null); }}
                                onKeyDown={(e) => {
                                  if (e.key !== 'Escape') return;
                                  if (pinnedSide == null && pinnedCorner == null) return;
                                  e.preventDefault();
                                  dropPin();
                                }}
                                onClick={() => {
                                  const byKey = !pointer.current;
                                  pointer.current = false;
                                  if (pinnedSide === i) { pickSide(null); return; }
                                  toTip.current = byKey;
                                  pickSide(i);
                                }}>
                          {cornerLabel(side.from - 1)} → {cornerLabel(side.to - 1)}
                        </button>
                      </td>
                      <td className="num">{measure.len(side.metres)}</td>
                      {/* A compass point, not a decimal bearing: a traced side
                          carries a degree or two of error, so 47.3° would be
                          precision this screen has not earned. */}
                      <td className="num">{compassPoint(side.bearing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* First in the rail while the record has no pin, because until it
              has one every other card here is describing an absence. Three
              routes, in the order of how much they are worth: standing on the
              land beats dropping a pin from a desk, and both beat guessing.
              It leaves once a pin exists — advice about how to do the thing
              that is already done is clutter. */}
          {!pinned && (
            <Card title="How a pin is placed" className="railcard">
              <ul className="railnotes railsteps">
                <li>Stand on the land and drop the pin from your phone.</li>
                <li>Or drop it on the map from anywhere, then correct it later.</li>
                <li>Or order a boundary check and a checker pins it for you.</li>
              </ul>
            </Card>
          )}

          <Card title="Location" className="railcard">
            <KV
              rows={[
                ...(surveyed && centre
                  ? [{ k: 'Boundary', v: coords(centre.latitude, centre.longitude) }]
                  : []),
                // coords() guards the unset case: 0,0 printed as "0.0000,
                // 0.0000" reads as a real place, and it is in the Gulf of
                // Guinea. W03's location card has always used this helper.
                { k: 'Pin', v: coords(data.lat, data.lon) || 'not set' },
                { k: 'Set by', v: data.setBy, highlight: true },
                { k: 'Accuracy', v: data.accuracy },
              ]}
            />
            {pinVsRing && (
              <>
                <p className="note" style={{ marginTop: 'var(--space-sm)', color: 'var(--w-danger)' }}>
                  The pin is {formatDistance(pinVsRing.distanceKm)} from the boundary
                  drawn on this record. One of the two is wrong.
                </p>
                <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                  <button type="button" className="btn sm"
                          disabled={saving || !!busy || !centre}
                          onClick={() => {
                            if (!centre) return;
                            savePinAt(centre.latitude, centre.longitude);
                          }}>
                    {setPin.isPending ? 'Moving…' : 'Move the pin onto the boundary'}
                  </button>
                </div>
              </>
            )}
          </Card>

          {/* No "Add a mark" here any more: the tool lives on the map with the
              other three that write, and one mode with two switches is how
              they end up disagreeing about which is on. */}
          <Card title="Boundary marks" className="railcard">
            {/* Four stones in the list and none of them on the map is a
                contradiction the screen used to keep to itself: the marks are
                simply drawn wherever they say they are, which may be a
                different district. Say it, with the distance. */}
            {naming && (
              <div className="marknote">
                <label>
                  <span className="eyebrow">What is this mark</span>
                  <input
                    autoFocus
                    value={naming.label}
                    placeholder="South-west stone"
                    maxLength={80}
                    onChange={(e) => setNaming({ ...naming, label: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveNaming(); }
                      if (e.key === 'Escape') { e.preventDefault(); setNaming(null); }
                    }}
                  />
                </label>
                <label>
                  <span className="eyebrow">Anything worth remembering</span>
                  <input
                    value={naming.detail}
                    placeholder="granite, chipped on the north face"
                    maxLength={200}
                    onChange={(e) => setNaming({ ...naming, detail: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveNaming(); }
                      if (e.key === 'Escape') { e.preventDefault(); setNaming(null); }
                    }}
                  />
                </label>
                <div className="row tight">
                  <button type="button" className="btn primary sm"
                          disabled={!naming.label.trim() || addMark.isPending || editMark.isPending}
                          onClick={saveNaming}>
                    {addMark.isPending || editMark.isPending
                      ? 'Saving…'
                      : naming.id ? 'Save the name' : 'Add this mark'}
                  </button>
                  <button type="button" className="btn sm" disabled={addMark.isPending || editMark.isPending}
                          onClick={() => setNaming(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* A boundary read from a KML already names its corners — that is
                what its coordinate list is — so making the owner click them
                back in one at a time is asking for work the file already did. */}
            {surveyed && marks.length === 0 && !naming && (
              <p className="note" style={{ marginBottom: 'var(--space-sm)' }}>
                <button type="button" className="btn sm"
                        disabled={marksFromRing.isPending}
                        onClick={() => {
                          setPinErr('');
                          marksFromRing.mutate({ recordId: rec.id }, {
                            onError: (e) => setPinErr(e instanceof Error
                              ? e.message : 'Those marks could not be added.'),
                          });
                        }}>
                  {marksFromRing.isPending
                    ? 'Adding…'
                    : `Add a mark at each of the ${ring.length} corners`}
                </button>
              </p>
            )}

            {strayMarks.length > 0 && centre && (
              <p className="note" style={{ color: 'var(--w-danger)', marginBottom: 'var(--space-sm)' }}>
                {strayMarks.length === marks.length
                  ? `None of these ${marks.length} stones is near the boundary on this record — the nearest is `
                  : `${strayMarks.length} of these ${marks.length} stones ${strayMarks.length === 1 ? 'is' : 'are'} not near the boundary — the nearest of them is `}
                {formatDistance(Math.min(...strayMarks.map((m) =>
                  haversineKm({ latitude: m.lat, longitude: m.lon }, centre))))} away,
                so {strayMarks.length === 1 ? 'it is' : 'they are'} off the map you are looking at.
              </p>
            )}
            {marks.length === 0 && (
              <p className="note">
                No marks recorded. A mark is a numbered corner with its own photos and its
                own history — add one, or order a survey and the surveyor sets them.
              </p>
            )}
            <div className="rows">
              {marks.map((m) => {
                const moved = m.state === 'moved';
                return (
                  <div key={m.id} style={{ display: 'block', padding: 'var(--space-sm) 0' }}>
                    <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                      <span
                        className="avatarlg"
                        style={{
                          width: '1.5rem', height: '1.5rem', fontSize: '0.6875rem',
                          background: moved ? 'var(--w-danger-wash)' : 'var(--w-accent-wash)',
                          color: moved ? 'var(--w-danger)' : 'var(--w-accent)',
                          borderColor: 'transparent',
                        }}
                      >
                        {m.seq}
                      </span>
                      <span className="grow">
                        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: moved ? 'var(--w-danger)' : undefined }}>
                          {m.label}
                        </span>
                        <span className="note" style={{ display: 'block' }}>{m.detail}</span>
                      </span>
                      {/* Was a decorative <span> holding a kebab icon — it
                          looked like a menu and did nothing. Every action a
                          mark has now lives behind it, including the delete
                          that was previously reachable only on a moved one. */}
                      <Menu label={`Actions for ${m.label || `mark ${m.seq}`}`} items={[
                        ...(moved ? [{
                          label: accepting === m.id ? 'Accepting…' : 'Accept the new position',
                          onClick: () => acceptMark(m.id),
                        }] : []),
                        {
                          label: 'Move this mark',
                          onClick: () => {
                            if (saving || busy || naming) return;
                            setPinErr('');
                            setPlot(null);
                            setMovingMark({ id: m.id, label: m.label || `mark ${m.seq}` });
                            setActiveMark(m.id);
                            setMode('move-mark');
                            plotEl.current?.scrollIntoView({ block: 'nearest' });
                          },
                        },
                        {
                          label: 'Rename or describe it',
                          onClick: () => setNaming({
                            id: m.id, label: m.label ?? '', detail: m.detail ?? '',
                          }),
                        },
                        // "View its N photos" used to sit here, gated on
                        // `m.photoCount`. That count came from a stored column
                        // nothing maintained, and the resolver now reports 0
                        // for every mark because no photo in this schema can
                        // name a mark: a photo links to a FEATURE and to an
                        // ORDER, never to a corner stone. So the branch could
                        // never render, and when it did it opened the record's
                        // whole unfiltered gallery rather than the mark's
                        // pictures — a promise the data cannot keep. The
                        // gallery is one item below, named for what it is.
                        {
                          label: "Open the record's photos",
                          onClick: () => nav(`/app/records/${rec.id}/photos`),
                        },
                        {
                          label: removing === m.id ? 'Deleting…' : 'Delete this mark',
                          danger: true,
                          onClick: () => deleteMark(m.id),
                        },
                      ]} />
                    </div>

                    {moved && (
                      <>
                        <div className="row tight" style={{ marginTop: 'var(--space-sm)', paddingLeft: '2rem' }}>
                          {/* This one had no onClick at all, and was then gated
                              on a photo count that nothing in the schema can
                              produce for a mark. Ungated and renamed: it opens
                              the record's gallery, which is what it has always
                              actually done, on the one mark an owner is most
                              likely to want a photograph of. */}
                          <button type="button" className="btn sm"
                                  onClick={() => nav(`/app/records/${rec.id}/photos`)}>
                            Open the record's photos
                          </button>
                          <button type="button" className="btn sm"
                                  disabled={accepting === m.id}
                                  onClick={() => acceptMark(m.id)}>
                            {accepting === m.id ? 'Accepting…' : 'Accept new position'}
                          </button>
                          <button type="button" className="btn sm danger"
                                  disabled={removing === m.id}
                                  onClick={() => deleteMark(m.id)}>
                            {removing === m.id ? 'Deleting…' : 'Delete mark'}
                          </button>
                        </div>
                        <p className="note" style={{ marginTop: 'var(--space-sm)', paddingLeft: '2rem' }}>
                          Deleting a mark keeps the old position in History — the FMB sheet it came
                          from is never edited.
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* With no sheet filed, the card does not pretend there is one: it
              offers the way to get one instead. "Open sheet" on a record with
              no file is a button that can only disappoint. */}
          {!data.sheetTitle && (
            <Card title="FMB sheet" className="railcard">
              <p className="note">
                No FMB or survey sheet is filed against this record, so there is
                nothing to open. Upload the KML a surveyor sent you and its
                corners become this parcel&rsquo;s boundary. The sheet itself —
                a scan or a photograph of the paper — is filed on this
                record&rsquo;s Papers tab, and nothing here reads one.
              </p>
              {/* The button said "Upload FMB / KML" over a picker that takes
                  neither an FMB scan nor a photograph of one. It offers what it
                  opens; "Replace from KML" on the filed-sheet card below has
                  always been honest and is the wording copied here. */}
              <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                <button type="button" className="btn primary sm" disabled={!!busy || saving}
                        onClick={() => fileRef.current?.click()}>
                  <UploadFileOutlined sx={{ fontSize: 15 }} /> Import KML / GeoJSON
                </button>
                <button type="button" className="btn sm" disabled={!!busy || saving}
                        onClick={beginDrawing}>
                  Draw it instead
                </button>
              </div>
            </Card>
          )}

          {data.sheetTitle && (
            <Card>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--space-sm)' }}>
                <span style={{ display: 'flex', color: 'var(--w-info)' }}>
                  <FullscreenOutlined sx={{ fontSize: 18 }} />
                </span>
                <span className="grow">
                  <strong style={{ fontSize: '0.875rem' }}>{data.sheetTitle}</strong>
                  <span className="note" style={{ display: 'block' }}>{data.sheetDetail}</span>
                </span>
              </div>
              <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
                {/* The paper is on the shelf; the reader is where it opens. */}
                <Link className="btn sm" to={`/app/papers/${data.sheetId}`}>Open sheet</Link>
                <button type="button" className="btn sm" disabled={!!busy || saving}
                        onClick={() => fileRef.current?.click()}>
                  Import replacement boundary
                </button>
              </div>
              {!surveyed && (
                <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
                  The sheet is filed but its corners have never been placed on the
                  ground, which is why there is no boundary drawn.
                </p>
              )}
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
