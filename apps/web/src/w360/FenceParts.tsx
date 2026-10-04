/**
 * The fence calculator's shared parts — the build, the bill and the sheet.
 *
 * Two screens price a fence: the village-map studio (FenceStudio), which takes
 * its sides from a traced shape, and the Tools tab (`/app/tools?tab=fence`),
 * which takes them typed. Steps 2 and 3 and the printed sheet are the same
 * questions and the same answer on both, so they are drawn here once and the
 * arithmetic underneath is fenceBill.ts. Neither screen keeps its own copy.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { cornerLabel, formatDate, ringSides } from '@pattadar/core';

import { FENCE_DEFAULTS } from './fenceBill';
import type { FenceBillResult, FenceBuild } from './fenceBill';
import { inrFull, num, plural } from './ui';

/** The rates and the build, kept between visits. A post costs what it costs
 *  wherever you buy it, and retyping four figures every time you want to price
 *  a different plot is the kind of friction that stops a tool being used.
 *  Both ways in share the key, so rates typed on the map are there in Tools. */
const KEPT = 'w360.fence';

function remembered(): Partial<FenceBuild> {
  try {
    return JSON.parse(localStorage.getItem(KEPT) || '{}') as Partial<FenceBuild>;
  } catch {
    return {};
  }
}

/** The build as typed, loaded from and saved back to the browser. */
export function useFenceBuild(): [FenceBuild, (field: keyof FenceBuild, value: string) => void] {
  const [build, setBuild] = useState<FenceBuild>(() => {
    const was = remembered();
    const out = { ...FENCE_DEFAULTS };
    for (const k of Object.keys(out) as (keyof FenceBuild)[]) {
      if (typeof was[k] === 'string') out[k] = was[k];
    }
    return out;
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEPT, JSON.stringify(build));
    } catch {
      // A browser that refuses storage still gets a working calculator.
    }
  }, [build]);

  const set = (field: keyof FenceBuild, value: string) =>
    setBuild((b) => ({ ...b, [field]: value }));
  return [build, set];
}

/** A side's name from its two corners. A loop's last side comes back to A; an
 *  open run has one more corner than it has sides, so it does not. */
export function sideName(i: number, count: number, closed = true): string {
  return `${cornerLabel(i)}–${cornerLabel(closed ? (i + 1) % count : i + 1)}`;
}

/** Step 2 — what the fence is built with, and the owner's own rates. */
export function FenceBuildFields({ build, set, idBase = 'fs' }: {
  build: FenceBuild; set: (field: keyof FenceBuild, value: string) => void;
  /** The boxes keep the studio's ids (`fs-post-rate`, …), which its tests and
   *  any bookmarked focus rely on; a second screen passes its own. */
  idBase?: string;
}) {
  const box = (field: keyof FenceBuild, label: string, mode: 'decimal' | 'numeric', placeholder?: string) => {
    const id = `${idBase}-${field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    return (
      <span className="field">
        <label htmlFor={id}>{label}</label>
        <input id={id} type="text" inputMode={mode} value={build[field]}
               placeholder={placeholder} onChange={(e) => set(field, e.target.value)} />
      </span>
    );
  };
  return (
    <section>
      <p className="eyebrow">Step 2 · What you are fencing it with</p>
      <div className="fs-in">
        {box('spacing', 'Post spacing (m)', 'decimal')}
        {box('strands', 'Strands of wire', 'numeric')}
        {box('gates', 'Gates', 'numeric')}
        {box('gateWidth', 'Gate width (m)', 'decimal')}
        {box('roll', 'Wire roll (m)', 'decimal')}
      </div>

      <p className="eyebrow" style={{ marginTop: 'var(--space-md)' }}>Your rates</p>
      <div className="fs-in">
        {box('postRate', '₹ per post', 'decimal', '250')}
        {box('wireRate', '₹ per m of wire', 'decimal', '12')}
        {box('gateRate', '₹ per gate', 'decimal', '6000')}
      </div>
    </section>
  );
}

/** Step 3 — what it comes to. `children` sits between the total and the
 *  closing notes: it is where each screen puts its own ways out. */
export function FenceBillTable({ bill, build, children }: {
  bill: FenceBillResult; build: FenceBuild; children?: ReactNode;
}) {
  const { plan, gatePosts, posts, postCost, wire, wireRun, strandCount, openings,
    rolls, rollLength, wireCost, gateCost, gateCount, total } = bill;
  return (
    <>
      <table className="fs-bill">
        <tbody>
          <tr>
            <th>Corner posts</th>
            <td className="num">{num(plan.cornerPosts)}</td>
            <td className="note" />
          </tr>
          <tr>
            <th>Line posts</th>
            <td className="num">{num(plan.linePosts)}</td>
            <td className="note">
              every {Number(build.spacing) || 0} m
            </td>
          </tr>
          {gatePosts > 0 && (
            <tr>
              <th>Gate posts</th>
              <td className="num">{num(gatePosts)}</td>
              <td className="note" />
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
              <td className="note">of {num(rollLength)} m</td>
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

      {children}

      {total <= 0 && (
        <p className="note">Enter your rates to price it.</p>
      )}
      <p className="note">Materials only, excluding labour.</p>
    </>
  );
}

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
         role="img" aria-label="Fence plan">
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

/** The sheet. Hidden on screen, and the only thing on the page in print.
 *
 *  What Print used to produce was the FORM: the rail, the input boxes, and a
 *  panel cut off two fields above the answer. Nobody could take that to a
 *  supplier, which is the one thing an estimate is for.
 *
 *  `ring` draws the plan; without one (sides typed by hand) there is no shape
 *  to draw, and the sheet is the tables alone. */
export function FenceSheet({
  title, subtitle, sides, names, dropped, closed = true, ring, bill, build,
}: {
  /** What is being fenced (the plot); left out when there is nothing to name. */
  title?: string;
  subtitle?: string;
  /** Every side, in metres, fenced or not. */
  sides: number[];
  /** Each side's name as the screen shows it, when `sides` is not the whole
   *  run in order — typed sides skip blank rows, and the sheet must still call
   *  a side what the owner saw it called. Without it, sides are lettered A on. */
  names?: string[];
  dropped: Set<number>;
  /** Names the last side back to A (a loop) or on to the next letter (a run). */
  closed?: boolean;
  ring?: Array<[number, number]>;
  bill: FenceBillResult;
  build: FenceBuild;
}) {
  /** Stamped once, when the calculator opens: a sheet somebody prints is dated
   *  the day they printed it, not the millisecond they last touched a field. */
  const [stamp] = useState(() => formatDate(new Date()));
  const { plan, gateCount, posts, gatePosts, wire, rolls, rollLength,
    postCost, wireCost, gateCost, total } = bill;
  const kept = sides.filter((m, i) => !dropped.has(i) && m > 0).length;

  return (
    <section className="fs-sheet">
      <header>
        <h2>Fence estimate</h2>
        <p>{[title, subtitle, stamp].filter(Boolean).join(' · ')}</p>
      </header>

      {ring && ring.length >= 3 && <FencePlan ring={ring} dropped={dropped} />}

      <div className="fs-sheet-grid">
        <div>
          <h3>The line</h3>
          <table>
            <tbody>
              {sides.map((m, i) => (
                <tr key={cornerLabel(i)} className={dropped.has(i) ? 'skip' : ''}>
                  <th>{names?.[i] ?? sideName(i, sides.length, closed)}</th>
                  <td className="num">{m.toFixed(1)} m</td>
                  <td>{dropped.has(i) ? 'not fenced' : ''}</td>
                </tr>
              ))}
              <tr className="fs-sum">
                <th>To fence</th>
                <td className="num">{num(plan.perimeter, 1)} m</td>
                <td>{plural(kept, 'side')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h3>Built as</h3>
          <table>
            <tbody>
              <tr><th>Post spacing</th><td className="num">{build.spacing} m</td><td>at most</td></tr>
              <tr><th>Strands</th><td className="num">{build.strands}</td><td /></tr>
              <tr><th>Gates</th><td className="num">{gateCount}</td>
                <td>{build.gateWidth} m wide</td></tr>
              <tr><th>Wire roll</th><td className="num">{build.roll} m</td><td /></tr>
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
                <td className="note">at {inrFull(Number(build.postRate) || 0)} each</td>
                <td className="num">{inrFull(postCost)}</td>
              </tr>
            )}
            {wireCost > 0 && (
              <tr>
                <th>{num(wire, 0)} m of wire</th>
                <td className="note">at {inrFull(Number(build.wireRate) || 0)} a metre</td>
                <td className="num">{inrFull(wireCost)}</td>
              </tr>
            )}
            {gateCost > 0 && (
              <tr>
                <th>{plural(gateCount, 'gate')}</th>
                <td className="note">at {inrFull(Number(build.gateRate) || 0)} each</td>
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
        Materials only, excluding labour. Rates are not quotes.
      </p>
    </section>
  );
}
