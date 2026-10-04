// The one face (root design.md § Typography), self-hosted.
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
import { ThemeProvider } from '@mui/material/styles';
import { THEME_STORAGE, themeDefaults, themeStorageManager } from '@pattadar/tokens';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '../tokens.css';
import './styles.css';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { UniversityProvider } from './state/UniversityProvider';
import { theme } from './theme';

const UNIVERSITY_THEME = themeDefaults('university');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* The saved colour scheme, kept by MUI under THEME_STORAGE — the same
        keys and defaults theme-init.js (index.html, ahead of this bundle)
        has already applied. No CssBaseline: University's own stylesheet is
        its base, and theme-init's rules give <html> each scheme's ground and
        color-scheme. */}
    <ThemeProvider
      theme={theme}
      defaultMode={UNIVERSITY_THEME.mode}
      modeStorageKey={THEME_STORAGE.mode}
      colorSchemeStorageKey={THEME_STORAGE.scheme}
      storageManager={themeStorageManager('university')}
      noSsr
      disableTransitionOnChange
    >
      <BrowserRouter>
        <AuthProvider>
          <UniversityProvider>
            <App />
          </UniversityProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
