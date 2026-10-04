# @pattadar/tokens

Pattadar's design tokens. Buildless: consumers import the TypeScript source.

## Colour schemes (`src/palette`)

Every colour the apps paint is meant to come from here. design.md § Theme
describes the schemes.

- `roles.ts` — the roles every scheme defines (ground, surface, ink, accent,
  danger, focus, the header's `chrome` colours, chart series, status hues…),
  named by job rather than hue.
- `bloom.ts` (Bloom Light and Dark), `pattadarGold.ts` (the signature light
  scheme, with a charcoal header of its own) and `highContrast.ts` — the
  schemes. Values are sRGB hex so MUI can do its channel maths; Bloom notes the
  oklch each value was converted from.
- `registry.ts` — which schemes exist, their menu labels and order, each app's
  default (web Dark, University Light, Android follows the phone) and the
  scheme printed output uses.
- `contrast.ts` and `gate.ts` — WCAG contrast and the rules every scheme is
  held to.

### Changing or adding a palette

Edit the scheme file, or add one and a line to `SCHEMES` in `registry.ts`,
then run:

```sh
bun test packages/tokens
bun run scripts/palette-tests.ts
```

`scripts/palette-tests.ts` (in the CI guard loop) checks every registered
scheme has every role and clears the contrast floors, and prints the report to
review. `src/palette/palette.test.ts` pins what the apps painted before the
pack existed; a value that changes on purpose is added to its `CHANGES` list
with the reason.

## Also here

- `typography.fontFamily` — the one font stack, the same value as
  `--font-sans` (`scripts/typography-tests.ts` checks the copies).
- `spacing` (4px grid), `radii`, `motion`.

## Consumers today

- apps/web — every colour. `theme.ts` builds MUI's schemes with
  `muiColorSchemes`; W360 (`w360.css`, `--w-*`) and the marketing pages
  (`site.css`, `--color-*` on `.site`) read them as aliases of MUI's CSS
  variables; the chart hooks (components/charts/chartColors.ts) read the
  active scheme's `chart` and `status`.
- apps/mobile — `tokens.spacing` and `tokens.radii`.

- apps/university — every colour, the same way: `src/theme.ts` builds the
  schemes with `muiColorSchemes`, `tokens.css` aliases University's
  `--color-*` names to MUI's variables, and the switcher uses `choice.ts`
  and `themeStorageManager`.

The Expo theme moves onto the palette in the step tracked in
docs/specs/TODO-one-platform.md. Until it does, apps/mobile/src/theme/paper.ts
carries its own values.

## Scripts

- `bun run typecheck` — `tsc --noEmit` (unit tests are excluded and run with
  `bun test packages/tokens`)
- `bun run build` — no-op (source package)
