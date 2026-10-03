/**
 * Public landing page for pattadar.com — Pattadar Bloom, guided by Material 3
 * accessibility, adaptive-layout, and expressive-design principles in design.md.
 * Dark warm paper, amber accent, trust assist chips, hairline rules,
 * and product-shaped previews of properties, documents, and sharing.
 * Styling lives in src/styles/site.css + tokens.css.
 *
 * Visible marketing copy comes from landingContent.ts so product claims can be
 * reviewed in one place.
 *
 * Founder rules kept: plain-language copy only (no fabricated testimonials,
 * stats or logos), self-hosted everything, links never open new tabs, and
 * sign-in and sign-up always go to OUR native /login and /signup pages.
 */
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { LazyMotion, m, useReducedMotion } from 'motion/react';
import { Link as RouterLink, Navigate } from 'react-router';
import { useNavigate } from 'react-router';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AgricultureOutlinedIcon from '@mui/icons-material/AgricultureOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
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
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import SquareFootOutlinedIcon from '@mui/icons-material/SquareFootOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import TravelExploreOutlinedIcon from '@mui/icons-material/TravelExploreOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { isAuthMocked, useAuth } from '../../auth/AuthProvider';
import '../../styles/site.css';
import { AssistantConversation } from './AssistantConversation';
import { HeroStory } from './HeroStory';
import { MarketingNav } from './MarketingNav';
import { NetworkInterestForm } from './NetworkInterestForm';
import { PlatformJourney } from './PlatformJourney';
import {
  AI,
  FAQ,
  FEATURES,
  FEATURES_HEAD,
  FINAL_CTA,
  FOOTER,
  HERO,
  HOW,
  NAV_LINKS,
  NETWORK,
  PILLARS,
  ROADMAP,
  STAGES,
  STORY,
  TRUST_ITEMS,
  UNIVERSITY,
  WALLET,
} from './landingContent';
import { UNIVERSITY_URL } from '../../lib/links';

const loadDomAnimation = () => import('motion/react').then((mod) => mod.domAnimation);
const EASE_OUT: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

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
  sell: <SellOutlinedIcon />,
  buy: <ShoppingBagOutlinedIcon />,
  rent: <KeyOutlinedIcon />,
  developer: <AgricultureOutlinedIcon />,
};

/** One icon per Pattadar AI point, in order: it reads YOUR records, it acts on
 * them, and it answers in plain words. The same robot glyph used to be repeated
 * three times, which told the eye the three points were interchangeable. */
const AI_POINT_ICONS: ReactElement[] = [
  <FolderOutlinedIcon key="records" />,
  <TouchAppOutlinedIcon key="acts" />,
  <TranslateOutlinedIcon key="plain" />,
];

const UNIVERSITY_ICONS: ReactElement[] = [
  <SchoolOutlinedIcon key="learn" />,
  <WorkspacePremiumOutlinedIcon key="credential" />,
  <VerifiedUserOutlinedIcon key="trust" />,
];


/** Content wrapper. CSS adds progressive view-timeline motion where supported,
 * while the readable layout remains the default without JavaScript. */
function Reveal({ children }: { children: ReactNode }) {
  return <div className="reveal">{children}</div>;
}

/** The three stages as tabs: Before, During and After are one question asked
 * three times, so one answer shows at a time (WAI-ARIA tabs pattern — arrow
 * keys move between tabs, Home/End jump, only the selected tab is in the Tab
 * order). The stage names are the tab labels; the frozen "Stage N" label and
 * body sit in the panel. */
function StageTabs() {
  const [active, setActive] = useState(0);
  const reducedMotion = useReducedMotion();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const count = STAGES.items.length;
  const select = (i: number) => {
    setActive(i);
    tabs.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = {
      ArrowRight: (active + 1) % count,
      ArrowLeft: (active - 1 + count) % count,
      Home: 0,
      End: count - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next);
  };
  const item = STAGES.items[active];
  return (
    <div className="stages">
      <div className="stages__tabs" role="tablist" aria-labelledby="stages-h" onKeyDown={onKey}>
        {STAGES.items.map((c, i) => (
          <button
            key={c.stage}
            ref={(el) => { tabs.current[i] = el; }}
            type="button"
            role="tab"
            id={`stage-tab-${i}`}
            aria-selected={i === active}
            aria-controls="stage-panel"
            tabIndex={i === active ? 0 : -1}
            className="stages__tab"
            onClick={() => setActive(i)}
          >
            {c.stage}
          </button>
        ))}
      </div>
      <div
        className="stages__panel"
        role="tabpanel"
        id="stage-panel"
        aria-labelledby={`stage-tab-${active}`}
        tabIndex={0}
      >
        <LazyMotion features={loadDomAnimation} strict>
          <m.div
            key={active}
            className="stages__panel-content"
            initial={reducedMotion ? false : { opacity: 0.72, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.22, ease: EASE_OUT }}
          >
            <span className="card__type">
              {STAGES.stageLabel} {active + 1}
            </span>
            <p className="card__sub">{item.body}</p>
          </m.div>
        </LazyMotion>
      </div>
    </div>
  );
}

const scrollToId = (id: string) =>
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });

export function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reducedMotion = useReducedMotion();
  // In mock mode (or when already signed in) both go straight to /app;
  // otherwise to OUR native /login or /signup page — never an external URL.
  // "Get started" is for somebody without an account, so it opens /signup,
  // the same page Pricing's "Create an account" opens.
  const startSignIn = () => {
    navigate(isAuthMocked || isAuthenticated ? '/app' : '/login');
  };
  const startSignUp = () => {
    navigate(isAuthMocked || isAuthenticated ? '/app' : '/signup');
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

  // Somebody who is already signed in does not need the pitch again. Typing
  // pattadar.com used to land them on ten sections of marketing headed by a
  // "Sign in" button they had already used, and the way to their own records
  // was to find that button and press it. They go straight to /app instead.
  //
  // Below every hook, not beside the others at the top: auth resolves
  // asynchronously, so this branch is taken on a LATER render than the first,
  // and returning before useState/useEffect would change the hook count
  // between renders — the one React error that takes the whole page down.
  //
  // `isAuthMocked` is excluded deliberately: in local dev and under the e2e
  // mock the dev user is permanently signed in, and redirecting on that would
  // make this page unreachable for the people working on it.
  if (!isAuthMocked && isAuthenticated) return <Navigate to="/app" replace />;

  return (
    <div className="dark site">
      {/* ── nav · N10 scroll-morph ─────────────────────────────────── */}
      <MarketingNav
        sectionLinks={NAV_LINKS}
        scrolled={scrolled}
        onSection={scrollToId}
        onSignIn={startSignIn}
      />

      <main>
        {/* ── hero · Marquee ─────────────────────────────────────────── */}
        <section className="hero" aria-labelledby="hero-h">
          <LazyMotion features={loadDomAnimation} strict>
            <m.div
              className="hero__landscape"
              aria-hidden="true"
              initial={reducedMotion ? false : { scale: 1.045 }}
              animate={{ scale: 1 }}
              transition={{ duration: reducedMotion ? 0 : 10, ease: EASE_OUT }}
            />
          </LazyMotion>
          <div className="hero__stage">
            <div className="hero__copy">
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
              <p className="hero__lead">{HERO.lead}</p>
              <div className="hero__ctas">
                <button type="button" className="cta cta--primary cta--lg" onClick={startSignUp}>
                  {HERO.ctaPrimary}
                </button>
                <button type="button" className="cta cta--text cta--lg" onClick={startSignIn}>
                  {HERO.ctaSecondary}
                </button>
              </div>
            </div>
            <HeroStory />
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
              <p className="story-sources">
                <span>Check official sources</span>
                {STORY.sources.map((source) => (
                  <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer">
                    {source.label}
                  </a>
                ))}
              </p>
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
            {/* One even grid: every feature gets the same weight. FeatureContent
                still carries `wide`; the layout deliberately ignores it. */}
            <ul className="grid grid--four grid--features">
              {FEATURES.map((f) => (
                <li key={f.title} className="card card--feature">
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
              <header className="section-head section-head--tight">
                <p className="section-eyebrow">{AI.eyebrow}</p>
                <h2 className="section-h" id="ai-h">
                  {AI.h2}
                </h2>
              </header>
              <div className="split">
                <div className="split__copy">
                  <p className="section-lead">{AI.lead}</p>
                  <div className="split__points">
                    {AI.points.map(([t, b], i) => (
                      <div key={t} className="point">
                        {AI_POINT_ICONS[i]}
                        <div>
                          <h3 className="point__h">{t}</h3>
                          <p className="point__b">{b}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <AssistantConversation />
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── how it works · numbered timetable rows ─────────────────── */}
        <section id="how" className="section band" aria-labelledby="how-h">
          <div className="section__inner">
            <header className="section-head section-head--tight">
              <p className="section-eyebrow">{HOW.eyebrow}</p>
              <h2 className="section-h" id="how-h">
                {HOW.h2}
              </h2>
            </header>
            <PlatformJourney />
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
              {/* No 01–06 numerals: the pillars are six kinds of record, not
                  six steps, so numbering them implied an order they lack. */}
              {PILLARS.items.map((p) => (
                <li key={p.title} className="card">
                  <div className="card__meta">{ICONS[p.icon]}</div>
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
            <StageTabs />
          </div>
        </section>

        {/* ── Pattadar University · learning and proof ─────────────── */}
        <section id="university" className="section university" aria-labelledby="university-h">
          <Reveal>
            <div className="section__inner university__layout">
              <div className="university__intro">
                <div className="university__mark" aria-hidden>
                  <SchoolOutlinedIcon />
                  <span>PU</span>
                </div>
                <header className="section-head section-head--tight">
                  <p className="section-eyebrow">{UNIVERSITY.eyebrow}</p>
                  <h2 className="section-h" id="university-h">{UNIVERSITY.h2}</h2>
                  <p className="section-lead">{UNIVERSITY.intro}</p>
                </header>
                {/* Outlined, not filled: the hero and the closing statement own
                    the amber (design.md § CTA voice), and this was a third
                    filled button on the page. */}
                <a className="cta cta--ghost university__cta" href={UNIVERSITY_URL}>
                  {UNIVERSITY.cta}
                  <ArrowForwardRoundedIcon aria-hidden />
                </a>
                <p className="university__note">{UNIVERSITY.note}</p>
              </div>
              <div className="university__proof">
                <ol className="university__steps">
                  {UNIVERSITY.points.map((point, i) => (
                    <li key={point.title}>
                      {/* 1 2 3, the page's one numbering style (How it works
                          counts its steps the same way). It used to be 01 02 03. */}
                      <span className="university__index">{i + 1}</span>
                      <span className="university__icon" aria-hidden>{UNIVERSITY_ICONS[i]}</span>
                      <span className="university__point-copy">
                        <strong>{point.title}</strong>
                        <span>{point.body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="university__disclaimer">{UNIVERSITY.disclaimer}</p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Pattadar Network · coming-soon offerings + interest ────── */}
        <section id="network" className="section network" aria-labelledby="network-h">
          <div className="section__inner">
            <header className="section-head">
              <p className="section-eyebrow">{NETWORK.eyebrow}</p>
              <h2 className="section-h" id="network-h">{NETWORK.h2}</h2>
              <p className="section-lead">{NETWORK.intro}</p>
            </header>
            <ul className="grid grid--four">
              {NETWORK.items.map((n) => (
                <li key={n.title} className="card card--tba">
                  <div className="card__meta">
                    {ICONS[n.icon]}
                    <span className="badge">{NETWORK.chip}</span>
                  </div>
                  <h3 className="card__h">{n.title}</h3>
                  <p className="card__sub">{n.body}</p>
                </li>
              ))}
            </ul>
            <p className="network__note">{NETWORK.note}</p>
            <NetworkInterestForm />
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
            <ul className="grid roadmap__list">
              {ROADMAP.items.map((sv) => (
                <li key={sv.title} className="card card--tba roadmap__item">
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
          <button type="button" className="cta cta--primary cta--lg" onClick={startSignUp}>
            {FINAL_CTA.cta}
          </button>
          <ul className="close__chips">
            {TRUST_ITEMS.map((item) => (
              <li key={item.text} className="hero__chip">
                {ICONS[item.icon]}
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
          <div className="footer__meta">
            <p className="footer__line">
              © {new Date().getFullYear()}
              {FOOTER.copyrightTail}
            </p>
            <ul className="footer__links">
              <li>
                <a href={UNIVERSITY_URL}>{FOOTER.university}</a>
              </li>
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
