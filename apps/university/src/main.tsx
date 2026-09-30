// The one face (root design.md § Typography), self-hosted.
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/atkinson-hyperlegible/400-italic.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '../tokens.css';
import './styles.css';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { UniversityProvider } from './state/UniversityProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UniversityProvider>
          <App />
        </UniversityProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
