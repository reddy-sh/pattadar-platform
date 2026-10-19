import type { Theme } from '@mui/material/styles';

/** The keyboard focus ring from the palette's focus token; shown instantly, never animated. */
export function focusRingSx(theme: Theme) {
  const palette = (theme.vars ?? theme).palette;
  return {
    '&:focus-visible': {
      outline: `2px solid ${palette.focus ?? palette.primary.main}`,
      outlineOffset: 2,
    },
  } as const;
}

/** Synchronous read so motion is resolved before a scene mounts (design.md § Motion). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
