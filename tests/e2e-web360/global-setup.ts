/**
 * Rebuild the demo world from scratch before every run.
 *
 * Four steps, and the order matters:
 *   0. `purge-e2e-records` — drop records the SUITE filed through the app
 *      (`rec-` ids), which neither seed script purges because neither made
 *      them. Residue from a crashed run otherwise poisons every later run.
 *   1. `seed-demo-data --purge` — drop the generated filler (`demo-` ids) and
 *      restore any base field it had stamped, so step 2 starts from bare rows.
 *   2. `seed-web360 w360-demo`  — the hand-authored, screenshot-exact set
 *      (`w360-` ids): Sy 214/2 with its 12 papers and 14 features, Sy 88's two
 *      lots, Flat 4B's ledger, the vault's links, the shared kit.
 *   3. `seed-demo-data w360-demo` — fill everything step 2 left empty, so the
 *      other records are not hollow shells. It never touches a record that
 *      already has data, which is why step 2 survives it intact.
 *
 * Without this the suite would inherit whatever the last manual seed left
 * behind, and row-counting assertions would fail for the wrong reason.
 * Step 3 is scoped with `--only w360-`, not just by identity. Owning a record
 * is not the same as having authored it: a parcel filed by hand in the demo
 * account is, to that script, simply an empty record this user owns, and it
 * was given eight generated papers, fifteen photos, five people and a pin
 * 200 km from the village named on the record. The founder's own identity was
 * never in range; the founder's own DATA, filed in this one, was.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

export default function globalSetup(): void {
  const platform = path.resolve(__dirname, '../..');
  const python = path.join(platform, '.local/api-venv/bin/python');
  const run = (script: string, ...args: string[]) =>
    execFileSync(python, [path.join(platform, 'scripts', script), ...args],
      { stdio: 'inherit', cwd: platform });

  // Step 0. Neither seed script purges `rec-` ids, because neither wrote
  // them: they belong to records the SUITE filed through the app's own Add
  // drawer. One crashed run leaves a parcel behind, the next starts with ten
  // records where the specs assert nine, and every count-based test fails
  // without naming the row that did it — until someone deletes it by hand.
  run('purge-e2e-records.py', 'w360-demo');

  // Scoped to the demo identity: an unscoped purge would also clear the
  // filler on the founder's own records, which the suite has no business
  // touching.
  run('seed-demo-data.py', '--purge', 'w360-demo');
  run('seed-web360.py', 'w360-demo');
  run('seed-demo-data.py', '--only=w360-', 'w360-demo');
}
