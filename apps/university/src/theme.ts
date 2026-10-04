/**
 * Pattadar University's MUI theme · design authority: root design.md
 *
 * The colours are not written here. Every scheme comes from the palette pack
 * in @pattadar/tokens (packages/tokens/src/palette), built exactly as
 * apps/web's theme builds them and keyed on `<html data-scheme>`. University
 * draws with its own stylesheet, not with MUI components: it reads the schemes
 * through the `--color-*` aliases in ../tokens.css. So this theme exists to
 * put every scheme's CSS variables on the page and to hold the saved choice
 * (`useColorScheme`). It opens in Light, the registry's University default.
 *
 * It names no font: University renders no MUI text, and its body names
 * var(--font-sans) for everything (scripts/typography-tests.ts TY-4).
 */
import { createTheme } from '@mui/material/styles';
import { muiColorSchemes, registry } from '@pattadar/tokens';

declare module '@mui/material/styles' {
  interface ColorSchemeOverrides {
    highContrast: true;
    pattadar: true;
  }
}

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data-scheme' },
  defaultColorScheme: registry.defaults.university,
  colorSchemes: muiColorSchemes(registry, createTheme),
});
