/**
 * Rebuild the demo world from scratch before every run.
 *
 * Three steps, and the order matters:
 *   1. `seed-demo-data --purge` — drop the generated filler (`demo-` ids) and
 *      restore any base field it had stamped, so step 2 starts from bare rows.
 *   2. `seed-web360 w360-demo`  — the hand-authored, screenshot-exact set
 *      (`w360-` ids): Sy 214/2 with its 11 papers and 14 features, Sy 88's two
 *      lots, Flat 4B's ledger, the vault's links, the shared kit.
 *   3. `seed-demo-data w360-demo` — fill everything step 2 left empty, so the
 *      other records are not hollow shells. It never touches a record that
 *      already has data, which is why step 2 survives it intact.
 *
 * Without this the suite would inherit whatever the last manual seed left
 * behind, and row-counting assertions would fail for the wrong reason.
 * Both scripts are scoped to `w360-` / `demo-` ids and the `w360-demo`
 * identity; the founder's own records are never in range.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

export default function globalSetup(): void {
  const platform = path.resolve(__dirname, '../..');
  const python = path.join(platform, '.local/api-venv/bin/python');
  const run = (script: string, ...args: string[]) =>
    execFileSync(python, [path.join(platform, 'scripts', script), ...args],
      { stdio: 'inherit', cwd: platform });

  // Scoped to the demo identity: an unscoped purge would also clear the
  // filler on the founder's own records, which the suite has no business
  // touching.
  run('seed-demo-data.py', '--purge', 'w360-demo');
  run('seed-web360.py', 'w360-demo');
  run('seed-demo-data.py', 'w360-demo');
}
