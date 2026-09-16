/** Fencing arithmetic — `bun run scripts/fence-tests.ts`.
 *
 *  The thing under test is the corner rule. A fence turns at its corners, so a
 *  post stands at every one of them whether or not the spacing lands there,
 *  and a side cannot be spanned by a stride that ignores its ends. Getting
 *  that wrong under-orders the posts that hold the fence up. */
import { fencePlan } from '../packages/core/src/index';

let failures = 0;
const check = (name: string, got: number, want: number) => {
  if (Math.abs(got - want) > 1e-9) {
    failures += 1;
    console.error(`FAIL: ${name} — got ${got}, want ${want}`);
  }
};

// A 100 × 80 m plot. Blunt arithmetic says ceil(360/3) = 120 posts. Walked
// side by side: 4 corners, plus (34-1) + (27-1) + (34-1) + (27-1) line posts.
const rect = fencePlan([100, 80, 100, 80], { spacing: 3, strands: 4 });
check('rectangle perimeter', rect.perimeter, 360);
check('rectangle sides', rect.sides, 4);
check('rectangle corners', rect.corners, 4);
check('rectangle line posts', rect.linePosts, 33 + 26 + 33 + 26);
check('rectangle posts', rect.posts, 4 + 118);
check('four strands of wire', rect.wire, 1440);

// Spacing is a maximum, not a stride: 100 m at 3 m is 34 even intervals of
// 2.94 m, not 33 of 3 m and a 1 m orphan.
check('even intervals', rect.bySide[0].spacing, 100 / 34);
check('no orphan interval', rect.bySide[0].posts, 33);

// A side shorter than the spacing still has its two corners and nothing
// between them — it must not round down to a fence with no posts.
const tri = fencePlan([2, 2, 2], { spacing: 3, strands: 2 });
check('short sides need no line posts', tri.linePosts, 0);
check('short sides still have corners', tri.posts, 3);

// An open run has a corner at each end, so one more than it has sides.
const run = fencePlan([50, 50], { spacing: 5, strands: 3, closed: false });
check('open run corners', run.corners, 3);
check('open run posts', run.posts, 3 + 9 + 9);

// Money is itemised the way a fencing quote is: per post, and per metre of
// wire — which is the perimeter once for EACH strand, not once.
const quoted = fencePlan([100, 80, 100, 80], {
  spacing: 3, strands: 4, costPerPost: 250, costPerMetre: 12,
});
check('post cost', quoted.postCost, 122 * 250);
check('wire cost', quoted.wireCost, 1440 * 12);
check('total cost', quoted.cost, 122 * 250 + 1440 * 12);

// Nothing to fence is not a crash.
const none = fencePlan([], { spacing: 3, strands: 4 });
check('empty perimeter', none.perimeter, 0);
check('empty corners', none.corners, 0);
check('empty posts', none.posts, 0);
// Neither is a nonsense spacing: corners still stand.
const noSpacing = fencePlan([100, 100, 100], { spacing: 0, strands: 4 });
check('no spacing, corners only', noSpacing.posts, 3);

console.log(failures === 0 ? 'FENCE TESTS PASS' : `FENCE TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
