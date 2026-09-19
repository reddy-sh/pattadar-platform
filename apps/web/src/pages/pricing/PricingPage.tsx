import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';

import { isAuthMocked, useAuth } from '../../auth/AuthProvider';
import { MarketingNav } from '../landing/MarketingNav';
import '../../styles/site.css';
import { AI_PACKS, PRICING, PUBLIC_PLANS, STORAGE_ADDONS } from './pricingContent';

function usePricingMetadata() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Pricing · Pattadar';

    const description = document.createElement('meta');
    description.name = 'description';
    description.content = 'Pattadar plans for family land records, holdings, secure document storage and optional AI credits.';
    document.head.appendChild(description);

    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = `${window.location.origin}/pricing`;
    document.head.appendChild(canonical);

    return () => {
      document.title = previousTitle;
      description.remove();
      canonical.remove();
    };
  }, []);
}

export function PricingPage() {
  usePricingMetadata();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const startSignIn = () => navigate(isAuthMocked || isAuthenticated ? '/app' : '/login');

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="dark site pricing-page">
      <div className="ambient" aria-hidden>
        <div className="bloom bloom--1" />
        <div className="bloom bloom--2" />
        <div className="grain" />
      </div>

      <MarketingNav pricingCurrent scrolled={scrolled} onSignIn={startSignIn} />

      <main className="pricing-main">
        <section className="pricing-hero" aria-labelledby="pricing-title">
          <p className="overline">{PRICING.eyebrow}</p>
          <h1 id="pricing-title" className="pricing-title">{PRICING.title}</h1>
          <p className="pricing-lede">{PRICING.lead}</p>
          <p className="pricing-availability">{PRICING.availability}</p>
          <RouterLink className="cta cta--primary cta--lg" to="/signup">
            {PRICING.startFree}
          </RouterLink>
        </section>

        <section className="pricing-section" aria-labelledby="plans-heading">
          <div className="pricing-section__head">
            <p className="overline">Platform plans</p>
            <h2 id="plans-heading" className="section-h">{PRICING.plansHeading}</h2>
            <p className="pricing-note">{PRICING.annualNote}</p>
          </div>
          <ul className="pricing-grid">
            {PUBLIC_PLANS.map((plan) => (
              <li key={plan.code} className={`pricing-card${plan.free ? ' pricing-card--free' : ''}`}>
                <p className="badge">{plan.status}</p>
                <h3 className="pricing-card__name">{plan.name}</h3>
                <p className="pricing-card__price">{plan.monthly}</p>
                <p className="pricing-card__annual">{plan.annual}</p>
                <ul className="pricing-card__limits">
                  <li>{plan.groups}</li>
                  <li>{plan.holdings}</li>
                  <li>{plan.storage}</li>
                  <li>{plan.versions}</li>
                  <li>No included AI</li>
                </ul>
              </li>
            ))}
          </ul>
          <p className="pricing-note pricing-note--wide">{PRICING.holdingsNote}</p>
        </section>

        <section className="pricing-section pricing-section--ruled" aria-labelledby="included-heading">
          <div>
            <p className="overline">One safety standard</p>
            <h2 id="included-heading" className="section-h">{PRICING.securityHeading}</h2>
          </div>
          <p className="pricing-section__body">{PRICING.securityBody}</p>
        </section>

        <section className="pricing-section" aria-labelledby="addons-heading">
          <div className="pricing-section__head">
            <p className="overline">Optional usage</p>
            <h2 id="addons-heading" className="section-h">Storage and AI add-ons</h2>
          </div>
          <div className="pricing-addons">
            <article className="pricing-addon">
              <h3>{PRICING.storageHeading}</h3>
              <dl>
                {STORAGE_ADDONS.map(([label, price]) => (
                  <div key={label}><dt>{label}</dt><dd>{price}</dd></div>
                ))}
              </dl>
              <p>Versions and files in Trash count while they remain stored.</p>
            </article>
            <article className="pricing-addon">
              <h3>{PRICING.aiHeading}</h3>
              <p>{PRICING.aiBody}</p>
              <dl>
                {AI_PACKS.map(([label, price]) => (
                  <div key={label}><dt>{label}</dt><dd>{price}</dd></div>
                ))}
              </dl>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-foot pricing-foot">
        <p className="footer__line">© {new Date().getFullYear()} Pattadar</p>
        <nav aria-label="Legal">
          <RouterLink to="/privacy">{PRICING.footerPrivacy}</RouterLink>
          <RouterLink to="/terms">{PRICING.footerTerms}</RouterLink>
          <a href="mailto:grievance@pattadar.com">{PRICING.footerGrievance}</a>
        </nav>
      </footer>
    </div>
  );
}
