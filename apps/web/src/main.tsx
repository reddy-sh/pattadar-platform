import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The one face (design.md § Typography): Atkinson Hyperlegible 400 and 700,
// and 400 italic for the hero and statement accents. Self-hosted — founder
// rule: nothing loads from third-party URLs; Vite bundles the woff2 files as
// local assets. scripts/typography-tests.ts refuses any other font package.
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
// Bloom design tokens — inert custom properties consumed by site.css. The
// colour schemes themselves come from @pattadar/tokens through theme.ts.
import './styles/tokens.css';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { THEME_STORAGE, themeDefaults, themeStorageManager } from '@pattadar/tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { router } from './routes';
import { theme } from './theme';

// Cognito's callback allowlist knows this app as http://localhost:5173, and
// redirect_uri is matched byte-for-byte. Cognito refuses to register ANY
// http loopback except `localhost`, so 127.0.0.1, [::1], a LAN IP — every
// other dev origin is un-allowlistable and dies on the hosted UI's error
// page. In dev, force the ONE origin that can work before anything renders
// or stores per-origin OAuth state (a redirect_uri that doesn't match the
// browsing origin also loses the state on return). `localhost` itself is
// the only host left untouched, so this can never loop.
if (import.meta.env.DEV && window.location.hostname !== 'localhost') {
  window.location.replace(
    `${window.location.protocol}//localhost:${window.location.port}` +
      window.location.pathname + window.location.search + window.location.hash);
}

const WEB_THEME = themeDefaults('web');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* One saved choice for every theme menu (design.md § Theme choice and
        persistence). MUI keeps it under THEME_STORAGE; theme-init.js, loaded
        in index.html ahead of this bundle, has already put it on
        <html data-scheme> and painted its ground, and carried the old
        `w360.scheme` key into it once. The defaults are the registry's, here
        and in that script alike. `noSsr` lets the menus read the choice on
        their first render. Marketing stays dark independently: its wrapper
        carries its own data-scheme="dark". */}
    <ThemeProvider
      theme={theme}
      defaultMode={WEB_THEME.mode}
      modeStorageKey={THEME_STORAGE.mode}
      colorSchemeStorageKey={THEME_STORAGE.scheme}
      storageManager={themeStorageManager('web')}
      noSsr
      disableTransitionOnChange
    >
      <CssBaseline enableColorScheme />
      <QueryClientProvider client={queryClient}>
        {/* The outermost net. Per-route boundaries in routes.tsx contain a
            screen that throws; this one catches what happens above them —
            AuthProvider, the router itself — which otherwise took the page
            down to a blank document with no way back. */}
        <ErrorBoundary what="Pattadar">
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
