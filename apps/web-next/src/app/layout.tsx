// Must run before amazon-cognito-identity-js loads anywhere in the tree
// (needs a Node-style `global`) — see controller notes on task B3.
import 'src/lib/global-polyfill';

import 'src/global.css';

import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';

import ThemeProvider from 'src/theme';
import { primaryFont } from 'src/theme/typography';

import { AuthProvider } from 'src/auth/AuthProvider';
import { QueryProvider } from 'src/lib/QueryProvider';
import ProgressBar from 'src/components/progress-bar';
import { MotionLazy } from 'src/components/animate/motion-lazy';
import SnackbarProvider from 'src/components/snackbar/snackbar-provider';
import { SettingsDrawer, SettingsProvider } from 'src/components/settings';
import { ToastProvider } from 'src/components/kit';

// ----------------------------------------------------------------------

export const viewport = {
  themeColor: '#1976d2',
  width: 'device-width',
  initialScale: 1,
};

export const metadata = {
  title: 'Pattadar',
  description:
    'Pattadar — land-records portfolio management for Andhra Pradesh. Track parcels, deeds, passbooks, valuations and family holdings in one secure workspace.',
  keywords: 'pattadar,land records,andhra pradesh,parcels,deeds,portfolio',
  manifest: '/manifest.json',
  // SVG-only favicon (no rasterizer available in this environment; a PNG
  // apple-touch-icon can be added later from the same monogram).
  icons: [{ rel: 'icon', type: 'image/svg+xml', url: '/favicon/favicon.svg' }],
  openGraph: {
    title: 'Pattadar',
    description:
      'Land-records portfolio management for Andhra Pradesh — parcels, deeds, passbooks, valuations and family holdings.',
    siteName: 'Pattadar',
    type: 'website',
  },
};

// ----------------------------------------------------------------------

// SettingsContext is the source of truth, while MUI's initializer reads its
// own keys. Mirror the canonical (or legacy) persisted choice before MUI runs
// so the first painted frame already uses the requested scheme.
const THEME_BOOTSTRAP_SCRIPT = `
  (() => {
    try {
      const stored = window.localStorage.getItem('settings');
      const settings = stored ? JSON.parse(stored) : {};
      const canonical = ['light', 'dark', 'highContrast'].includes(settings.themeChoice)
        ? settings.themeChoice
        : null;
      const choice = canonical
        || (settings.themeContrast === 'bold'
          ? 'highContrast'
          : settings.themeMode === 'dark' ? 'dark' : 'light');

      if (choice === 'dark') {
        window.localStorage.setItem('mui-mode', 'dark');
        window.localStorage.setItem('mui-color-scheme-dark', 'dark');
      } else {
        window.localStorage.setItem('mui-mode', 'light');
        window.localStorage.setItem(
          'mui-color-scheme-light',
          choice === 'highContrast' ? 'highContrast' : 'light'
        );
      }
    } catch (_) {
      // Invalid or unavailable storage falls through to MUI's light default.
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={primaryFont.className} suppressHydrationWarning>
      <body>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        {/* Applies the mirrored MUI theme class before hydration (no flash). */}
        <InitColorSchemeScript attribute="class" defaultMode="light" />

        <SettingsProvider
          defaultSettings={{
            // Legacy fields remain only as migration/reset fallbacks. Deliberately
            // omit themeChoice so persisted legacy values cannot be masked.
            themeMode: 'light',
            themeContrast: 'default',
            themeLayout: 'vertical', // 'vertical' | 'horizontal' | 'mini'
            themeStretch: false,
          }}
        >
          <ThemeProvider>
            <MotionLazy>
              <SnackbarProvider>
                <SettingsDrawer />
                <ProgressBar />
                <QueryProvider>
                  {/* The kit's one snackbar host. `useToast` throws without it,
                      and ExportAction and useRowSelection both call it — so it
                      mounts here, above RequireAuth, rather than under /app:
                      a public page that grows a toast must not have to
                      remember to add a provider. */}
                  <ToastProvider>
                    <AuthProvider>{children}</AuthProvider>
                  </ToastProvider>
                </QueryProvider>
              </SnackbarProvider>
            </MotionLazy>
          </ThemeProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
