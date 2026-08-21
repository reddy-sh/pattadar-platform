/**
 * Public landing page for pattadar.com — Bloom redesign (Hallmark
 * studied-DNA from usehallmark.com/examples/hyperlane, locked in design.md
 * at the repo root). Dark warm paper, amber accent ≤5%, Inter Tight display
 * with an Instrument Serif italic accent phrase, mono data strips, hairline
 * rules, ambient blooms. Styling lives in src/styles/site.css + tokens.css.
 *
 * COPY IS BYTE-FROZEN — every visible string comes from landingContent.ts
 * (design.md § Copy freeze). This file may restyle, never reword.
 *
 * Founder rules kept: plain-language copy only (no fabricated testimonials,
 * stats or logos), self-hosted everything, links never open new tabs, and
 * sign-in always goes to OUR native /login page.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { useNavigate } from 'react-router';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import DocumentScannerOutlinedIcon from '@mui/icons-material/DocumentScannerOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SquareFootOutlinedIcon from '@mui/icons-material/SquareFootOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import TravelExploreOutlinedIcon from '@mui/icons-material/TravelExploreOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { isAuthMocked, useAuth } from '../../auth/AuthProvider';
import '../../styles/site.css';
import {
  AI,
  FAQ,
  FEATURES,
  FEATURES_HEAD,
  FINAL_CTA,
  FOOTER,
  HERO,
  HOW,
  NAV_CTA,
  NAV_LINKS,
  PILLARS,
  PRODUCT_FRAME,
  ROADMAP,
  STAGES,
  STORY,
  TRUST_ITEMS,
  WALLET,
  WORDMARK,
} from './landingContent';

/* Icons stay page-side, keyed by the content module's names — the content
 * module is pure data (design.md § Copy freeze). */
const ICONS: Record<string, ReactElement> = {
  lock: <LockOutlinedIcon />,
  visibilityOff: <VisibilityOffOutlinedIcon />,
  manageAccounts: <ManageAccountsOutlinedIcon />,
  dashboard: <DashboardOutlinedIcon />,
  documentScanner: <DocumentScannerOutlinedIcon />,
  folder: <FolderOutlinedIcon />,
  diversity: <Diversity3OutlinedIcon />,
  healthSafety: <HealthAndSafetyOutlinedIcon />,
  travelExplore: <TravelExploreOutlinedIcon />,
  calculate: <CalculateOutlinedIcon />,
  factCheck: <FactCheckOutlinedIcon />,
  article: <ArticleOutlinedIcon />,
  straighten: <StraightenOutlinedIcon />,
  historyEdu: <HistoryEduOutlinedIcon />,
  squareFoot: <SquareFootOutlinedIcon />,
  map: <MapOutlinedIcon />,
  gavel: <GavelOutlinedIcon />,
};

/** Rotating word — amber emphasis, cycles with a rise-in animation.
 * Pauses while hovered/focused (WCAG 2.2.2) and never rotates under
 * prefers-reduced-motion. */
function FlipWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % words.length), 2400);
    return () => clearInterval(t);
  }, [words.length, paused]);
  return (
    <em
      key={words[i]}
      className="hero__flip"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {words[i]}
    </em>
  );
}

/** Scroll-reveal wrapper — fades sections up as they enter the viewport. */
function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const ob = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          ob.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return (
    <div ref={ref} className={shown ? 'reveal is-shown' : 'reveal'}>
      {children}
    </div>
  );
}

const scrollToId = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  // In mock mode (or when already signed in) the button goes straight to
  // /app; otherwise to OUR native /login page — never an external URL.
  const startSignIn = () => {
    navigate(isAuthMocked || isAuthenticated ? '/app' : '/login');
  };

  // N10 scroll-morph: full-width hairline bar at rest, floating pill once
  // the page scrolls.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="dark site">
      {/* ambient atmospheric backdrop */}
      <div className="ambient" aria-hidden>
        <div className="bloom bloom--1" />
        <div className="bloom bloom--2" />
        <div className="grain" />
      </div>

      {/* ── nav · N10 scroll-morph ─────────────────────────────────── */}
      <header className="nav" data-state={scrolled ? 'scrolled' : 'rest'}>
        <div className="nav__inner">
          <span className="nav__brand">
            {WORDMARK.name}
            <span className="nav__brand-dot">{WORDMARK.dot}</span>
          </span>
          <nav className="nav__links" aria-label="Primary">
            {NAV_LINKS.map(([label, id]) => (
              <button key={id} type="button" onClick={() => scrollToId(id)}>
                {label}
              </button>
            ))}
          </nav>
          <button type="button" className="nav__cta" onClick={startSignIn}>
            {NAV_CTA}
          </button>
        </div>
      </header>

      <main>
        {/* ── hero · Marquee ─────────────────────────────────────────── */}
        <section className="hero" aria-labelledby="hero-h">
          <p className="hero__rail">
            <span className="hero__rail-dot" aria-hidden />
            {HERO.badge}
          </p>
          <h1 className="hero__display" id="hero-h">
            <span className="hero__line">{HERO.h1Line1}</span>
            <span className="hero__line">
              <em>{HERO.h1Line2}</em>
            </span>
          </h1>
          <p className="hero__lead">
            {HERO.leadPrefix}
            <FlipWord words={HERO.flipWords} />
            {HERO.leadSuffix}
          </p>
          <div className="hero__ctas">
            <button type="button" className="cta cta--primary cta--lg" onClick={startSignIn}>
              {HERO.ctaPrimary}
            </button>
            <button type="button" className="cta cta--ghost cta--lg" onClick={startSignIn}>
              {HERO.ctaSecondary}
            </button>
          </div>
          <ul className="hero__meta">
            {TRUST_ITEMS.map((item) => (
              <li key={item.text} className="hero__meta-cell">
                {ICONS[item.icon]}
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* spec card — the portfolio sample, calmed */}
        <section className="section" aria-label={PRODUCT_FRAME.overline}>
          <div className="spec">
            <p className="overline">{PRODUCT_FRAME.overline}</p>
            <p className="spec__label">{PRODUCT_FRAME.costLabel}</p>
            <div className="spec__figure-row">
              <p className="spec__figure">{PRODUCT_FRAME.costValue}</p>
              <p className="spec__delta">{PRODUCT_FRAME.costDelta}</p>
            </div>
            <p className="spec__counts">{PRODUCT_FRAME.countsLine}</p>
            <p className="spec__honesty">{PRODUCT_FRAME.honesty}</p>
            <ul className="spec__rows">
              {PRODUCT_FRAME.parcels.map(([k, v]) => (
                <li key={k} className="spec__row">
                  <span className="spec__row-k">{k}</span>
                  <span className="spec__row-v">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── story · hairline timetable band ────────────────────────── */}
        <section id="story" className="section band" aria-labelledby="story-h">
          <Reveal>
            <div className="section__inner">
              <header className="section-head">
                <p className="section-eyebrow">{STORY.eyebrow}</p>
                <h2 className="section-h" id="story-h">
                  {STORY.h2}
                </h2>
                <p className="section-lead">{STORY.intro}</p>
              </header>
              <ul className="rows rows--two">
                {STORY.entries.map((e) => (
                  <li key={e.t} className="rows__row">
                    <h3 className="rows__label">{e.t}</h3>
                    <p className="rows__note">{e.b}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>

        {/* ── features · card grid ───────────────────────────────────── */}
        <section id="features" className="section" aria-labelledby="features-h">
          <div className="section__inner">
            <header className="section-head">
              <p className="section-eyebrow">{FEATURES_HEAD.eyebrow}</p>
              <h2 className="section-h" id="features-h">
                {FEATURES_HEAD.h2}
              </h2>
            </header>
            <ul className="grid grid--bento">
              {FEATURES.map((f) => (
                <li key={f.title} className={f.wide ? 'card card--wide' : 'card'}>
                  <div className="card__meta">{ICONS[f.icon]}</div>
                  <h3 className="card__h">{f.title}</h3>
                  <p className="card__sub">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Pattadar AI · split ────────────────────────────────────── */}
        <section id="ai" className="section" aria-labelledby="ai-h">
          <Reveal>
            <div className="section__inner">
              <header className="section-head">
                <p className="section-eyebrow">{AI.eyebrow}</p>
                <h2 className="section-h" id="ai-h">
                  {AI.h2}
                </h2>
                <p className="section-lead">{AI.lead}</p>
              </header>
              <div className="split">
                <div className="split__points">
                  {AI.points.map(([t, b]) => (
                    <div key={t} className="point">
                      <SmartToyOutlinedIcon />
                      <div>
                        <h3 className="point__h">{t}</h3>
                        <p className="point__b">{b}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="convo">
                  <p className="overline">{AI.convoOverline}</p>
                  <div className="convo__thread">
                    {AI.convo.map((m) => (
                      <p key={m.text} className={`bubble bubble--${m.role}`}>
                        {m.text}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── how it works · numbered timetable rows ─────────────────── */}
        <section id="how" className="section band" aria-labelledby="how-h">
          <div className="section__inner">
            <header className="section-head">
              <p className="section-eyebrow">{HOW.eyebrow}</p>
              <h2 className="section-h" id="how-h">
                {HOW.h2}
              </h2>
            </header>
            <ul className="rows">
              {HOW.steps.map((step) => (
                <li key={step.n} className="rows__row">
                  <span className="rows__num">{step.n}</span>
                  <h3 className="rows__label">{step.title}</h3>
                  <p className="rows__note">{step.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 6 pillars · card grid with copy's own numerals ─────────── */}
        <section id="pillars" className="section" aria-labelledby="pillars-h">
          <div className="section__inner">
            <header className="section-head">
              <p className="section-eyebrow">{PILLARS.eyebrow}</p>
              <h2 className="section-h" id="pillars-h">
                {PILLARS.h2}
              </h2>
              <p className="section-lead">{PILLARS.intro}</p>
            </header>
            <ul className="grid grid--three">
              {PILLARS.items.map((p, i) => (
                <li key={p.title} className="card">
                  <div className="card__meta">
                    {ICONS[p.icon]}
                    <span className="card__num">{'0' + (i + 1)}</span>
                  </div>
                  <h3 className="card__h">{p.title}</h3>
                  <p className="card__sub">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── stages · ruled columns ─────────────────────────────────── */}
        <section className="section" aria-labelledby="stages-h">
          <div className="section__inner">
            <header className="section-head">
              <p className="section-eyebrow">{STAGES.eyebrow}</p>
              <h2 className="section-h" id="stages-h">
                {STAGES.h2}
              </h2>
              <p className="section-lead">{STAGES.intro}</p>
            </header>
            <ul className="cols">
              {STAGES.items.map((c, i) => (
                <li key={c.stage} className="cols__col">
                  <span className="card__type">
                    {STAGES.stageLabel} {i + 1}
                  </span>
                  <h3 className="card__h">{c.stage}</h3>
                  <p className="card__sub">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── wallet teaser · hairline band ──────────────────────────── */}
        <section className="wallet band" aria-labelledby="wallet-h">
          <div className="wallet__inner">
            <AccountBalanceWalletOutlinedIcon />
            <div className="wallet__title-row">
              <h2 className="wallet__h" id="wallet-h">
                {WALLET.title}
              </h2>
              <span className="badge">{WALLET.chip}</span>
            </div>
            <p className="wallet__b">{WALLET.body}</p>
          </div>
        </section>

        {/* ── roadmap · dashed tba cards ─────────────────────────────── */}
        <section id="services" className="section" aria-labelledby="services-h">
          <div className="section__inner">
            <header className="section-head">
              <p className="section-eyebrow">{ROADMAP.eyebrow}</p>
              <h2 className="section-h" id="services-h">
                {ROADMAP.h2}
              </h2>
            </header>
            <ul className="grid grid--four">
              {ROADMAP.items.map((sv) => (
                <li key={sv.title} className="card card--tba">
                  <span className="badge">{ROADMAP.chip}</span>
                  <h3 className="card__h">{sv.title}</h3>
                  <p className="card__sub">{sv.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── FAQ · hairline details rows ────────────────────────────── */}
        <section id="faq" className="section" aria-labelledby="faq-h">
          <div className="section__inner">
            <header className="section-head">
              <p className="section-eyebrow">{FAQ.eyebrow}</p>
              <h2 className="section-h" id="faq-h">
                {FAQ.h2}
              </h2>
            </header>
            <div className="faq__list">
              {FAQ.items.map(([q, a]) => (
                <details key={q} className="faq__item">
                  <summary>
                    <span>{q}</span>
                    <span className="faq__chev" aria-hidden />
                  </summary>
                  <p className="faq__a">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── statement close (Ft5) + footer ───────────────────────────── */}
      <footer className="close">
        <div className="close__inner">
          <h2 className="statement">
            {FINAL_CTA.h2Prefix}
            <em>{FINAL_CTA.h2Em}</em>
          </h2>
          <p className="close__lead">{FINAL_CTA.body}</p>
          <button type="button" className="cta cta--primary cta--lg" onClick={startSignIn}>
            {FINAL_CTA.cta}
          </button>
          <div className="footer__meta">
            <p className="footer__line">
              © {new Date().getFullYear()}
              {FOOTER.copyrightTail}
            </p>
            <ul className="footer__links">
              <li>
                <RouterLink to="/privacy">{FOOTER.privacy}</RouterLink>
              </li>
              <li>
                <RouterLink to="/terms">{FOOTER.terms}</RouterLink>
              </li>
              <li>
                <a href={FOOTER.grievanceHref}>{FOOTER.grievance}</a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
