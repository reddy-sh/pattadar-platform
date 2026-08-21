/**
 * Shared frame for the public legal placeholder pages (/privacy, /terms):
 * wordmark bar linking home, narrow content column, slim footer.
 *
 * Bloom frame (design.md): Long Document voice — measure-limited column on
 * the dark warm paper. Wraps in `.dark.site` so MUI children resolve dark
 * vars. Copy unchanged.
 */
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import '../../styles/site.css';

export function LegalLayout({ children }: { children: ReactNode }) {
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
      <main className="legalMain">{children}</main>
      <footer className="site-foot">
        <p className="footer__line">
          © {new Date().getFullYear()} Pattadar · Grievance:{' '}
          <a href="mailto:grievance@pattadar.com">grievance@pattadar.com</a>
        </p>
      </footer>
    </div>
  );
}
