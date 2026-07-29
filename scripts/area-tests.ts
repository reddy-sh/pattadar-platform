/** Deed extent parsing — `bun run scripts/area-tests.ts`. */
import { parseAreaSqYd, toAcres, unitKey } from '../packages/core/src/index';

let failures = 0;
const check = (name: string, got: number, want: number) => {
  if (Math.abs(got - want) > 1e-9) { failures += 1; console.error(`FAIL: ${name} — got ${got}, want ${want}`); }
};

// The exact string a real Guntur deed returned. Stripping non-digits gave 41812.
check('418-1/2 sq. yards', parseAreaSqYd('418-1/2 sq. yards'), 418.5);
check('418 1/2 sq yards', parseAreaSqYd('418 1/2 sq yards'), 418.5);
check('plain number', parseAreaSqYd('240'), 240);
check('with unit', parseAreaSqYd('240 Sq.Yds'), 240);
check('thousands separator', parseAreaSqYd('1,200 sq yd'), 1200);
check('decimal', parseAreaSqYd('83.5 sq yards'), 83.5);
check('bare fraction', parseAreaSqYd('1/2'), 0.5);
check('empty', parseAreaSqYd(''), 0);
check('null', parseAreaSqYd(null), 0);
check('no digits', parseAreaSqYd('as per schedule'), 0);
// A trailing survey reference must not be glued onto the number.
check('number then survey', parseAreaSqYd('300 sq yds in Sy 418'), 300);

console.log(failures === 0 ? 'AREA TESTS PASS' : `AREA TESTS FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);

// ── A scanned passbook's extent must land in acres ────────────────────────
// add-khata wrote the extracted number verbatim with its unit as a label, so
// "40 Guntas" became 40 ACRES — a forty-fold overstatement, on the automated
// path people are told to prefer over typing.
for (const [value, unit, acres] of [
  [40, 'Guntas', 1],           // 40 guntas = 1 acre
  [40, 'gunta', 1],
  [100, 'Cents', 1],           // 100 cents = 1 acre
  [4840, 'Sq. yards', 1],      // 4840 sq yd = 1 acre
  [2.5, 'Acres-Guntas', 2.5],  // the legacy label is already decimal acres
] as [number, string, number][]) {
  check(`${value} ${unit} -> acres`, Math.round(toAcres(value, unitKey(unit)) * 1e6) / 1e6, acres);
}
