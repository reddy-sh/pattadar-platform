/** The Hydrogeology card beside a record's map (docs/specs/2026-10-13-water-flow-layer.md).
 *
 *  It describes how rainwater drains over the surface, worked out from free
 *  30 m elevation maps; it is not groundwater data. Every state of the card
 *  says so, and it never promises water. */
import { useEffect, useMemo, useState } from 'react';
import { navigateLink } from '@pattadar/core';

import { useRetryWaterFlow, useWaterFlow, useWaterFlowOthers } from './api';
import type { FlowArea, FlowConfidence, FlowMap, WaterFlowData, WaterFlowView } from './api';
import type { FlowLine, WaterFlowLayer } from './flowLayer';
import { FLOW_INK as INK } from './flowInk';
import { useToast } from './Toast';
import { Card, Failed, KV, StatusChip, num } from './ui';

/** Owner words for each map (design.md E2); the agencies and dataset names
 *  stay in the credit line, which the licences require. `short` names the
 *  map in the map key and the loading line. */
export const FLOW_MAPS: Array<{ id: FlowMap; label: string; short: string; about: string }> = [
  { id: 'combined', label: 'All maps agree', short: 'all maps agree',
    about: 'The middle height of the three independent maps at every spot, so one map\'s error is outvoted.' },
  { id: 'srtm', label: 'NASA radar, 2000 (SRTM)', short: 'NASA radar',
    about: 'Radar from a 2000 space shuttle flight. This is what most borewell consultants draw their lines from.' },
  { id: 'nasadem', label: 'NASA radar re-processed, 2020 (NASADEM)', short: 'NASA radar re-processed',
    about: 'The same 2000 radar, re-processed in 2020.' },
  { id: 'aw3d30', label: 'Japanese satellite photos, 2006–2011 (AW3D30)', short: 'Japanese satellite photos',
    about: 'Built from pairs of satellite photos, the same way as ISRO\'s CartoDEM.' },
  { id: 'copernicus', label: 'European radar, 2011–2015 (Copernicus)', short: 'European radar',
    about: 'Radar from 2011 to 2015. The newest of the four.' },
];
/** A map's short owner name, for the key and the loading line. */
export const flowMapName = (id: FlowMap | undefined) => FLOW_MAPS.find((m) => m.id === id)?.short ?? '';
const mapLabel = (id: FlowMap) => FLOW_MAPS.find((m) => m.id === id)?.label ?? id;

const CONFIDENCE: Record<FlowConfidence, { state: string; word: string }> = {
  high: { state: 'good', word: 'High confidence' },
  medium: { state: 'warn', word: 'Medium confidence' },
  low: { state: 'unknown', word: 'Low confidence' },
};

const BEARING: Record<string, string> = {
  N: 'north', NE: 'north-east', E: 'east', SE: 'south-east',
  S: 'south', SW: 'south-west', W: 'west', NW: 'north-west',
};

const acres = (ha: number) => {
  const ac = ha * 2.4711;
  return ac < 10 ? num(ac, 1) : num(Math.round(ac));
};

/** A GeoJSON ring [lon, lat] as Leaflet's [lat, lon]. */
const latLon = (ring: Array<[number, number]> | undefined) =>
  (ring ?? []).map(([lon, lat]) => [lat, lon] as [number, number]);

/** Every drainage line of one answer, as the map draws them. Built once per
 *  answer: choosing a pin must not hand the map two thousand new lines. */
export const flowLines = (data: WaterFlowData): FlowLine[] => data.lines.features.map((f) => ({
  coords: latLon(f.geometry.coordinates), ha: f.properties.upslope_ha, agree: f.properties.agree,
}));

/** A drainage area's outer ring, as the map draws it. */
export const flowArea = (area: FlowArea | null | undefined) =>
  (area ? latLon(area.geometry.coordinates[0]) : null);

/** The slider's range: the smallest line drawn (10 cells, about 0.9 ha) up
 *  to streams draining about a hundred hectares. */
const MIN_AC = 2.2;
const MAX_AC = 250;

/** How long a first reading usually takes. The server does not report
 *  progress, so the bar is indeterminate and this is said as a guess. */
const TYPICAL_SECONDS = 30;

/** Something is loading: a turning ring, what it is, and — for the first
 *  reading, the only slow one — an indeterminate bar and how long it has
 *  been. Not a live region: the card announces the start and the end once
 *  (WaterFlowCard), so a ticking count is never read out. Remount (key on
 *  the text) to restart the clock. */
export function FlowProgress({ text, slow, className }: { text: string; slow: boolean; className?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className={`w-flow-progress ${className ?? ''}`}>
      <span className="row tight" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
        <span className="w-flow-ring" aria-hidden />
        <span>{text}</span>
      </span>
      {slow && (
        <>
          <span className="w-flow-bar" aria-hidden><i /></span>
          <span className="note num" aria-hidden>
            {seconds} s · usually about {TYPICAL_SECONDS} s the first time
          </span>
        </>
      )}
    </div>
  );
}

const DISCLAIMER = 'These lines show where rainwater flows on the surface. They do not guarantee '
  + 'groundwater. Before drilling, get a resistivity survey and ask neighbours about their borewells.';

export function WaterFlowCard({
  flow, loading, error, stale, source, onSource, showMain, onShowMain, showPinArea, onShowPinArea,
  selected, onSelect, minAcres, onMinAcres, byAgreement, onByAgreement, compare, onCompare, loadingText, pinsOnly, onPinsOnly,
  onRetry,
}: {
  flow: WaterFlowView | null | undefined;
  loading: boolean;
  error: unknown;
  /** Showing the previous map's answer while the chosen one is read. */
  stale: boolean;
  source: FlowMap;
  onSource: (m: FlowMap) => void;
  showMain: boolean;
  onShowMain: (on: boolean) => void;
  showPinArea: boolean;
  onShowPinArea: (on: boolean) => void;
  selected: number | null;
  onSelect: (rank: number) => void;
  /** Lines draining less than this are left off the map. */
  minAcres: number;
  onMinAcres: (ac: number) => void;
  byAgreement: boolean;
  onByAgreement: (on: boolean) => void;
  compare: boolean;
  onCompare: (on: boolean) => void;
  /** What is still loading, or '' when nothing is. */
  loadingText: string;
  /** Only the boundary and the bore points on the map. */
  pinsOnly: boolean;
  onPinsOnly: (on: boolean) => void;
  /** Try again on the server's "failed": asks it to read again now. */
  onRetry: () => Promise<unknown>;
}) {
  const toast = useToast();
  const data = flow?.status === 'ready' ? flow.data : null;
  const busy = loading || flow?.status === 'computing';
  const shortText = loadingText.split('… ')[0].replace(/…?$/, '…');

  // One announcement when a read starts and one when it ends. Set after the
  // render, so a region mounted with its text still has a change to announce.
  // A failure is announced by the Failed block's own alert.
  const said = loadingText ? shortText
    : data ? 'The lines are ready.'
      : flow?.status === 'unavailable' ? flow.reason : '';
  const [announce, setAnnounce] = useState('');
  useEffect(() => setAnnounce(said), [said]);

  const copy = (text: string) => {
    // Inside a promise, so a browser with no clipboard API lands in the catch.
    void Promise.resolve().then(() => navigator.clipboard.writeText(text))
      .then(() => toast.ok('Coordinates copied'))
      .catch(() => toast.bad('That could not be copied. Select it and copy it by hand.'));
  };

  const swatch = (colour: string) => (
    <span aria-hidden style={{
      width: '0.875rem', height: '0.875rem', borderRadius: '0.1875rem', flex: 'none',
      border: `2px solid ${colour}`, background: `color-mix(in oklab, ${colour} 20%, transparent)`,
    }} />
  );

  return (
    <Card title="Hydrogeology" className="railcard" busy={stale}>
      <span className="sr-only" role="status">{announce}</span>
      {/* First, so it is in view with the lines whatever the card's length. */}
      <p className="note" style={{ marginTop: 0 }}>{DISCLAIMER}</p>
      <div className="field">
        <label htmlFor="wf-map">Elevation map</label>
        <select id="wf-map" value={source} onChange={(e) => onSource(e.target.value as FlowMap)}
                disabled={!data && flow?.status !== 'failed' && error == null}>
          {FLOW_MAPS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <p className="note">{FLOW_MAPS.find((m) => m.id === source)?.about}</p>
      {/* Nothing to act on until there is an answer. The map above stays
          choosable after a failure: another map may answer where this did not. */}
      <fieldset disabled={!data} style={{ border: 0, padding: 0, margin: 0, opacity: data ? 1 : 0.5 }}>
      <div style={{ margin: 'var(--space-sm) 0' }}>
        <label className="check">
          <input type="checkbox" checked={pinsOnly} onChange={(e) => onPinsOnly(e.target.checked)} />
          <span>Show only the bore points</span>
        </label>
      </div>
      <fieldset disabled={pinsOnly} style={{ border: 0, padding: 0, margin: 0, opacity: pinsOnly ? 0.5 : 1 }}>
      <div className="field" style={{ marginTop: 'var(--space-sm)' }}>
        <label htmlFor="wf-min" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Draw lines draining at least</span>
          <span className="num">{num(minAcres, minAcres < 10 ? 1 : 0)} ac</span>
        </label>
        <input id="wf-min" type="range" min={0} max={100} step={1}
               value={Math.round(100 * Math.log(minAcres / MIN_AC) / Math.log(MAX_AC / MIN_AC))}
               onChange={(e) => onMinAcres(MIN_AC * (MAX_AC / MIN_AC) ** (Number(e.target.value) / 100))}
               style={{ width: '100%', accentColor: 'var(--w-accent)' }} />
      </div>
      <div style={{ margin: 'var(--space-sm) 0' }}>
        <label className="check">
          <input type="checkbox" checked={showMain} onChange={(e) => onShowMain(e.target.checked)} />
          {swatch(INK.main)}
          <span>Area draining to the main stream</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={showPinArea} onChange={(e) => onShowPinArea(e.target.checked)} />
          {swatch(INK.pinArea)}
          <span>Area draining to the chosen bore point</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={byAgreement} onChange={(e) => onByAgreement(e.target.checked)} />
          <span>Colour lines by how many maps agree</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={compare} onChange={(e) => onCompare(e.target.checked)} />
          <span>Show the other maps' lines faintly</span>
        </label>
      </div>
      </fieldset>
      </fieldset>
      {byAgreement && (
        <p className="note">Solid: all 3 maps put a line there. Lighter: 2 of 3. Dashed: only this map.</p>
      )}

      {/* The map carries the one progress indicator; here, a plain note. */}
      {loadingText && <p className="note">{shortText}</p>}
      {!busy && error != null && <Failed what="Hydrogeology" error={error} />}
      {!busy && error == null && flow == null && (
        <p className="note">Hydrogeology is not available for this property.</p>
      )}
      {flow?.status === 'unavailable' && <p className="note">{flow.reason}</p>}
      {!busy && flow?.status === 'failed' && <Failed what="Hydrogeology" error={flow.reason} onRetry={onRetry} />}

      {data && <FlowAnswer data={data} selected={selected} onSelect={onSelect} onCopy={copy} />}

      <p className="note" style={{ fontSize: '0.6875rem' }}>
        Elevation maps: SRTM and NASADEM (NASA); AW3D30 © JAXA; Copernicus DEM © DLR e.V. 2010-2014
        and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union
        and ESA; all rights reserved.
      </p>
    </Card>
  );
}

function FlowAnswer({
  data, selected, onSelect, onCopy,
}: {
  data: WaterFlowData; selected: number | null; onSelect: (rank: number) => void;
  onCopy: (text: string) => void;
}) {
  const { parcel, main_stream: main } = data;
  const relief = parcel.relief_1km_m;
  const slope = relief < 10 ? 'the land is flat, so the maps often disagree on where water runs'
    : relief < 20 ? 'the land is fairly flat, so treat the lines with care'
      : 'the land is clearly sloped';

  return (
    <>
      <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
        Ground height varies about <span className="num">{num(relief, 1)} m</span> within 1 km, so {slope}.
      </p>
      {main && (
        <p className="note">
          A larger stream (about <span className="num">{acres(main.upslope_ha)} ac</span> draining){' '}
          {main.crosses_parcel
            ? 'runs through your land'
            : <>passes <span className="num">{num(main.distance_m)} m</span> {BEARING[main.bearing] ?? main.bearing} of your land</>}
          {' '}on this map; <span className="num">{main.agree}</span> of 3 maps put a line there.
        </p>
      )}

      <h3 style={{ fontSize: '0.875rem', margin: 'var(--space-md) 0 var(--space-xs)' }}>Suggested bore points</h3>
      {data.points.length === 0 && (
        <p className="note">
          No line on this map drains enough land (about <span className="num">12 ac</span>) inside or just beside your land to
          suggest a bore point.
        </p>
      )}
      <div className="rows">
        {data.points.map((p) => {
          const c = CONFIDENCE[p.confidence];
          const at = `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
          const href = navigateLink({ latitude: p.lat, longitude: p.lon });
          return (
            <div key={p.rank} style={{
              display: 'block', padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)',
              outline: p.rank === selected ? '2px solid var(--w-focus)' : undefined,
            }}>
              <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                <button type="button" className="avatarlg" aria-pressed={p.rank === selected}
                        aria-label={`Show bore point ${p.rank} on the map`}
                        onClick={() => onSelect(p.rank)}
                        style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.6875rem', cursor: 'pointer' }}>
                  {p.rank}
                </button>
                <span className="grow">
                  <span className="row tight">
                    <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>Bore point {p.rank}</span>
                    <StatusChip state={c.state}>{c.word}</StatusChip>
                  </span>
                  <span className="note" style={{ display: 'block' }}>{p.reason}.</span>
                  <KV rows={[
                    { k: 'Land draining here', v: <span className="num">{acres(p.upslope_ha)} ac</span> },
                    { k: 'Lines meet', v: p.junction ? 'Yes' : 'No' },
                    { k: 'Ground height', v: <span className="num">{num(p.elevation_m)} m</span> },
                  ]} />
                  <span className="note" style={{ display: 'block', margin: 'var(--space-xs) 0' }}>
                    <span className="num">{p.agree}</span> of 3 maps agree
                  </span>
                  <span className="row tight" style={{ alignItems: 'center' }}>
                    <span className="num">{at}</span>
                    <button type="button" className="btn sm" onClick={() => onCopy(at)}>Copy</button>
                    {href && (
                      <a className="link" href={href} target="_blank" rel="noreferrer">Navigate in Google Maps</a>
                    )}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ fontSize: '0.875rem', margin: 'var(--space-md) 0 var(--space-xs)' }}>What the other maps say</h3>
      {/* The current map's own row would repeat bore point 1. */}
      <KV as="dl" rows={data.summary.filter((s) => s.map !== data.map).map((s) => ({
        k: mapLabel(s.map),
        v: s.confidence && s.upslope_ha != null
          ? <>{CONFIDENCE[s.confidence].word} · drains <span className="num">{acres(s.upslope_ha)} ac</span> · <span className="num">{s.agree}</span> of 3 agree</>
          : 'No bore point',
      }))} />
    </>
  );
}

/** The Hydrogeology layer for one property: which map, what to draw, the
 *  chosen bore point, and the reading. One hook for both maps, so the layer
 *  and its card behave the same on a property's Maps tab and on Maps
 *  (docs/specs/2026-10-25-pattadar-maps.md). `on` asks the server — a first
 *  reading takes about half a minute; `paused` keeps the answer but stops
 *  saying it is loading (an edit tool is armed). */
export function useHydrogeology(recordId: string | undefined, on: boolean, paused = false) {
  const [source, setSource] = useState<FlowMap>('combined');
  const [showMain, setShowMain] = useState(true);
  const [showPinArea, setShowPinArea] = useState(true);
  const [selected, setSelected] = useState<number | null>(1);
  /** Lines draining less than this many acres are left off the map. */
  const [minAcres, setMinAcres] = useState(MIN_AC);
  const [byAgreement, setByAgreement] = useState(false);
  const [compare, setCompare] = useState(false);
  /** Only the boundary and the numbered bore points: no lines, no areas. */
  const [pinsOnly, setPinsOnly] = useState(false);

  const flow = useWaterFlow(recordId, source, on);
  const retry = useRetryWaterFlow(recordId, source);
  const data = flow.data?.status === 'ready' ? flow.data.data : null;
  // Pieces memoised apart, so choosing a pin redraws three pins and one area
  // and leaves the two thousand lines alone.
  const lineSet = useMemo(
    () => (data ? flowLines(data).filter((l) => l.ha * 2.4711 >= minAcres - 0.05) : null),
    [data, minAcres]);
  const otherMaps = FLOW_MAPS.map((m) => m.id).filter((m) => m !== source && m !== 'combined');
  const others = useWaterFlowOthers(recordId, otherMaps, on && compare);
  const othersData = others.map((q) => (q.data?.status === 'ready' ? q.data.data : null));
  const othersKey = othersData.map((d) => (d ? d.map : '-')).join(',');
  const otherLines = useMemo(
    () => (compare ? othersData.flatMap((d) => (d ? flowLines(d).filter((l) => l.ha * 2.4711 >= minAcres - 0.05) : [])) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- othersKey stands for othersData
    [compare, othersKey, minAcres]);
  const mainArea = useMemo(
    () => (data && showMain ? flowArea(data.main_stream?.catchment) : null), [data, showMain]);
  const pins = useMemo(
    () => data?.points.map(({ rank, lat, lon, confidence }) => ({ rank, lat, lon, confidence })) ?? [],
    [data]);
  const chosenArea = useMemo(
    () => (data && showPinArea
      ? flowArea(data.points.find((p) => p.rank === selected)?.catchment) : null),
    [data, selected, showPinArea]);
  /** What the layer is waiting for, said on the map and in the card, so an
   *  empty or stale map is never mistaken for the answer. '' when settled. */
  const comparing = compare && others.some((q) => q.isLoading || q.data?.status === 'computing');
  const loadingText = !on || paused ? ''
    : flow.isLoading || flow.data?.status === 'computing'
      ? 'Preparing the hydrogeology map… It reads the slope of the land, about half a minute the first time.'
      : flow.isPlaceholderData
        ? `Loading the ${flowMapName(source)} lines…`
        : comparing ? 'Loading the other maps\' lines…' : '';
  const layer = useMemo((): WaterFlowLayer | null => (lineSet ? {
    lines: pinsOnly ? [] : lineSet,
    mainArea: pinsOnly ? null : mainArea,
    pinArea: pinsOnly ? null : chosenArea,
    pins,
    selected, byAgreement, others: pinsOnly ? null : otherLines,
    label: flowMapName(data?.map),
  } : null), [lineSet, mainArea, chosenArea, pins, selected, byAgreement, otherLines, data?.map, pinsOnly]);

  return {
    layer, loadingText, pinsOnly, setSelected,
    /** Everything WaterFlowCard takes. */
    card: {
      flow: flow.data, loading: flow.isLoading, error: flow.error,
      stale: flow.isPlaceholderData || (flow.isFetching && flow.data?.status !== 'computing'),
      source, onSource: setSource,
      showMain, onShowMain: setShowMain,
      showPinArea, onShowPinArea: setShowPinArea,
      selected, onSelect: setSelected,
      minAcres, onMinAcres: setMinAcres,
      byAgreement, onByAgreement: setByAgreement,
      compare, onCompare: setCompare,
      pinsOnly, onPinsOnly: setPinsOnly,
      loadingText,
      onRetry: retry,
    },
  };
}

/** The Hydrogeology layer's key, on the map. On a phone it folds behind one
 *  "Map key" button (as the property map's tools do), so it is reachable at
 *  every width without covering the parcel. `boundary` names the gold ring
 *  where the map draws the property's own boundary in it. */
export function FlowKey({ flow, boundary = false }: { flow: WaterFlowLayer; boundary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm w-flow-keybtn" aria-expanded={open}
              aria-controls="w-flow-key" onClick={() => setOpen((o) => !o)}>
        Map key
      </button>
      <div id="w-flow-key" className={`w-flow-legend${open ? '' : ' folded'}`} role="group" aria-label="Map key">
        {flow.lines.length > 0 && (
          <span><i style={{ background: INK.line, height: 3 }} />Drainage lines, {flow.label}</span>
        )}
        {flow.lines.length > 0 && flow.byAgreement && (
          <>
            <span><i style={{ background: INK.line, height: 3 }} />All 3 maps put a line there</span>
            <span><i style={{ background: INK.line, height: 3, opacity: 0.7 }} />2 of 3 maps</span>
            <span>
              <i style={{ height: 3, opacity: 0.5,
                          background: `repeating-linear-gradient(90deg, ${INK.line} 0 4px, transparent 4px 9px)` }} />
              Only this map
            </span>
          </>
        )}
        {boundary && <span><i className="ring" style={{ borderColor: INK.ring }} />Your boundary</span>}
        {flow.mainArea && <span><i className="ring" style={{ borderColor: INK.main }} />Area draining to the main stream</span>}
        {flow.pinArea && <span><i className="ring" style={{ borderColor: INK.pinArea }} />Area draining to the chosen bore point</span>}
        {flow.others && <span><i style={{ background: INK.other, height: 1 }} />The other maps' lines</span>}
        {flow.lines.length > 0 && (
          <span><i style={{ background: INK.line, height: 1 }} />thin to thick: more land drains</span>
        )}
        <span>
          <b style={{ background: INK.high }} /><b style={{ background: INK.medium }} /><b style={{ background: INK.low }} />
          Bore points: high, medium, low confidence
        </span>
      </div>
    </>
  );
}
