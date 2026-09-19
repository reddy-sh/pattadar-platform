import { Link as RouterLink } from 'react-router';

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
 * seven section controls remain separate because they scroll within `/`.
 */
export function MarketingNav({
  sectionLinks = [],
  scrolled = false,
  pricingCurrent = false,
  onSection,
  onSignIn,
}: MarketingNavProps) {
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
          <nav className="nav__links" aria-label="Primary">
            {sectionLinks.map(([label, id]) => (
              <button key={id} type="button" onClick={() => onSection?.(id)}>
                {label}
              </button>
            ))}
          </nav>
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
