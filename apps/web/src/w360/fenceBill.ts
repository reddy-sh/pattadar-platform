/** The fence bill — the arithmetic behind both ways in to the fence calculator.
 *
 *  The village-map studio (FenceStudio) prices a traced shape; the Tools tab
 *  (`/app/tools?tab=fence`) prices sides typed by hand. They must never
 *  disagree about what the same fence costs, so the sums live here once, with
 *  no React and no styling, and both screens call them.
 *
 *  Every field is taken as the string the owner typed: a box being edited is
 *  briefly "", "3." or nonsense, and none of those may throw or print NaN. */
import { fencePlan } from '@pattadar/core';

/** What the fence is built with and what it costs, as typed in the boxes. */
export type FenceBuild = {
  spacing: string;
  strands: string;
  gates: string;
  gateWidth: string;
  roll: string;
  postRate: string;
  wireRate: string;
  gateRate: string;
};

/** A three-metre stride, four strands, one 3.6 m gate and a 500 m roll: what
 *  the calculator offers before anyone has typed anything. */
export const FENCE_DEFAULTS: FenceBuild = {
  spacing: '3',
  strands: '4',
  gates: '1',
  gateWidth: '3.6',
  roll: '500',
  postRate: '',
  wireRate: '',
  gateRate: '',
};

/** Gate posts stand in pairs and take no wire between them. */
export const GATE_POSTS = 2;

export type FenceBillResult = ReturnType<typeof fenceBill>;

/** Price a fence from the sides being fenced (in metres).
 *  `closed` is whether the line returns to where it started — a loop has as
 *  many corners as sides, an open run one more. */
export function fenceBill(keptSideMetres: number[], closed: boolean, b: FenceBuild) {
  const gateCount = Math.max(0, Math.round(Number(b.gates) || 0));
  const openings = gateCount * (Number(b.gateWidth) || 0);
  const strandCount = Math.max(0, Number(b.strands) || 0);
  const rollLength = Number(b.roll) || 0;

  const plan = fencePlan(keptSideMetres, {
    spacing: Number(b.spacing) || 0,
    strands: strandCount,
    closed,
    costPerPost: Number(b.postRate) || 0,
    costPerMetre: Number(b.wireRate) || 0,
  });

  // A gate is a hole in the fence: no wire across it, and a post either side.
  const wireRun = Math.max(0, plan.perimeter - openings);
  const wire = wireRun * strandCount;
  const gatePosts = gateCount * GATE_POSTS;
  const posts = plan.posts + gatePosts;
  const rolls = rollLength > 0 ? Math.ceil(wire / rollLength) : 0;

  const postCost = posts * (Number(b.postRate) || 0);
  const wireCost = wire * (Number(b.wireRate) || 0);
  const gateCost = gateCount * (Number(b.gateRate) || 0);
  const total = postCost + wireCost + gateCost;

  return {
    plan, gateCount, openings, strandCount, rollLength, wireRun, wire,
    gatePosts, posts, rolls, postCost, wireCost, gateCost, total,
  };
}
