/**
 * Writes each app's theme-init.js from the palette pack, and points the app's
 * HTML at it — `bun run scripts/emit-theme-init.ts`.
 *
 * Run it after changing anything in packages/tokens/src/palette that the
 * script carries (the schemes, their grounds and modes, the defaults, the
 * storage keys). scripts/palette-tests.ts fails until the committed files match.
 *
 *   bun run scripts/emit-theme-init.ts           # write
 *   bun run scripts/emit-theme-init.ts --check   # report drift, write nothing
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expectedFiles, ROOT } from './lib/theme-init';

const check = process.argv.includes('--check');
let drift = 0;
for (const { path, content } of expectedFiles()) {
  const abs = join(ROOT, path);
  const now = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (now === content) continue;
  drift += 1;
  if (check) console.error(`out of date: ${path}`);
  else {
    writeFileSync(abs, content);
    console.log(`wrote ${path}`);
  }
}
if (check && drift) {
  console.error('Run `bun run scripts/emit-theme-init.ts` and commit the result.');
  process.exit(1);
}
if (!drift) console.log('theme-init is up to date');
