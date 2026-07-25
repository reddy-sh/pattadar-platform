# @pattadar/tokens

Single source of truth for design tokens: colour (light and dark schemes), typography, spacing, radii, elevation. Buildless — consumers import the TypeScript source directly.

The palette is a placeholder brand direction (deep green primary, warm neutral surfaces). Adjust it once in `src/index.ts`; both UI heads pick it up.

## How consumers use it

- **apps/web** — builds the MUI theme from these tokens: `createTheme({ palette: { primary: { main: light.primary } }, ... })`. Vite compiles the TS source in place; no package build step.
- **apps/mobile** — builds the React Native Paper theme (MD3 light/dark) from the same tokens. Metro compiles the TS source in place.

Neither theme should hard-code a colour, size, or radius that exists here.

## Scripts

- `bun run typecheck` — `tsc --noEmit`
- `bun run build` — no-op (source package)
