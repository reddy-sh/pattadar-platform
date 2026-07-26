import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted Inter (variable) — founder rule: nothing loads from third-party
// URLs. Vite bundles the woff2 files as local assets.
import '@fontsource-variable/inter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { router } from './routes';
import { theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme} defaultMode="light" modeStorageKey="pattadar-mode-v2">
      <CssBaseline enableColorScheme />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
