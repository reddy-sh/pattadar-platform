/**
 * Which colour schemes exist, what they are called, and which one each app
 * opens in.
 *
 * Adding or replacing a palette is one scheme file and one line in `SCHEMES`;
 * scripts/palette-tests.ts then holds it to the role contract and the
 * contrast rules before anything can ship it. The order of the menu, the
 * default per app and the scheme printed output uses are all read from here,
 * never written into a screen.
 */
import { bloomDark, bloomLight } from './bloom';
import { highContrast } from './highContrast';
import { pattadarGold } from './pattadarGold';
import type { SchemeMode, SchemePalette } from './roles';

/** The glyph a theme menu draws beside a scheme. Each client maps the key to
 *  an icon from its own outlined set. */
export type SchemeIcon = 'light' | 'dark' | 'gold' | 'contrast';

interface SchemeEntryInput {
  id: string;
  label: string;
  icon: SchemeIcon;
  mode: SchemeMode;
  /** Position in the theme menu (ascending). */
  menuOrder: number;
  /** Offered in the theme menu. A scheme left out of the menu can still be
   *  opened for review (see `?scheme=` in theme-init). */
  menu: boolean;
  /** The WCAG text level its body ink must reach: AA is 4.5:1, AAA is 7:1.
   *  High Contrast exists for low-vision reading, so it is held to AAA. */
  textLevel: 'AA' | 'AAA';
  palette: SchemePalette;
}

const SCHEMES = [
  { id: 'light', label: 'Light', icon: 'light', mode: 'light', menuOrder: 1, menu: true, textLevel: 'AA', palette: bloomLight },
  { id: 'dark', label: 'Dark', icon: 'dark', mode: 'dark', menuOrder: 2, menu: true, textLevel: 'AA', palette: bloomDark },
  { id: 'pattadar', label: 'Pattadar Gold', icon: 'gold', mode: 'light', menuOrder: 3, menu: true, textLevel: 'AA', palette: pattadarGold },
  { id: 'highContrast', label: 'High Contrast', icon: 'contrast', mode: 'light', menuOrder: 4, menu: true, textLevel: 'AAA', palette: highContrast },
] as const satisfies readonly SchemeEntryInput[];

export type SchemeId = (typeof SCHEMES)[number]['id'];

export interface SchemeEntry extends SchemeEntryInput {
  id: SchemeId;
}

export const schemes: readonly SchemeEntry[] = SCHEMES;

export const registry = {
  schemes,
  /** The scheme each app opens in before anybody has chosen one. Android's
   *  'system' follows the phone's own light/dark setting. */
  defaults: {
    web: 'dark',
    university: 'light',
    android: 'system',
  } satisfies { web: SchemeId; university: SchemeId; android: SchemeId | 'system' },
  /** What a printed or exported page wears: ink on paper. */
  print: 'light' satisfies SchemeId,
} as const;

export function isSchemeId(value: unknown): value is SchemeId {
  return typeof value === 'string' && schemes.some((s) => s.id === value);
}

export function schemeById(id: SchemeId): SchemeEntry {
  const entry = schemes.find((s) => s.id === id);
  if (!entry) throw new Error(`unknown colour scheme: ${id}`);
  return entry;
}

/** The schemes a theme menu offers, in menu order. */
export function menuSchemes(): SchemeEntry[] {
  return schemes.filter((s) => s.menu).sort((a, b) => a.menuOrder - b.menuOrder);
}
