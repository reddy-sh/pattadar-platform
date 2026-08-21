/**
 * Shared frame for the public auth pages (/login, /signup, /forgot-password):
 * wordmark bar linking home, a centred card, slim footer. No app shell —
 * these pages are public and mobile-friendly. All auth happens on OUR pages
 * (founder rule: customers never see a non-pattadar.com URL).
 *
 * Bloom frame (design.md): the page wraps itself in `.dark.site`, so the MUI
 * form children resolve the DARK scheme's CSS vars regardless of the user's
 * /app mode — the marketing surface is permanently dark. Copy unchanged.
 */
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import '../../styles/site.css';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="dark site">
      <div className="ambient" aria-hidden>
        <div className="bloom bloom--1" />
        <div className="grain" />
      </div>
      <header className="site-bar">
        <RouterLink to="/" className="nav__brand">
          Pattadar
        </RouterLink>
      </header>
      <main className="authMain">
        <div className="authCard">
          <h1 className="authCard__title">{title}</h1>
          {subtitle && <p className="authCard__subtitle">{subtitle}</p>}
          {children}
        </div>
      </main>
      <footer className="site-foot">
        <p className="footer__line">
          © {new Date().getFullYear()} Pattadar ·{' '}
          <RouterLink to="/privacy">Privacy</RouterLink> · <RouterLink to="/terms">Terms</RouterLink>
        </p>
      </footer>
    </div>
  );
}
