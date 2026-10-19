import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Emotion (MUI's `sx` and `styled`) logs a console.error the first time it
 *  inserts a rule using `:first-child`, `:nth-child` or `:nth-last-child`,
 *  because those are unsafe under server rendering. The app does not server
 *  render, but the error still fires in the browser, and the sealed e2e suite
 *  fails any page that logs one — every assistant answer did, through
 *  Markdown.tsx. Plain CSS files are not affected; only TS/TSX is scanned. */
const UNSAFE = /:(first-child|nth-child|nth-last-child)\b/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

test('no TS/TSX style object uses a selector emotion warns about', () => {
  const offenders = sources(import.meta.dir).flatMap((path) =>
    readFileSync(path, 'utf8').split('\n')
      .map((line, i) => ({ line, at: `${path}:${i + 1}` }))
      .filter(({ line }) => UNSAFE.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
      .map(({ at }) => at));
  expect(offenders).toEqual([]);
});
