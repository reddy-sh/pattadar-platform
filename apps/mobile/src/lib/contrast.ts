/**
 * WCAG relative luminance (H-9): PersonAvatar hardcoded white initials over a
 * per-name generated hue, which can be light enough to fail contrast. Picking
 * black vs. white needs the actual luminance of that generated color, not a guess.
 */
export function relLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
