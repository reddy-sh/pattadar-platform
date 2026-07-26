import 'src/global.css';

import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';

import ThemeProvider from 'src/theme';
import { primaryFont } from 'src/theme/typography';

import ProgressBar from 'src/components/progress-bar';
import { MotionLazy } from 'src/components/animate/motion-lazy';
import SnackbarProvider from 'src/components/snackbar/snackbar-provider';
import { SettingsDrawer, SettingsProvider } from 'src/components/settings';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={primaryFont.className} suppressHydrationWarning>
      <body>
        {/* Applies the persisted light/dark class before hydration (no flash). */}
        <InitColorSchemeScript attribute="class" defaultMode="light" />

        <SettingsProvider
          defaultSettings={{
            themeMode: 'light', // 'light' | 'dark'
            themeContrast: 'default', // 'default' | 'bold'
            themeLayout: 'vertical', // 'vertical' | 'horizontal' | 'mini'
            themeStretch: false,
          }}
        >
          <ThemeProvider>
            <MotionLazy>
              <SnackbarProvider>
                <SettingsDrawer />
                <ProgressBar />
                {children}
              </SnackbarProvider>
            </MotionLazy>
          </ThemeProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
