import '@fontsource/inter-tight/600.css';
import '@fontsource/inter-tight/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/jetbrains-mono/400.css';
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
