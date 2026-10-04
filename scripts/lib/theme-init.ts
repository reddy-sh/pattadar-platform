/**
 * Where each app's theme-init.js lives and how its HTML loads it — shared by
 * scripts/emit-theme-init.ts, which writes them, and scripts/palette-tests.ts,
 * which fails when a committed copy has drifted from the palette pack.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { themeInitSource, type ThemeApp } from '../../packages/tokens/src';

export const ROOT = join(import.meta.dir, '..', '..');

interface Target {
  app: ThemeApp;
  /** The generated script, served from the app's public/ directory. */
  script: string;
  /** HTML that must load it before the app's bundle. */
  html: string[];
}

export const TARGETS: Target[] = [
  { app: 'web', script: 'apps/web/public/theme-init.js', html: ['apps/web/index.html'] },
  // University's prerendered SEO pages are built from its dist index.html
  // (scripts/generateSeo.ts), so they carry the same tag.
  { app: 'university', script: 'apps/university/public/theme-init.js', html: ['apps/university/index.html'] },
];

/** Content hash in the URL, so a changed script is never served from cache. */
export const hashOf = (content: string) => createHash('sha256').update(content).digest('hex').slice(0, 12);

export const scriptTag = (hash: string) => `<script src="/theme-init.js?v=${hash}"></script>`;

const TAG = /<script src="\/theme-init\.js(?:\?v=[0-9a-f]+)?"><\/script>/;

/** `html` loading `tag`: an existing theme-init tag is replaced; otherwise it
 *  goes last in <head>, ahead of the bundle in <body>. */
export function withScriptTag(html: string, tag: string): string {
  if (TAG.test(html)) return html.replace(TAG, tag);
  const head = html.match(/\n([ \t]*)<\/head>/);
  if (!head) throw new Error('no </head> to load theme-init.js from');
  const indent = `${head[1]}  `;
  return html.replace(/\n([ \t]*)<\/head>/, `\n${indent}${tag}\n$1</head>`);
}

export interface Expected {
  path: string;
  content: string;
}

/** Every file theme-init owns, with the content it must have. */
export function expectedFiles(read = (p: string) => readFileSync(join(ROOT, p), 'utf8')): Expected[] {
  const out: Expected[] = [];
  for (const t of TARGETS) {
    const source = themeInitSource(t.app);
    out.push({ path: t.script, content: source });
    const tag = scriptTag(hashOf(source));
    for (const html of t.html) out.push({ path: html, content: withScriptTag(read(html), tag) });
  }
  return out;
}
