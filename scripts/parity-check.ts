/**
 * Web ↔ iOS drift, found mechanically.
 *
 * `packages/core` is the single definition of what an extent means and what a
 * deed is called, and three TypeScript heads import it. Swift cannot, so the
 * rules exist twice — and two implementations drift unless something forces
 * them not to. `scripts/emit-vectors.ts` + `VectorTests.swift` already force it
 * for land arithmetic. This forces it for the other four seams:
 *
 *   1. a `packages/core` module moved and its `PattadarKit` twin did not
 *   2. the emitted vectors are stale
 *   3. `Queries.swift` names a field the Python schema no longer has — which
 *      fails the WHOLE query at runtime, not just that field
 *   4. the doc-family taxonomy disagrees shelf for shelf
 *   5. a design token that is contractual moved on one side only
 *
 * Nothing here calls a model. It is the cheap half of the parity contract in
 * `docs/specs/2026-08-22-web-ios-parity-contract.md`; the agent behind
 * `/sync-ios` reads this output rather than re-deriving it.
 *
 *   bun run scripts/parity-check.ts                # working tree vs HEAD
 *   bun run scripts/parity-check.ts HEAD~1..HEAD   # a range
 *   bun run scripts/parity-check.ts 10bac70        # one commit
 *   bun run scripts/parity-check.ts --json         # for the agent prompt
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const MAP = JSON.parse(readFileSync(join(ROOT, 'scripts', 'parity-map.json'), 'utf8'));

type Level = 'error' | 'warn' | 'info';
interface Finding {
  check: string;
  level: Level;
  message: string;
  /** Where a human should look first. */
  where?: string;
}
const findings: Finding[] = [];
const add = (check: string, level: Level, message: string, where?: string) =>
  findings.push({ check, level, message, where });

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const has = (rel: string) => existsSync(join(ROOT, rel));

// ── what changed ────────────────────────────────────────────────────────
//
// With no argument the answer is the working tree, because that is where a
// change is when someone asks "did I forget the phone?" — before the commit,
// not after it.
const args = process.argv.slice(2);
const json = args.includes('--json');
const spec = args.find((a) => !a.startsWith('--')) ?? '';

function changedFiles(): { files: string[]; label: string } {
  if (!spec) {
    const out = [
      git('diff', '--name-only', 'HEAD'),
      git('ls-files', '--others', '--exclude-standard'),
    ].join('\n');
    return { files: [...new Set(out.split('\n').filter(Boolean))], label: 'working tree' };
  }
  if (spec.includes('..')) {
    return { files: git('diff', '--name-only', spec).split('\n').filter(Boolean), label: spec };
  }
  const out = git('show', '--name-only', '--format=', spec);
  return { files: [...new Set(out.split('\n').filter(Boolean))], label: spec };
}

/** Which band a path falls in. First match wins, ignore → note → adapt. */
export function band(path: string): 'ignore' | 'note' | 'adapt' | 'none' {
  const hit = (list: string[]) => list.some((p) => path.startsWith(p) || path === p);
  if (hit(MAP.bands.ignore)) return 'ignore';
  if (hit(MAP.bands.note)) return 'note';
  if (hit(MAP.bands.adapt)) return 'adapt';
  return 'none';
}

// ── 1. the twin map ─────────────────────────────────────────────────────
function checkTwins(files: string[]) {
  const changed = new Set(files);
  for (const twin of MAP.twins as { ts: string; swift: string[] }[]) {
    if (!changed.has(twin.ts)) continue;
    const moved = twin.swift.filter((s) => changed.has(s));
    if (moved.length > 0) continue;
    add(
      'twins',
      'error',
      `${twin.ts} changed; its twin did not`,
      twin.swift.join(', '),
    );
  }
}

// ── 2. the emitted vectors ──────────────────────────────────────────────
//
// emit-vectors --check recomputes and compares without writing, so running
// this never dirties a tree that was clean.
function checkVectors() {
  try {
    execFileSync('bun', ['run', 'scripts/emit-vectors.ts', '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (err: any) {
    const out = `${err?.stdout ?? ''}${err?.stderr ?? ''}`.trim();
    add('vectors', 'error', out || 'emit-vectors --check failed', 'packages/core/vectors');
  }
}

// ── 3. does iOS name a field the schema still has? ──────────────────────
//
// `Queries.swift` says it plainly: "A selection set naming a field the schema
// does not have fails the WHOLE query, not just that field." A rename on the
// Python side that nobody carries across therefore blanks a whole screen. So
// every identifier iOS selects has to be somewhere in the schema's vocabulary.
//
// This is a vocabulary check, not a type check: it does not know that
// `surveyNo` belongs to ParcelType rather than PropertyType. That is
// deliberate — a flat vocabulary has almost no false positives, and the defect
// it is aimed at (a field that no longer exists anywhere) is caught either way.
const GQL_KEYWORDS = new Set([
  'query', 'mutation', 'subscription', 'fragment', 'on', 'true', 'false', 'null',
]);

function schemaVocabulary(): Set<string> {
  const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  const vocab = new Set<string>();
  for (const rel of ['services/api/src/main.py', 'services/api/src/web360.py']) {
    if (!has(rel)) continue;
    const lines = read(rel).split('\n');
    let inType = false;
    let indent = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*@strawberry\.(type|input|interface|federation\.type)/.test(line)) {
        // The class line follows, possibly after more decorators.
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const m = lines[j].match(/^(\s*)class\s+\w+/);
          if (m) {
            inType = true;
            indent = m[1].length;
            i = j;
            break;
          }
        }
        continue;
      }
      if (!inType) continue;
      // Dedent out of the class body ends it.
      if (line.trim() && !/^\s/.test(line)) { inType = false; continue; }
      const bodyIndent = line.match(/^(\s*)\S/);
      if (line.trim() && bodyIndent && bodyIndent[1].length <= indent) { inType = false; continue; }

      const field = line.match(/^\s+([a-z_][a-z0-9_]*)\s*:/i);
      if (field) vocab.add(camel(field[1]));
      const method = line.match(/^\s+(?:async\s+)?def\s+([a-z_][a-z0-9_]*)\s*\(/i);
      if (method) vocab.add(camel(method[1]));
      const named = line.match(/name\s*=\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/);
      if (named) vocab.add(named[1]);
    }
  }
  return vocab;
}

/** Field identifiers selected by a GraphQL document.
 *
 *  Everything that is NOT a field sits in one of three places, and each is
 *  removed rather than special-cased:
 *
 *    · inside parentheses — argument lists and the `query ($id: String!)`
 *      variable header, which is where the scalar type NAMES live. Stripping
 *      whole parenthesised groups is what keeps `String` and `Boolean` from
 *      being reported as missing fields.
 *    · behind a `$` — variable references.
 *    · in front of a `:` — an alias. The aliased field survives, which is
 *      what we want to check.
 */
function selectedFields(doc: string): Set<string> {
  const out = new Set<string>();
  let stripped = doc
    .replace(/#[^\n]*/g, ' ')
    .replace(/"[^"]*"/g, ' ');
  // Innermost-first, so nested argument objects go too.
  let before = '';
  while (before !== stripped) {
    before = stripped;
    stripped = stripped.replace(/\([^()]*\)/g, ' ');
  }
  stripped = stripped
    .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, ' ')
    .replace(/[A-Za-z_][A-Za-z0-9_]*\s*:/g, ' ');
  for (const m of stripped.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    if (!GQL_KEYWORDS.has(m[0])) out.add(m[0]);
  }
  return out;
}

function checkQueries() {
  const rel = 'apps/ios/PattadarKit/Sources/PattadarKit/Networking/Queries.swift';
  if (!has(rel)) return;
  const vocab = schemaVocabulary();
  if (vocab.size < 50) {
    add('queries', 'warn', `schema vocabulary looks too small (${vocab.size}) — parser may be stale`,
      'services/api/src/main.py');
    return;
  }
  const src = read(rel);
  const unknown = new Set<string>();
  for (const doc of src.matchAll(/"""([\s\S]*?)"""/g)) {
    for (const f of selectedFields(doc[1])) if (!vocab.has(f)) unknown.add(f);
  }
  for (const f of [...unknown].sort()) {
    add('queries', 'error', `Queries.swift selects "${f}", which is not in the schema vocabulary`, rel);
  }
}

// ── 4. one taxonomy, two languages ──────────────────────────────────────
//
// docFamilies.ts says it outright: "The Swift twin is documentFamily /
// familyLabel in PattadarKit/Format/DocSpine.swift. The two must agree
// exactly." So compare the order, the labels, the tints, and the keyword sets
// each branch tests — a keyword added on one side is a paper that shelves
// differently depending on which device you are holding.
function stripComments(src: string): string {
  // A quoted word inside a comment is prose, not a rule. DocSpine.swift
  // explains itself with "settlement deed", "old" and "household" in exactly
  // the gap between two branches, and reading those as keywords reported a
  // taxonomy split that does not exist.
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function branchKeywords(source: string, quote: RegExp): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const body = stripComments(source);
  const parts = body.split(/return\s+/);
  for (let i = 1; i < parts.length; i++) {
    const family = parts[i].match(/^['"]([a-z_]+)['"]/)?.[1];
    if (!family) continue;
    const words = [...parts[i - 1].matchAll(quote)].map((m) => m[1]).filter((w) => /^[a-z0-9 \-/.]+$/.test(w));
    if (words.length) out.set(family, [...new Set(words)].sort());
  }
  return out;
}

function checkFamilies() {
  const tsRel = 'packages/core/src/records/docFamilies.ts';
  const swRel = 'apps/ios/PattadarKit/Sources/PattadarKit/Format/DocSpine.swift';
  if (!has(tsRel) || !has(swRel)) return;
  const ts = read(tsRel);
  const sw = read(swRel);

  const tsOrder = ts.match(/DOC_FAMILIES:\s*DocFamily\[\]\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  const swOrder = sw.match(/documentFamilies\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  const list = (s: string) => [...s.matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1]);
  const a = list(tsOrder).join(' · ');
  const b = list(swOrder).join(' · ');
  if (a && b && a !== b) {
    add('families', 'error', `shelf order differs\n      web:  ${a}\n      iOS:  ${b}`, `${tsRel} / ${swRel}`);
  }

  const tsLabels = new Map(
    [...(ts.match(/const LABELS[\s\S]*?\};/)?.[0] ?? '').matchAll(/(\w+):\s*'([^']*)'/g)]
      .map((m) => [m[1], m[2]] as const),
  );
  const swLabelBody = sw.match(/func familyLabel[\s\S]*?\n\}/)?.[0] ?? '';
  const swLabels = new Map(
    [...swLabelBody.matchAll(/case\s+"([a-z_]+)":\s*"([^"]*)"/g)].map((m) => [m[1], m[2]] as const),
  );
  const swDefault = swLabelBody.match(/default:\s*"([^"]*)"/)?.[1];
  if (swDefault) swLabels.set('unsorted', swDefault);
  for (const [k, v] of tsLabels) {
    const other = swLabels.get(k);
    if (other !== undefined && other !== v) {
      add('families', 'error', `label for "${k}" differs — web "${v}", iOS "${other}"`, `${tsRel} / ${swRel}`);
    }
  }

  const tsBody = ts.match(/export function documentFamily[\s\S]*?\n\}/)?.[0] ?? '';
  const swBody = sw.match(/public func documentFamily[\s\S]*?\n\}/)?.[0] ?? '';
  const tsKw = branchKeywords(tsBody, /'([^']*)'/g);
  const swKw = branchKeywords(swBody, /"([^"]*)"/g);
  for (const [family, words] of tsKw) {
    const other = swKw.get(family);
    if (!other) continue;
    const onlyWeb = words.filter((w) => !other.includes(w));
    const onlyIos = other.filter((w) => !words.includes(w));
    if (onlyWeb.length || onlyIos.length) {
      add('families', 'error',
        `"${family}" is matched by different words` +
        (onlyWeb.length ? `\n      web only: ${onlyWeb.join(', ')}` : '') +
        (onlyIos.length ? `\n      iOS only: ${onlyIos.join(', ')}` : ''),
        `${tsRel} / ${swRel}`);
    }
  }
}

// ── 5. the tokens that are actually contractual ─────────────────────────
//
// apps/ios/design.md allows exactly three things across, and calls the paper
// ramp DERIVED rather than copied. So Palette.ground differing from the web
// background is a native decision, not a bug, and shouting about it would
// train everyone to ignore this script. Only the slots in `assert` are held.
//
// theme.ts is the comparison source rather than the CSS because it already
// carries "hex conversions of tokens.css oklch values" for both schemes —
// nothing here has to re-derive OKLCH and disagree by a rounding step.
function themeColours(): Map<string, { light: string; dark: string }> {
  const rel = MAP.tokens.theme as string;
  const out = new Map<string, { light: string; dark: string }>();
  if (!has(rel)) return out;
  const src = read(rel);
  const scheme = (name: 'light' | 'dark') => {
    const start = src.indexOf(`    ${name}: {`);
    if (start < 0) return '';
    const end = src.indexOf('\n    },', start);
    return src.slice(start, end < 0 ? undefined : end);
  };
  const grab = (body: string, path: string): string => {
    const [group, key] = path.split('.');
    if (!key) return body.match(new RegExp(`\\b${group}:\\s*'(#[0-9a-fA-F]{3,8})'`))?.[1] ?? '';
    const block = body.match(new RegExp(`\\b${group}:\\s*\\{[\\s\\S]*?\\}`))?.[0] ?? '';
    return block.match(new RegExp(`\\b${key}:\\s*'(#[0-9a-fA-F]{3,8})'`))?.[1] ?? '';
  };
  const light = scheme('light');
  const dark = scheme('dark');
  for (const row of [...MAP.tokens.assert, ...MAP.tokens.derived] as { theme: string }[]) {
    out.set(row.theme, { light: grab(light, row.theme), dark: grab(dark, row.theme) });
  }
  return out;
}

function swiftPalette(): Map<string, { light: string; dark: string }> {
  const rel = MAP.tokens.swift as string;
  const out = new Map<string, { light: string; dark: string }>();
  if (!has(rel)) return out;
  for (const m of read(rel).matchAll(/static let (\w+) = Color\(light:\s*0x([0-9A-Fa-f]{6}),\s*dark:\s*0x([0-9A-Fa-f]{6})\)/g)) {
    out.set(m[1], { light: `#${m[2].toLowerCase()}`, dark: `#${m[3].toLowerCase()}` });
  }
  return out;
}

function checkTokens() {
  const web = themeColours();
  const ios = swiftPalette();
  if (web.size === 0 || ios.size === 0) {
    add('tokens', 'warn', 'could not read one of the palettes', `${MAP.tokens.theme} / ${MAP.tokens.swift}`);
    return;
  }
  const compare = (rows: { theme: string; swift: string }[], level: Level) => {
    for (const row of rows) {
      const w = web.get(row.theme);
      const i = ios.get(row.swift);
      if (!w || !i || !w.light || !w.dark) continue;
      for (const mode of ['light', 'dark'] as const) {
        if (w[mode] !== i[mode]) {
          add('tokens', level,
            `${mode} ${row.theme} ${w[mode]} ≠ Palette.${row.swift} ${i[mode]}` +
            (level === 'info' ? '  (derived — native choice, not a defect)' : ''),
            `${MAP.tokens.theme} / ${MAP.tokens.swift}`);
        }
      }
    }
  };
  compare(MAP.tokens.assert, 'error');
  compare(MAP.tokens.derived, 'info');
}

// ── run ─────────────────────────────────────────────────────────────────
const { files, label } = changedFiles();
const bands = { adapt: [] as string[], note: [] as string[], ignore: [] as string[], none: [] as string[] };
for (const f of files) bands[band(f)].push(f);

checkTwins(files);
checkVectors();
checkQueries();
checkFamilies();
checkTokens();

const errors = findings.filter((f) => f.level === 'error');
const warns = findings.filter((f) => f.level === 'warn');

if (json) {
  console.log(JSON.stringify({ range: label, bands, findings }, null, 2));
} else {
  console.log(`PARITY CHECK — ${label}`);
  console.log(`  ${files.length} file(s): ${bands.adapt.length} adapt · ${bands.note.length} note · ` +
    `${bands.ignore.length + bands.none.length} ignored`);
  if (bands.adapt.length) console.log(`  adapt: ${bands.adapt.join(', ')}`);
  if (bands.note.length) console.log(`  note:  ${bands.note.join(', ')}`);
  console.log('');
  const icon = { error: 'FAIL', warn: 'WARN', info: 'info' };
  for (const level of ['error', 'warn', 'info'] as Level[]) {
    for (const f of findings.filter((x) => x.level === level)) {
      console.log(`  ${icon[level]}  [${f.check}] ${f.message}`);
      if (f.where) console.log(`        → ${f.where}`);
    }
  }
  if (!findings.length) console.log('  nothing to report');
  console.log('');
  console.log(errors.length ? `PARITY DRIFT — ${errors.length} error(s), ${warns.length} warning(s)` : 'PARITY OK');
}

process.exit(errors.length ? 1 : 0);
