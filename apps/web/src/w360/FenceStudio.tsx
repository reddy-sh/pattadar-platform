/**
 * The fence calculator — a tool that takes over the map, not a card beside it.
 *
 * Fencing is a job you do to a SHAPE, and the questions it asks are about the
 * ground: which sides am I fencing, where does the gate go, how far apart do
 * the posts stand. Answering those in a 24-rem column next to a village map
 * meant the thing being priced was never actually in view. Here the boundary
 * fills the screen with its corners lettered and its sides dimensioned, the
 * panel sits on whichever hand suits you, and every number in the estimate can
 * be pointed at on the map.
 *
 * Three steps, in the order anyone would ask them: what is being fenced, what
 * it is being fenced with, and what that comes to. They are all on one panel
 * rather than behind Next buttons — a wizard hides the effect of the answer
 * you just gave, and the whole value here is watching the total move.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined';
import { cornerLabel, fencePlan, ringSides } from '@pattadar/core';

import { useCreateRequest, useOrders } from './api';
import { openSameJob } from './orderFlow';
import { MapCanvas } from './MapCanvasLazy';
import { inrFull, num } from './ui';

/** The fence, drawn to scale for the page rather than the screen.
 *
 *  A satellite photograph is the wrong thing to hand a supplier: it prints as
 *  a grey rectangle and says nothing about lengths. A line drawing with its
 *  corners lettered and its sides dimensioned is what a fencing quote has
 *  always looked like, and it is the same shape the map is showing.
 *
 *  Projected onto a local metre plane — at the size of one plot the curvature
 *  of the earth is far below the width of the stroke. */
function FencePlan({ ring, dropped }: {
  ring: Array<[number, number]>; dropped: Set<number>;
}) {
  if (ring.length < 3) return null;
  const lat0 = (ring.reduce((t, p) => t + p[0], 0) / ring.length) * (Math.PI / 180);
  const kx = 111320 * Math.cos(lat0);
  const pts = ring.map(([lat, lon]) => [lon * kx, -lat * 110540] as [number, number]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1;
  const h = Math.max(...ys) - minY || 1;
  const pad = Math.max(w, h) * 0.14;
  const at = (p: [number, number]) => [p[0] - minX, p[1] - minY] as [number, number];

  return (
    <svg className="fs-plan"
         viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
         role="img" aria-label="The fence, drawn to scale">
      {pts.map((p, i) => {
        const a = at(p);
        const b = at(pts[(i + 1) % pts.length]);
        return (
          <line key={`s${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                className={dropped.has(i) ? 'skip' : ''}
                strokeWidth={Math.max(w, h) / 160} />
        );
      })}
      {pts.map((p, i) => {
        const a = at(p);
        const b = at(pts[(i + 1) % pts.length]);
        const size = Math.max(w, h) / 26;
        return (
          <g key={`l${i}`}>
            <text x={a[0]} y={a[1] - size * 0.4} fontSize={size} textAnchor="middle">
              {cornerLabel(i)}
            </text>
            {!dropped.has(i) && (
              <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2} fontSize={size * 0.72}
                    textAnchor="middle" className="len">
                {sideMetres(ring, i).toFixed(0)} m
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** One side's length, straight off the ring — the sheet must not depend on the
 *  panel having computed anything. */
function sideMetres(ring: Array<[number, number]>, i: number): number {
  const all = ringSides(ring);
  return all[i]?.metres ?? 0;
}

export interface FenceStudioProps {
  /** What is being fenced, in words: "Plot 839". */
  title: string;
  subtitle?: string;
  ring: Array<[number, number]>;
  /** An open run has a corner at each end; a plot closes on itself. */
  closed?: boolean;
  /** The record this plot IS, when it is one of the account's. Without it the
   *  estimate can be printed and nothing else — there is nothing to raise the
   *  work against, and inventing a record to hold it would be worse. */
  recordId?: string;
  recordTitle?: string;
  onClose: () => void;
}

/** The rates and the build, kept between visits. A post costs what it costs
 *  wherever you buy it, and retyping four figures every time you want to price
 *  a different plot is the kind of friction that stops a tool being used. */
const KEPT = 'w360.fence';
type Kept = Record<string, string>;

function remembered(): Kept {
  try {
    return JSON.parse(localStorage.getItem(KEPT) || '{}') as Kept;
  } catch {
    return {};
  }
}

/** Gate posts stand in pairs and take no wire between them. */
const GATE_POSTS = 2;

export function FenceStudio({
  title, subtitle, ring, closed = true, recordId, recordTitle, onClose,
}: FenceStudioProps) {
  const nav = useNavigate();
  const ask = useCreateRequest();
  const openOrders = useOrders(recordId || '');
  const duplicate = openSameJob(openOrders.data, 'fencing');
  const [asked, setAsked] = useState('');
  const was = remembered();
  const [panel, setPanel] = useState<'left' | 'right'>('right');
  /** Stamped once, when the calculator opens: a sheet somebody prints is dated
   *  the day they printed it, not the millisecond they last touched a field. */
  const [stamp] = useState(() => new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }));
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const [spacing, setSpacing] = useState(was.spacing ?? '3');
  const [strands, setStrands] = useState(was.strands ?? '4');
  const [gates, setGates] = useState(was.gates ?? '1');
  const [gateWidth, setGateWidth] = useState(was.gateWidth ?? '3.6');
  const [roll, setRoll] = useState(was.roll ?? '500');
  const [postRate, setPostRate] = useState(was.postRate ?? '');
  const [wireRate, setWireRate] = useState(was.wireRate ?? '');
  const [gateRate, setGateRate] = useState(was.gateRate ?? '');

  useEffect(() => {
    try {
      localStorage.setItem(KEPT, JSON.stringify({
        spacing, strands, gates, gateWidth, roll, postRate, wireRate, gateRate,
      }));
    } catch {
      // A browser that refuses storage still gets a working calculator.
    }
  }, [spacing, strands, gates, gateWidth, roll, postRate, wireRate, gateRate]);

  const sides = useMemo(() => ringSides(ring).map((s) => s.metres), [ring]);
  const kept = useMemo(
    () => sides.map((m, i) => (dropped.has(i) ? 0 : m)).filter((m) => m > 0),
    [sides, dropped],
  );

  const gateCount = Math.max(0, Math.round(Number(gates) || 0));
  const openings = gateCount * (Number(gateWidth) || 0);
  const strandCount = Math.max(0, Number(strands) || 0);
  const rollLength = Number(roll) || 0;

  const plan = useMemo(() => fencePlan(kept, {
    spacing: Number(spacing) || 0,
    strands: strandCount,
    // Dropping a side opens the run: what is left is a set of lines with two
    // ends each, not a loop. Only a boundary with every side kept still closes.
    closed: closed && dropped.size === 0,
    costPerPost: Number(postRate) || 0,
    costPerMetre: Number(wireRate) || 0,
  }), [kept, spacing, strandCount, closed, dropped, postRate, wireRate]);

  // A gate is a hole in the fence: no wire across it, and a post either side.
  const wireRun = Math.max(0, plan.perimeter - openings);
  const wire = wireRun * strandCount;
  const gatePosts = gateCount * GATE_POSTS;
  const posts = plan.posts + gatePosts;
  const rolls = rollLength > 0 ? Math.ceil(wire / rollLength) : 0;

  const postCost = posts * (Number(postRate) || 0);
  const wireCost = wire * (Number(wireRate) || 0);
  const gateCost = gateCount * (Number(gateRate) || 0);
  const total = postCost + wireCost + gateCost;

  /** The estimate, as a sentence somebody can act on. A work request carries
   *  its message to Services and to whoever it is assigned to, so the message
   *  has to hold the whole bill — not "fencing needed". */
  const raise = async () => {
    if (!recordId || duplicate || openOrders.error || !openOrders.data) return;
    setAsked('');
    const lines = [
      `Fence ${title}${subtitle ? ` (${subtitle})` : ''} — ${num(plan.perimeter, 1)} m`
        + ` around ${plural(kept.length, 'side')}.`,
      `${num(posts)} posts: ${num(plan.cornerPosts)} at the corners,`
        + ` ${num(plan.linePosts)} along the sides at ${spacing} m at most`
        + (gatePosts ? `, ${num(gatePosts)} at the gates` : '') + '.',
      `${num(wire, 0)} m of wire — ${num(wireRun, 1)} m of fence × ${strands} strands`
        + (rolls ? `, ${num(rolls)} rolls of ${roll} m` : '') + '.',
      gateCount ? `${plural(gateCount, 'gate')}, ${gateWidth} m wide.` : '',
      total > 0 ? `Materials come to ${inrFull(total)} at the rates on file`
        + ` (${inrFull(Number(postRate) || 0)} a post,`
        + ` ${inrFull(Number(wireRate) || 0)} a metre of wire`
        + (gateCost ? `, ${inrFull(Number(gateRate) || 0)} a gate` : '') + ').' : '',
      'Materials only — labour, corner bracing and cartage are not in it.',
    ].filter(Boolean);
    try {
      const res = await ask.mutateAsync({
        recordId, kind: 'fencing', message: lines.join('\n'),
        requester: 'the owner', shared: '',
      });
      if (!res.web.createRequest) {
        setAsked('That request was not accepted.');
        return;
      }
      nav(`/app/records/${recordId}/services`);
    } catch (e) {
      setAsked(e instanceof Error ? e.message : 'That request could not be raised.');
    }
  };

  const toggle = (i: number) => {
    setActive(i);
    setDropped((was) => {
      const next = new Set(was);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  // `plot live` is the class pair every map panel in this app wears: MapCanvas
  // renders a bare `.map` div and relies on that ancestor for its size. Without
  // it Leaflet measures 0×0, computes zoom 0 and draws nothing at all.
  const map = (
    <div className="plot live fs-map">
      <MapCanvas
        basemap="satellite"
        ring={ring}
        sideLabels={sides.map((m) => `${m.toFixed(1)} m`)}
        activeSide={active}
        onSideClick={toggle}
        title={title}
      />
    </div>
  );

  const steps = (
    <div className="fs-panel">
      <section>
        <p className="eyebrow">Step 1 · What you are fencing</p>
        <p className="note">
          {plural(kept.length, 'side')} of {plural(sides.length, 'side')} ·{' '}
          <strong>{num(plan.perimeter, 1)} m</strong> to fence.
          {dropped.size > 0 && ' The rest is left open.'}
        </p>
        <p className="note">
          Click a side on the map, or a row here, to leave it out — most fences
          go round part of a boundary, not all of it.
        </p>
        <div className="rows fs-sides">
          {sides.map((m, i) => {
            const on = !dropped.has(i);
            return (
              <button key={cornerLabel(i)} type="button"
                      className={`fs-side${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onMouseEnter={() => setActive(i)}
                      onMouseLeave={() => setActive(null)}
                      onClick={() => toggle(i)}>
                <span className="fs-letters">
                  {cornerLabel(i)}–{cornerLabel((i + 1) % sides.length)}
                </span>
                <span className="grow num">{m.toFixed(1)} m</span>
                <span className="note">{on ? 'fencing' : 'skipped'}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <p className="eyebrow">Step 2 · What you are fencing it with</p>
        <div className="fs-in">
          <span className="field">
            <label htmlFor="fs-spacing">Post spacing (m)</label>
            <input id="fs-spacing" type="text" inputMode="decimal" value={spacing}
                   onChange={(e) => setSpacing(e.target.value)} />
          </span>
          <span className="field">
            <label htmlFor="fs-strands">Strands of wire</label>
            <input id="fs-strands" type="text" inputMode="numeric" value={strands}
                   onChange={(e) => setStrands(e.target.value)} />
          </span>
          <span className="field">
            <label htmlFor="fs-gates">Gates</label>
            <input id="fs-gates" type="text" inputMode="numeric" value={gates}
                   onChange={(e) => setGates(e.target.value)} />
          </span>
          <span className="field">
            <label htmlFor="fs-gate-width">Gate width (m)</label>
            <input id="fs-gate-width" type="text" inputMode="decimal" value={gateWidth}
                   onChange={(e) => setGateWidth(e.target.value)} />
          </span>
          <span className="field">
            <label htmlFor="fs-roll">Wire roll (m)</label>
            <input id="fs-roll" type="text" inputMode="decimal" value={roll}
                   onChange={(e) => setRoll(e.target.value)} />
          </span>
        </div>

        <p className="eyebrow" style={{ marginTop: 'var(--space-md)' }}>Your rates</p>
        <div className="fs-in">
          <span className="field">
            <label htmlFor="fs-post-rate">₹ per post</label>
            <input id="fs-post-rate" type="text" inputMode="decimal" value={postRate}
                   placeholder="250" onChange={(e) => setPostRate(e.target.value)} />
          </span>
          <span className="field">
            <label htmlFor="fs-wire-rate">₹ per m of wire</label>
            <input id="fs-wire-rate" type="text" inputMode="decimal" value={wireRate}
                   placeholder="12" onChange={(e) => setWireRate(e.target.value)} />
          </span>
          <span className="field">
            <label htmlFor="fs-gate-rate">₹ per gate</label>
            <input id="fs-gate-rate" type="text" inputMode="decimal" value={gateRate}
                   placeholder="6000" onChange={(e) => setGateRate(e.target.value)} />
          </span>
        </div>
      </section>

      <section>
        <p className="eyebrow">Step 3 · What it comes to</p>
        <table className="fs-bill">
          <tbody>
            <tr>
              <th>Corner posts</th>
              <td className="num">{num(plan.cornerPosts)}</td>
              <td className="note">one at every corner — a fence turns there</td>
            </tr>
            <tr>
              <th>Line posts</th>
              <td className="num">{num(plan.linePosts)}</td>
              <td className="note">
                every {Number(spacing) || 0} m at most, along the sides
              </td>
            </tr>
            {gatePosts > 0 && (
              <tr>
                <th>Gate posts</th>
                <td className="num">{num(gatePosts)}</td>
                <td className="note">two to a gate</td>
              </tr>
            )}
            <tr className="fs-sum">
              <th>Posts</th>
              <td className="num">{num(posts)}</td>
              <td className="note">{postCost > 0 ? inrFull(postCost) : ''}</td>
            </tr>
            <tr>
              <th>Wire</th>
              <td className="num">{num(wire, 1)} m</td>
              <td className="note">
                {num(wireRun, 1)} m of fence × {num(strandCount)} strands
                {openings > 0 && ` (${num(openings, 1)} m of gate taken out)`}
              </td>
            </tr>
            {rolls > 0 && (
              <tr>
                <th>Rolls</th>
                <td className="num">{num(rolls)}</td>
                <td className="note">of {num(rollLength)} m — what you buy</td>
              </tr>
            )}
            {wireCost > 0 && (
              <tr className="fs-sum">
                <th>Wire</th>
                <td className="num" />
                <td className="note">{inrFull(wireCost)}</td>
              </tr>
            )}
            {gateCost > 0 && (
              <tr className="fs-sum">
                <th>Gates</th>
                <td className="num">{num(gateCount)}</td>
                <td className="note">{inrFull(gateCost)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {total > 0 ? (
          <p className="fs-total">
            <span className="grow">Materials</span>
            <strong className="num">{inrFull(total)}</strong>
          </p>
        ) : null}

        {/* An estimate that cannot leave the screen is arithmetic, not a tool.
            It leaves two ways: printed, for the supplier, and raised as work on
            the record, for whoever is going to build it.
            Deliberately a REQUEST and not an expense or a feature: the fence
            does not exist yet and the money has not been spent. Writing either
            of those down would put a thing on the land that is not there. */}
        {recordId ? (
          <div className="row tight" style={{ marginTop: 'var(--space-sm)' }}>
            {duplicate ? (
              <>
                <Link className="btn sm primary" to={`/app/services/${duplicate.id}`}>
                  Open fencing request
                </Link>
                <Link className="btn sm danger" to={`/app/services/${duplicate.id}?action=cancel`}>
                  Cancel request
                </Link>
              </>
            ) : (
              <button type="button" className="btn sm primary"
                      disabled={ask.isPending || openOrders.isLoading || !!openOrders.error}
                      onClick={() => void raise()}>
                {ask.isPending ? 'Asking…' : openOrders.isLoading ? 'Checking requests…'
                  : `Ask for this on ${recordTitle ?? 'the record'}`}
              </button>
            )}
            <button type="button" className="btn sm" onClick={() => window.print()}>
              <PrintOutlined sx={{ fontSize: 15 }} /> Print for the supplier
            </button>
          </div>
        ) : (
          <p className="note" style={{ marginTop: 'var(--space-sm)' }}>
            Print takes this to a supplier. To raise it as work, this plot has to
            be one of your records first — file it, and the request can hang off it.
          </p>
        )}
        {openOrders.error && recordId && (
          <p className="note" style={{ color: 'var(--w-danger)' }}>
            Existing requests could not be checked, so a new one cannot be raised yet.
          </p>
        )}
        {asked && <p className="note" style={{ color: 'var(--w-danger)' }}>{asked}</p>}

        {total <= 0 && (
          <p className="note">
            Put your own rates in above and it prices itself. Nothing here is a
            market rate — a post costs what your supplier charges.
          </p>
        )}
        <p className="note">
          Materials only. Labour, corner bracing, cartage and the gate&rsquo;s own
          fittings are not in it.
        </p>
      </section>
    </div>
  );

  /** The sheet. Hidden on screen, and the only thing on the page in print.
   *
   *  What Print used to produce was the FORM: the rail, the input boxes, and a
   *  panel cut off two fields above the answer. Nobody could take that to a
   *  supplier, which is the one thing an estimate is for. */
  const sheet = (
    <section className="fs-sheet">
      <header>
        <h2>Fence estimate</h2>
        <p>{title}{subtitle ? ` · ${subtitle}` : ''} · {stamp}</p>
      </header>

      <FencePlan ring={ring} dropped={dropped} />

      <div className="fs-sheet-grid">
        <div>
          <h3>The line</h3>
          <table>
            <tbody>
              {sides.map((m, i) => (
                <tr key={cornerLabel(i)} className={dropped.has(i) ? 'skip' : ''}>
                  <th>{cornerLabel(i)}–{cornerLabel((i + 1) % sides.length)}</th>
                  <td className="num">{m.toFixed(1)} m</td>
                  <td>{dropped.has(i) ? 'not fenced' : ''}</td>
                </tr>
              ))}
              <tr className="fs-sum">
                <th>To fence</th>
                <td className="num">{num(plan.perimeter, 1)} m</td>
                <td>{plural(kept.length, 'side')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h3>Built as</h3>
          <table>
            <tbody>
              <tr><th>Post spacing</th><td className="num">{spacing} m</td><td>at most</td></tr>
              <tr><th>Strands</th><td className="num">{strands}</td><td /></tr>
              <tr><th>Gates</th><td className="num">{gateCount}</td>
                <td>{gateWidth} m wide</td></tr>
              <tr><th>Wire roll</th><td className="num">{roll} m</td><td /></tr>
            </tbody>
          </table>

          <h3>To buy</h3>
          <table>
            <tbody>
              <tr>
                <th>Posts</th>
                <td className="num">{num(posts)}</td>
                <td>
                  {num(plan.cornerPosts)} corner · {num(plan.linePosts)} line
                  {gatePosts > 0 && ` · ${num(gatePosts)} gate`}
                </td>
              </tr>
              <tr>
                <th>Wire</th>
                <td className="num">{num(wire, 0)} m</td>
                <td>{rolls > 0 ? `${num(rolls)} rolls of ${num(rollLength)} m` : ''}</td>
              </tr>
              {gateCount > 0 && (
                <tr><th>Gates</th><td className="num">{num(gateCount)}</td><td /></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <table className="fs-sheet-money">
          <tbody>
            {postCost > 0 && (
              <tr>
                <th>{num(posts)} posts</th>
                <td className="note">at {inrFull(Number(postRate) || 0)} each</td>
                <td className="num">{inrFull(postCost)}</td>
              </tr>
            )}
            {wireCost > 0 && (
              <tr>
                <th>{num(wire, 0)} m of wire</th>
                <td className="note">at {inrFull(Number(wireRate) || 0)} a metre</td>
                <td className="num">{inrFull(wireCost)}</td>
              </tr>
            )}
            {gateCost > 0 && (
              <tr>
                <th>{plural(gateCount, 'gate')}</th>
                <td className="note">at {inrFull(Number(gateRate) || 0)} each</td>
                <td className="num">{inrFull(gateCost)}</td>
              </tr>
            )}
            <tr className="fs-sum">
              <th>Materials</th>
              <td />
              <td className="num">{inrFull(total)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="fs-sheet-foot">
        Materials only — labour, corner bracing, cartage and the gate&rsquo;s own
        fittings are not in it. Lengths are measured off the survey
        department&rsquo;s shape file. Rates are the ones entered above and are
        not quotes.
      </p>
    </section>
  );

  return (
    <div className={`fs${panel === 'left' ? ' flip' : ''}`}>
      <header className="fs-bar">
        <span className="grow">
          <span className="eyebrow">Fence calculator</span>
          <strong>{title}</strong>
          {subtitle && <span className="note"> · {subtitle}</span>}
        </span>
        <button type="button" className="btn sm"
                title="Move the panel to the other side"
                onClick={() => setPanel((p) => (p === 'right' ? 'left' : 'right'))}>
          <ViewSidebarOutlined sx={{ fontSize: 15 }} /> Panel {panel === 'right' ? 'left' : 'right'}
        </button>
        <button type="button" className="btn sm" onClick={() => window.print()}>
          <PrintOutlined sx={{ fontSize: 15 }} /> Print
        </button>
        <button type="button" className="btn sm" aria-label="Close the fence calculator"
                onClick={onClose}>
          <CloseOutlined sx={{ fontSize: 15 }} />
        </button>
      </header>
      <div className="fs-body">
        {map}
        {steps}
      </div>
      {sheet}
    </div>
  );
}

/** Local so this file can be read on its own; `plural` in ui.tsx is the same
 *  rule and is not worth a cycle of imports for one word. */
function plural(n: number, one: string) {
  return `${num(n)} ${n === 1 ? one : `${one}s`}`;
}
