/**
 * Shared source scanning for the static guard scripts (`scripts/*-tests.ts`).
 *
 * Guards read intent, not commentary: a comment must never satisfy or fail a
 * check. These are scanners rather than regexes for the reason written up in
 * scripts/ux-guards.ts — a `/*` inside a string (`'image/*'`) once opened a
 * "comment" that swallowed eighty-eight lines, and every assertion about that
 * code passed by inspecting nothing.
 *
 * Both strippers keep every newline, so a line number taken from the stripped
 * text is the line number in the file.
 *
 * scripts/ux-guards.ts, a11y-web-tests.ts and provenance-tests.ts still carry
 * their own copies of the TS scanner; moving them here is listed in
 * docs/specs/TODO-one-platform.md. New guards import this module.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Strip `//` and block comments from TS/TSX; strings and templates survive. */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Strip block comments from CSS. `//` is not a CSS comment — `url(https://…)`
 *  must survive — so this is not the TS scanner. */
export function stripCssComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Every file under `dir` whose path matches, skipping dependencies, build
 *  output and unit tests (a test may legitimately spell a forbidden value in
 *  order to assert it is refused). */
export function walk(dir: string, match: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, match, out);
    else if (match.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** 1-based line number of `index` in `src`. */
export function lineAt(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i += 1) if (src[i] === '\n') line += 1;
  return line;
}
