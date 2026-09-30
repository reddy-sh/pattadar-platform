import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';

import { NAV_CTA, WORDMARK } from './landingContent';
import { PRICING_NAV_LABEL } from '../pricing/pricingContent';

interface MarketingNavProps {
  sectionLinks?: Array<[label: string, id: string]>;
  scrolled?: boolean;
  pricingCurrent?: boolean;
  onSection?: (id: string) => void;
  onSignIn: () => void;
}

/** One marketing header for the landing and Pricing pages.
 *
 * Pricing is one route link in one DOM action group at every width. Landing's
 * eight section controls remain separate because they scroll within `/`.
 */
export function MarketingNav({
  sectionLinks = [],
  scrolled = false,
  pricingCurrent = false,
  onSection,
  onSignIn,
}: MarketingNavProps) {
  const [sectionsOpen, setSectionsOpen] = useState(false);

  return (
    <header className="nav" data-state={scrolled ? 'scrolled' : 'rest'}>
      <div className="nav__inner">
        {pricingCurrent ? (
          <RouterLink to="/" className="nav__brand" aria-label="Pattadar home">
            {WORDMARK.name}<span className="nav__brand-dot">{WORDMARK.dot}</span>
          </RouterLink>
        ) : (
          <span className="nav__brand">
            {WORDMARK.name}<span className="nav__brand-dot">{WORDMARK.dot}</span>
          </span>
        )}
        {sectionLinks.length > 0 && (
          <>
            <button
              type="button"
              className="nav__menu"
              aria-label="Sections"
              aria-controls="marketing-sections"
              aria-expanded={sectionsOpen}
              onClick={() => setSectionsOpen((open) => !open)}
            >
              <MenuRoundedIcon aria-hidden />
            </button>
            <nav
              className="nav__links"
              id="marketing-sections"
              data-open={sectionsOpen ? 'true' : undefined}
              aria-label="Primary"
              onKeyDown={(event) => {
                if (sectionsOpen && event.key === 'Escape') {
                  setSectionsOpen(false);
                  const menu = document.querySelector<HTMLButtonElement>('.nav__menu');
                  if (menu?.getClientRects().length) menu.focus();
                }
              }}
            >
              {sectionLinks.map(([label, id]) => (
                <button key={id} type="button" onClick={() => { setSectionsOpen(false); onSection?.(id); }}>
                  {label}
                </button>
              ))}
            </nav>
          </>
        )}
        <nav className="nav__actions" aria-label="Pricing and account">
          <RouterLink
            to="/pricing"
            className="nav__pricing"
            aria-current={pricingCurrent ? 'page' : undefined}
          >
            {PRICING_NAV_LABEL}
          </RouterLink>
          <button type="button" className="nav__cta" onClick={onSignIn}>
            {NAV_CTA}
          </button>
        </nav>
      </div>
    </header>
  );
}
