/**
 * A design token's value, resolved, for the places a colour has to cross into
 * Leaflet as a value: a canvas renderer cannot read a stylesheet.
 *
 * It reads <html>, where the scheme is (w360.css declares the `--w-*` slots
 * there), at the moment it is called — so call it when the shape is drawn, and
 * draw again when the scheme changes. MUI writes the new scheme onto <html> in
 * a layout effect, so a component's own passive effect on the choice
 * (useThemeChoice) already reads the new values.
 */
export function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
