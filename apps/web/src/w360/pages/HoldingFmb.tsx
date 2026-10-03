/** The holding's surveys, side by side on one map.
 *
 *  This is the tab the whole feature was asked for: two thirty-acre parcels that
 *  are one piece of ground on the ground, drawn together instead of on two
 *  screens. What it is careful never to become is a merged FMB.
 *
 *  Three rules, and they are the product:
 *
 *  1. **Every outline is drawn as its own record filed it.** Nothing is unioned.
 *     The boundary BETWEEN two adjoining members stays on the map, because it is
 *     a real boundary between two real survey numbers — one continuous shape
 *     around the pair would be a fourth boundary nobody surveyed, and the moment
 *     it is drawn somebody will print it and take it to an office.
 *  2. **Every claim about how they lie is measured and worded as a measurement.**
 *     The server compares the saved outlines in metres and says "these run
 *     together for about 348 m" or "these are 40 m apart" — never "these are
 *     adjacent" as a finding about the land or the title.
 *  3. **What cannot be drawn is named.** A member whose sheet is a photograph or
 *     a PDF with no corner table has no coordinates; it is listed with its sheet
 *     to open rather than left as a silent gap in the picture.
 *
 *  The map keeps `PortfolioCanvas`'s one-map, N-record fitting and selection,
 *  but uses its surveyed appearance: the same orange `w-ring`, corner letters,
 *  and side-length labels as a record's own Location map. Every outline remains
 *  independent; only their viewport is shared.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined';
import FullscreenExitOutlined from '@mui/icons-material/FullscreenExitOutlined';
import FullscreenOutlined from '@mui/icons-material/FullscreenOutlined';

import { LENGTH_FT } from '@pattadar/core';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import { useHoldingFmb, useDeleteJointFmb } from '../api';
import type { HoldingJointSheet, HoldingRelation, HoldingSurveyShape } from '../api';
import { BoundaryMeasurementsCard } from '../BoundaryMeasurementsCard';
import {
  Card, Empty, Failed, KV, Menu, MultiSelect, Pill, num, pairs, plural, useFullscreen,
} from '../ui';
import { SkPortfolioMap } from '../skeletons';
import { PortfolioCanvas } from '../PortfolioCanvasLazy';
import type { PortfolioCanvasHandle, PortfolioPin } from '../PortfolioCanvasLazy';
import { hasBoundaryRing, isLocated } from '../portfolioGeo';
import { useHoldingCtx } from './Holding';
import { JointFmbDialog, JointOutlinesDialog } from './HoldingActions';
import type { GeoPdfReading } from '@pattadar/core';
import { fetchFileBlob } from '../../pages/documents/storage';
import { readGeoPdfFile } from '../geoPdfFile';
import { ConfirmDialog } from './PropertyActions';

/** How a relation reads as a capsule. `disputed` is the token for "the sources
 *  disagree", which is exactly what an overlap is — not a verdict on the land. */
const RELATION_PILL: Record<string, { kind: string; word: string }> = {
  adjoining: { kind: 'owned', word: 'Side by side' },
  overlapping: { kind: 'disputed', word: 'Overlapping' },
  corner: { kind: 'for_sale', word: 'Corner only' },
  apart: { kind: 'archived', word: 'Apart' },
};

export function HoldingFmbTab() {
  const holding = useHoldingCtx();
  const { data, isLoading, error } = useHoldingFmb(holding.id);
  const [satellite, setSatellite] = useState(true);
  const [lengthUnit, setLengthUnit] = useState<'m' | 'ft'>('m');
  const [picked, setPicked] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [addingJoint, setAddingJoint] = useState(false);
  const mapRef = useRef<PortfolioCanvasHandle>(null);
  // The stage's own full screen. When its size changes, going in or coming back
  // out with Esc, the view is framed again for the box it now has: the picked
  // record if there is one, otherwise everything on the map.
  const stage = useFullscreen<HTMLDivElement>();
  const framedFull = useRef(false);
  useEffect(() => {
    if (framedFull.current === stage.on) return undefined;
    framedFull.current = stage.on;
    const frame = requestAnimationFrame(() => {
      if (picked && mapRef.current?.goTo(picked)) return;
      mapRef.current?.fit();
    });
    return () => cancelAnimationFrame(frame);
    // Only the size change frames the view; picking a record zooms on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.on]);

  const pins: PortfolioPin[] = useMemo(() => (data?.shapes ?? [])
    .map((s) => ({
      id: s.recordId,
      title: s.title,
      where: s.extentLabel,
      status: 'owned',
      ring: pairs(s.ring),
      sideLabels: s.sideLengths.map((metres) => lengthUnit === 'm'
        ? `${Math.round(metres).toLocaleString('en-IN')} m`
        : `${Math.round(metres * LENGTH_FT.m).toLocaleString('en-IN')} ft`),
      lat: s.lat,
      lon: s.lon,
    }))
    .filter((p) => isLocated(p)), [data?.shapes, lengthUnit]);

  const drawnIds = useMemo(
    () => new Set(pins.filter((p) => hasBoundaryRing(p.ring)).map((p) => p.id)), [pins]);

  /** The pairs worth a panel: land that touches, and sources that disagree. A
   *  measured gap is reported in the caption instead — see below. */
  const meeting = useMemo(() => (data?.relations ?? [])
    .filter((r) => r.relation !== 'apart'), [data?.relations]);

  /** Which surveys are on the map. Every one of them, until the reader says
   *  otherwise — a holding's map opens showing the whole holding.
   *
   *  Keyed off the ids rather than initialised once: a membership change or a
   *  boundary saved on a member arrives as a new answer, and a selection held
   *  from the previous one would silently drop the new survey. */
  const drawnKey = [...drawnIds].sort().join(',');
  const [sel, setSel] = useState<{ key: string; ids: ReadonlySet<string> } | null>(null);
  // The selection is stamped with the set it was made against, so it is simply
  // not used once that set changes — no effect, and no setState during render.
  const shown = sel && sel.key === drawnKey ? sel.ids : drawnIds;
  const toggleShown = (id: string) => {
    const next = new Set(shown);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (next.size !== 1) setLengthUnit('m');
    setSel({ key: drawnKey, ids: next });
  };



  if (isLoading) return <SkPortfolioMap label="Loading the combined map" />;
  if (!data) return <Failed what="The combined map" error={error} boxed h="26rem" />;

  const byRecord = new Map(data.shapes.map((s) => [s.recordId, s]));
  // The records the rail lists: the drawn ones the dropdown has ticked. The rail
  // is a measurements panel now, not a chooser, so a boundary off the map is
  // off the rail too.
  const railShapes = data.shapes.filter(
    (s) => drawnIds.has(s.recordId) && shown.has(s.recordId));
  const missing = data.shapes.filter((s) => !drawnIds.has(s.recordId));

  // One sheet covering several survey numbers is uploaded here, once, and
  // filed as a flagged copy on each record it covers. The single place this tab
  // offers it is the section header's actions.
  const addJoint = (
    <button type="button" className="btn" onClick={() => setAddingJoint(true)}>
      <UploadFileOutlined sx={{ fontSize: 16 }} /> Add joint FMB
    </button>
  );
  const jointDialog = addingJoint && (
    <JointFmbDialog holding={holding} onClose={() => setAddingJoint(false)} />
  );

  if (data.drawnCount === 0) {
    return (
      <>
        <header className="sechead">
          <div className="grow">
            <h2>Boundaries side by side</h2>
            <p className="note" style={{ margin: '0.25rem 0 0' }}>{data.caption}</p>
          </div>
          <div className="actions">{addJoint}</div>
        </header>
        {/* A stack, so the empty state and the cards under it keep their
            spacing instead of meeting border to border. */}
        <div className="stack">
          <Empty boxed h="22rem" icon="parcel" title="No boundaries saved yet">
            None of the {plural(holding.memberCount, 'record')} in this holding has a
            saved boundary.
          </Empty>
          <JointSheets sheets={data.jointSheets} />
          <MissingList shapes={missing} />
        </div>
        {jointDialog}
      </>
    );
  }

  return (
    <>
      <header className="sechead">
        <div className="grow">
          <h2>Boundaries side by side</h2>
          <p className="note" style={{ margin: '0.25rem 0 0' }}>{data.caption}</p>
        </div>
        {/* Which boundaries are on the map, chosen where a section's actions
            live — the same place a record's own screen puts "Order a service".
            A dropdown rather than a rail of checkboxes: it does not compete with
            the measurements beside the map, and it reads as an action on the
            view. It counts BOUNDARIES, not records: a record with nothing to
            draw is not on the list, and "All 2 records" under a "Records 3" tab
            would read as a record gone missing. */}
        <div className="actions">
          <MultiSelect
            label="Which boundaries to show"
            summary={shown.size === drawnIds.size
              ? (drawnIds.size === 1 ? '1 boundary' : `All ${drawnIds.size} boundaries`)
              : `${shown.size} of ${plural(drawnIds.size, 'boundary', 'boundaries')}`}
            options={data.shapes
              .filter((s) => drawnIds.has(s.recordId))
              .map((s) => ({ id: s.recordId, label: s.title }))}
            selected={shown}
            onToggle={toggleShown}
            onAll={(on) => {
              setLengthUnit('m');
              setSel({ key: drawnKey, ids: on ? new Set(drawnIds) : new Set() });
            }}
          />
          {addJoint}
        </div>
      </header>

      {/* ONE map, with every boundary in it.
          Land that is miles apart is small at a zoom that fits both, so the
          list in the rail beside the map zooms to a record on click, and the
          rail carries the corners, the lengths and the areas that do not depend
          on zoom at all. That is the single-record view's substance, holding:
          one picture of the holding, and every record's own numbers. */}
      <div className="pf-body measured">
          <div className="plot live pf-stage" ref={stage.ref}>
            <PortfolioCanvas
              ref={mapRef}
              appearance="surveyed"
              label="Map of this holding"
              // Only the surveys that are ticked, plus any member that has a pin
              // and no outline: those carry no tick because there is nothing to
              // draw or hide, and leaving them on keeps the holding's context.
              records={pins.filter((p) => shown.has(p.id) || !drawnIds.has(p.id))}
              satellite={satellite}
              selected={picked}
              hovered={lit}
              onHover={setLit}
              onSelect={setPicked}
              // A second click on an outline zooms to it, as a row in the rail
              // does. "Its boundary", in the panel the first click opens, is the
              // way to the record's own map: the second click used to leave the
              // tab for it, unannounced, and drop the choice of boundaries.
              onOpen={(id) => { mapRef.current?.goTo(id); }}
            />
            <div className="maptools">
              <span className="row tight mapchips">
                <button type="button" className="chip" aria-pressed={satellite}
                        title={satellite ? 'Turn the imagery off' : 'Turn the imagery on'}
                        onClick={() => setSatellite((on) => !on)}>
                  Satellite
                </button>
                {/* The record map's Recentre glyph. The crosshair this chip used
                    to wear means "where this device is" there
                    (RecordBoundary.tsx, the zoom stack). */}
                <button type="button" className="chip" title="Frame the whole holding again"
                        onClick={() => { setPicked(null); mapRef.current?.fit(); }}>
                  <FitScreenOutlined sx={{ fontSize: 14 }} /> Fit all
                </button>
                {/* Imagery and corner letters are read closely, and a phone's map
                    is half a window tall: the same full screen as the photo
                    stage, and Esc brings the page back. The label says what a
                    press will do, so it is not also a pressed state. */}
                {stage.supported && (
                  <button type="button" className="chip" onClick={stage.toggle}
                          title={stage.on ? 'Back to the page (Esc)' : 'Fill the screen with the map'}>
                    {stage.on
                      ? <FullscreenExitOutlined sx={{ fontSize: 14 }} />
                      : <FullscreenOutlined sx={{ fontSize: 14 }} />}
                    {stage.on ? 'Exit full screen' : 'View full screen'}
                  </button>
                )}
              </span>
            </div>

            {picked && byRecord.get(picked) && (
              <div className="pf-pick" onClick={(e) => e.stopPropagation()}>
                <div>
                  <strong>{byRecord.get(picked)!.title}</strong>
                  {/* Named, because the rail beside it gives the same record's
                      MEASURED area and the two are rarely equal. */}
                  <span className="note">On record {byRecord.get(picked)!.extentLabel}</span>
                </div>
                <Link className="btn sm" to={`/app/records/${picked}`}>Open record</Link>
                <Link className="btn sm" to={`/app/records/${picked}/map`}>Its boundary</Link>
              </div>
            )}

            {/* Attribution only. The claim about each outline being its own
                record's is already the caption above the map. */}
            <span className="cap">
              {satellite ? 'Esri World Imagery' : 'OpenStreetMap'}
            </span>
          </div>

          {/* One boundary shown: the record's own Measurements panel, verbatim
              — the same "Within X%" band, the same Side / Length / Direction
              table. More than one: one AGGREGATE panel — how many are shown,
              then Sides / Around, each summed / Measured / On record — because a
              stack of full side tables is a wall nobody reads, and the sum is
              the fact the holding adds. Which boundaries are shown is
              chosen from the header dropdown, not from here. */}
          <aside className={`pf-results pf-measures${railShapes.length === 1 ? ' single' : ''}`}
                 aria-label="Measurements">
            {railShapes.length === 0 && (
              <p className="note" style={{ padding: 'var(--space-sm)', margin: 0 }}>
                No boundary is showing.
              </p>
            )}
            {railShapes.length === 1 && (
              <SurveyMeasure
                shape={railShapes[0]}
                lengthUnit={lengthUnit}
                onLengthUnit={setLengthUnit}
              />
            )}
            {railShapes.length > 1 && (
              <AggregateMeasure
                shapes={railShapes}
                picked={picked}
                onPick={(id) => {
                  setPicked(id);
                  mapRef.current?.goTo(id);
                  // Stacked, at 1200px and below, the rail sits under the map,
                  // and a zoom nobody can see answers nothing. Beside the rail
                  // the map is normally in view already, and nothing moves.
                  stage.ref.current?.scrollIntoView({ block: 'nearest' });
                }}
                onHover={setLit}
              />
            )}
          </aside>
      </div>

      {/* Only the pairs that MEET. A card whose one row read "About 9.5 km
          apart · Apart" was a panel, a heading and a capsule to repeat what the
          caption above the map already says — that the outlines are in separate
          pieces. A shared edge, a corner, or an overlap is different: it is a
          fact about where the land actually touches, and an overlap is something
          somebody has to act on. Those get the panel; a gap gets a sentence.
          The cards under the map are one stack, so they keep their spacing
          instead of meeting border to border. */}
      {(meeting.length > 0 || data.jointSheets.length > 0 || missing.length > 0) && (
        <div className="stack pf-after">
          {meeting.length > 0 && (
            <Card title="Shared edges">
              <div className="rows">
                {meeting.map((r) => <RelationRow key={`${r.fromRecordId}-${r.toRecordId}`} r={r} />)}
              </div>
            </Card>
          )}
          <JointSheets sheets={data.jointSheets} />
          <MissingList shapes={missing} />
        </div>
      )}
      {jointDialog}
    </>
  );
}

/** One selected survey uses the exact Measurements card from Record Location.
 * The owner explicitly asked to omit only its generic "Approximate measurements"
 * sentence here; structure, formatting, comparison copy, unit switch, and table
 * all come from the shared component. */
function SurveyMeasure({ shape: s, lengthUnit, onLengthUnit }: {
  shape: HoldingSurveyShape;
  lengthUnit: 'm' | 'ft';
  onLengthUnit: (unit: 'm' | 'ft') => void;
}) {
  const diff = s.measuredAc - s.recordedAc;
  const pct = s.comparable && s.recordedAc > 0
    ? (diff / s.recordedAc) * 100 : null;
  const comparison = pct === null ? null : {
    diff,
    pct,
    band: (Math.abs(pct) <= 5 ? 'close'
      : Math.abs(pct) <= 25 ? 'check' : 'wrong') as 'close' | 'check' | 'wrong',
  };
  const sides = s.sideLengths.map((metres, index) => ({
    from: index + 1,
    to: ((index + 1) % s.sideLengths.length) + 1,
    metres,
    bearing: s.sideBearings[index] ?? 0,
  }));

  return (
    <BoundaryMeasurementsCard
      sides={sides}
      perimeterM={s.perimeterM}
      areaAc={s.measuredAc}
      onRecord={s.extentLabel}
      lengthUnit={lengthUnit}
      onLengthUnit={onLengthUnit}
      comparison={comparison}
      showApproximation={false}
    />
  );
}

/** More than one boundary shown: how many, one KV of summed figures — Sides /
 *  Around, each summed / Measured / On record — then the records themselves as
 *  a list to zoom to. The single panel says "Area", in acres and guntas, for
 *  one outline; this says "Measured", in acres, for a sum of several.
 *
 *  A stack of full Side / Length / Direction tables was a wall nobody reads; the
 *  sum is the fact the holding adds over opening each record. Two things
 *  are said honestly here: "On record" is shown only when every selected record
 *  is measured in acres (a flat's square feet cannot be added to an acreage),
 *  and there is no summed area BAND — a per-record outline can be 0.6% out and
 *  the sum still land on the register, so a combined percentage would hide which
 *  record is wrong. That is what each record's own panel is for. */
function AggregateMeasure({ shapes, picked, onPick, onHover }: {
  shapes: HoldingSurveyShape[];
  picked: string | null;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const sides = shapes.reduce((n, s) => n + s.corners, 0);
  const around = shapes.reduce((m, s) => m + s.perimeterM, 0);
  const measured = shapes.reduce((a, s) => a + s.measuredAc, 0);
  const comparable = shapes.every((s) => s.comparable);
  const recorded = shapes.reduce((a, s) => a + s.recordedAc, 0);
  return (
    <section className="pf-result">
      <p className="eyebrow" style={{ margin: '0 0 var(--space-sm)' }}>
        {plural(shapes.length, 'boundary', 'boundaries')} shown
      </p>
      <KV rows={[
        { k: 'Sides', v: String(sides) },
        // Not "total around": adding two perimeters counts a shared wall twice,
        // so it is the sum of each outline's own way round and labelled as that.
        { k: 'Around, each summed', v: `${num(around)} m` },
        { k: 'Measured', v: `${num(measured, 2)} ac` },
        ...(comparable ? [{ k: 'On record', v: `${num(recorded, 2)} ac` }] : []),
      ]} />
      <div className="rows" style={{ marginTop: 'var(--space-sm)' }}>
        {shapes.map((s) => (
          <button type="button" key={s.recordId}
                  className={`pf-agg-row${picked === s.recordId ? ' on' : ''}`}
                  aria-pressed={picked === s.recordId}
                  onMouseEnter={() => onHover(s.recordId)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onPick(s.recordId)}>
            <span className="grow">{s.title}</span>
            {/* Named: the pick panel on the map gives the same record's extent
                ON RECORD, and the two figures are rarely equal. */}
            <span className="num note">
              Measured {num(s.measuredAc, 2)} ac · {s.corners} sides
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RelationRow({ r }: { r: HoldingRelation }) {
  const pill = RELATION_PILL[r.relation] ?? { kind: 'archived', word: r.relation };
  return (
    <div className="row">
      <span className="grow">
        <strong>{r.fromTitle} &amp; {r.toTitle}</strong>
        <small className="note" style={{ display: 'block' }}>{r.detail}</small>
      </span>
      {r.runM > 0 && <span className="num note">{num(r.runM)} m together</span>}
      <Pill kind={pill.kind}>{pill.word}</Pill>
    </div>
  );
}

/** The members with nothing to draw, named rather than absent.
 *
 *  A scanned or photographed FMB carries a picture, not coordinates — the record
 *  screen says the same thing in the same words. Nothing here tries to place it
 *  by eye: a sheet stretched onto imagery looks convincing and is wrong. */
function MissingList({ shapes }: { shapes: HoldingSurveyShape[] }) {
  if (shapes.length === 0) return null;
  return (
    <Card title="No boundary yet">
      <div className="rows">
        {shapes.map((s) => (
          <div className="row" key={s.recordId}>
            <span className="grow">
              <strong>{s.title}</strong>
              <small className="note" style={{ display: 'block' }}>
                {s.note || 'No outline on file.'}
              </small>
            </span>
            {s.sheetJoint && <Pill kind="managed">Joint FMB</Pill>}
            {s.sheetId && (
              <Link className="btn sm" to={`/app/papers/${s.sheetId}`}>Open sheet</Link>
            )}
            <Link className="btn sm" to={`/app/records/${s.recordId}/map`}>
              Give it a boundary
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The joint FMBs filed across this holding: one row per sheet, naming every
 *  record it was copied onto. Removing it here unfiles every copy; a single
 *  copy can still be removed from one record's own Documents.
 *
 *  The row ranks its actions: Open sheet outlined, Place outlines as a text
 *  button, and Remove behind the row's ⋮ in the danger tone. Remove unfiles
 *  every copy, so it is not drawn as a peer of the two actions that change
 *  nothing, and it still asks first. */
function JointSheets({ sheets }: { sheets: HoldingJointSheet[] }) {
  const holding = useHoldingCtx();
  const del = useDeleteJointFmb(false);
  const [removing, setRemoving] = useState<HoldingJointSheet | null>(null);
  const [err, setErr] = useState('');
  const [reading, setReading] = useState<string | null>(null);
  const [readErr, setReadErr] = useState<{ id: string; msg: string } | null>(null);
  const [outlines, setOutlines] = useState<GeoPdfReading | null>(null);
  if (sheets.length === 0) return null;

  /** Open the stored sheet in the browser and read its georeference. Free
   *  and local — the file is not sent to the document reader for this. */
  const place = async (s: HoldingJointSheet) => {
    setReadErr(null);
    setReading(s.id);
    try {
      const geo = await readGeoPdfFile(await fetchFileBlob(s.fileRef));
      if (geo) setOutlines(geo);
      else {
        setReadErr({ id: s.id, msg: 'No georeferenced survey lines were found in this sheet. '
          + 'Give each record its boundary on its own Location tab.' });
      }
    } catch {
      setReadErr({ id: s.id, msg: 'The sheet could not be opened. Try again.' });
    } finally {
      setReading(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setErr('');
    try {
      const ok = (await del.mutateAsync({ jointId: removing.id })).web.deleteJointFmb;
      if (!ok) {
        setErr('That joint FMB could not be removed. It may already be gone. Reload the page.');
        return;
      }
      setRemoving(null);
    } catch {
      setErr('That did not go through. Nothing was removed.');
    }
  };

  return (
    <Card title="Joint FMB">
      <div className="rows">
        {sheets.map((s) => (
          <div className="row" key={s.id}>
            <span className="grow">
              <strong>{s.name}</strong>
              <small className="note" style={{ display: 'block' }}>
                Filed on {s.recordTitles.join(', ')}
              </small>
              {readErr?.id === s.id && (
                <small className="note" role="alert"
                       style={{ display: 'block', color: 'var(--w-danger)' }}>
                  {readErr.msg}
                </small>
              )}
            </span>
            <Pill kind="managed">Joint FMB</Pill>
            {s.paperIds[0] && (
              <Link className="btn sm" to={`/app/papers/${s.paperIds[0]}`}>Open sheet</Link>
            )}
            {s.fileRef && (
              <button type="button" className="linkbtn" disabled={reading !== null}
                      onClick={() => void place(s)}>
                {reading === s.id ? 'Reading…' : 'Place outlines'}
              </button>
            )}
            <Menu label={`More for ${s.name}`} header={s.name} items={[{
              label: 'Remove',
              danger: true,
              onClick: () => { setErr(''); setRemoving(s); },
            }]} />
          </div>
        ))}
      </div>
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          body={`It comes off all ${removing.recordIds.length} records it was filed on. `
            + 'The uploaded file itself is kept.'}
          actionLabel="Remove"
          danger
          busy={del.isPending}
          error={err}
          onConfirm={() => void remove()}
          onClose={() => setRemoving(null)}
        />
      )}
      {outlines && (
        <JointOutlinesDialog holding={holding} reading={outlines}
                             onClose={() => setOutlines(null)} />
      )}
    </Card>
  );
}

export default HoldingFmbTab;
