/**
 * Every icon name the app uses must exist in the icon font.
 * Run with `bun run scripts/icon-guard.ts`.
 *
 * A name that isn't in the glyph map does not fail loudly — react-native-paper
 * renders a "?" glyph and the build stays green. `signpost-outline` shipped to
 * a physical device that way and sat in a category chip looking like a bug in
 * the data. The compiler cannot catch this because every icon prop is a plain
 * string, so it gets checked here instead.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

function findGlyphMap(): string {
  const bunDir = join(ROOT, 'node_modules/.bun');
  for (const pkg of readdirSync(bunDir)) {
    if (!pkg.startsWith('@expo+vector-icons@')) continue;
    const p = join(
      bunDir,
      pkg,
      'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json',
    );
    try {
      statSync(p);
      return p;
    } catch {
      // try the next hoisted copy
    }
  }
  throw new Error('MaterialCommunityIcons glyph map not found');
}

const GLYPHS = new Set(Object.keys(JSON.parse(readFileSync(findGlyphMap(), 'utf8'))));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, 'apps/mobile/src')), ...walk(join(ROOT, 'packages/core/src'))];

// `icon="name"`, `source="name"`, `leadingIcon="name"`, `icon: 'name'` — the
// literal forms. Names built at runtime are out of reach and stay that way.
const PATTERNS = [
  /\b(?:icon|source|leadingIcon|trailingIcon|closeIcon|checkedIcon|uncheckedIcon)=["']([a-z0-9-]+)["']/g,
  /\bicon:\s*['"]([a-z0-9-]+)['"]/g,
];

let missing = 0;
const seen = new Set<string>();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const name = m[1];
      // Single words are usually a variant/mode prop, not an icon.
      if (!name.includes('-') && !GLYPHS.has(name)) continue;
      if (GLYPHS.has(name) || seen.has(`${f}:${name}`)) continue;
      seen.add(`${f}:${name}`);
      missing += 1;
      console.error(`MISSING ICON: "${name}" in ${f.replace(`${ROOT}/`, '')}`);
    }
  }
}

console.log(missing === 0 ? 'ICON GUARD PASSES' : `ICON GUARD FAILED (${missing})`);
process.exit(missing === 0 ? 0 : 1);
