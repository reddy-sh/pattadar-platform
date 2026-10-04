/**
 * MUI colour schemes from the palette pack — what apps/web (and, next,
 * apps/university) build their themes with.
 *
 * It imports nothing from MUI. The caller passes its own `createTheme`, so
 * this package stays dependency-free and each app builds with the MUI it
 * ships.
 *
 * Every scheme goes through `createTheme({ palette }).palette` first. MUI
 * merges its defaults — `common`, `grey`, `action`, and the light/dark
 * variants of every semantic colour — underneath its OWN scheme names only.
 * A scheme declared through `ColorSchemeOverrides` (High Contrast, and any
 * scheme added later) is used exactly as written, and MUI then reads keys a
 * hand-written palette lacks while it derives its CSS variables: a TypeError
 * inside createTheme, at module scope, and every route paints blank white.
 * Building all of them one way removes that trap for the next scheme too.
 *
 * Roles map onto MUI's palette like this; the rest are this pack's own keys
 * and arrive as `--mui-palette-*` CSS variables beside MUI's:
 *
 *   ground, surface          background.default, background.paper
 *   raised                   background.raised
 *   line, lineStrong         divider, dividerStrong
 *   ink, ink2, ink3          text.primary, text.secondary, text.muted
 *   accent (+ on, wash)      primary.main, .contrastText, .container, .onContainer
 *   secondary (+ on, wash)   secondary.*
 *   danger (+ on, wash)      error.main, .contrastText, .container
 *   ok, warn, info (+ on)    success.*, warning.*, info.*
 *   focus, focusHalo         focus, focusHalo
 *   chrome.*, decor.*        chrome.*, decor.*
 */
import type { SchemeEntry, SchemeId } from './palette/registry';
import type { ChromeRoles, DecorRoles } from './palette/roles';

/** The pack's keys on a built MUI palette, beside MUI's own. */
export interface PackPaletteKeys {
  dividerStrong: string;
  focus: string;
  focusHalo: string;
  chrome: ChromeRoles;
  decor?: DecorRoles;
}

/** What MUI's `createPalette` is given for one scheme. */
export function muiPaletteInput(entry: SchemeEntry): Record<string, unknown> {
  const p = entry.palette;
  return {
    mode: entry.mode,
    primary: { main: p.accent, contrastText: p.onAccent },
    secondary: { main: p.secondary, contrastText: p.onSecondary },
    error: { main: p.danger, contrastText: p.onDanger },
    warning: { main: p.warn, contrastText: p.onWarn },
    info: { main: p.info, contrastText: p.onInfo },
    success: { main: p.ok, contrastText: p.onOk },
    background: { default: p.ground, paper: p.surface },
    text: { primary: p.ink, secondary: p.ink2 },
    divider: p.line,
  };
}

type Built = Record<string, unknown> & {
  primary: object;
  secondary: object;
  error: object;
  background: object;
  text: object;
};

/**
 * `colorSchemes` for MUI's `createTheme`, one per registered scheme.
 *
 * @param pack the registry (or anything with its `schemes`)
 * @param createTheme the app's own MUI `createTheme`
 */
export function muiColorSchemes<O, P extends object>(
  pack: { schemes: readonly SchemeEntry[] },
  createTheme: (options: O) => { palette: P },
): Record<SchemeId, { palette: P & PackPaletteKeys }> {
  const out = {} as Record<SchemeId, { palette: P & PackPaletteKeys }>;
  for (const entry of pack.schemes) {
    const p = entry.palette;
    const built = createTheme({ palette: muiPaletteInput(entry) } as unknown as O).palette as unknown as Built;
    const palette = {
      ...built,
      primary: { ...built.primary, container: p.accentWash, onContainer: p.onAccentWash },
      secondary: { ...built.secondary, container: p.secondaryWash, onContainer: p.onSecondaryWash },
      error: { ...built.error, container: p.dangerWash },
      background: { ...built.background, raised: p.raised },
      text: { ...built.text, muted: p.ink3 },
      dividerStrong: p.lineStrong,
      focus: p.focus,
      focusHalo: p.focusHalo,
      chrome: { ...p.chrome },
      ...(p.decor ? { decor: { ...p.decor } } : {}),
    };
    out[entry.id] = { palette: palette as unknown as P & PackPaletteKeys };
  }
  return out;
}
