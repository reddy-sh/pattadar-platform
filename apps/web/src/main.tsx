import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted Bloom type stack (design.md at repo root) — founder rule:
// nothing loads from third-party URLs. Vite bundles the woff2 files as
// local assets. Subset weights only — do not import full families.
import '@fontsource/inter-tight/600.css';
import '@fontsource/inter-tight/700.css';
import '@fontsource/inter-tight/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
// Bloom design tokens — inert custom properties consumed by site.css and
// referenced (as hex conversions) by theme.ts.
import './styles/tokens.css';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Dark is the canonical Bloom scheme (design.md § Theme) — the landing
        page is permanently dark, so booting the app in light broke the brand
        at the exact moment of sign-in. Light stays fully supported via the
        header toggle; the user's choice persists in modeStorageKey. */}
    <ThemeProvider theme={theme} defaultMode="dark" modeStorageKey="pattadar-mode-v2">
      <CssBaseline enableColorScheme />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
