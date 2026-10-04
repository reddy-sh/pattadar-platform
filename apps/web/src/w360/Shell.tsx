/**
 * The record-360 shell: wordmark + jump-to search + language + scheme toggle
 * across the top, one navigation rail down the left, the routed screen in the
 * rest. It is the frame every one of W01–W15 is drawn inside.
 *
 * The rail is grouped rather than flat: Your portfolio, Shared, Money,
 * Account, then Operations and Administration for staff only, and Help &
 * resources (Tools, Pattadar University, Help & support) pinned to the foot.
 * Fifteen equally-weighted entries in one column is a list you re-read
 * top to bottom every time, because nothing in it says where to start looking;
 * four named groups of three or four is a shape you learn once. Inside a group
 * the order is still the way the product reasons, not alphabetical.
 *
 * One entry is not the owner's at all — the Pattadar desk. It has its own
 * Operations group, drawn only for whoever runs the platform, so a staff job
 * queue never sits among the owner's own money.
 *
 * Below 900px the rail becomes a drawer behind a hamburger — it used to
 * simply vanish, leaving a phone with no navigation at all. And the jump box
 * is a real search: it asks the API for parcels, papers and people as you
 * type and takes you straight to the hit, exactly as its placeholder promises.
 */
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import CalculateOutlined from '@mui/icons-material/CalculateOutlined';
import CardGiftcardOutlined from '@mui/icons-material/CardGiftcardOutlined';
import ContrastOutlined from '@mui/icons-material/ContrastOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MailOutlined from '@mui/icons-material/MailOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import JoinFullOutlined from '@mui/icons-material/JoinFullOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import PolicyOutlined from '@mui/icons-material/PolicyOutlined';
import PublicOutlined from '@mui/icons-material/PublicOutlined';
import SaveAltOutlined from '@mui/icons-material/SaveAltOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import SupportAgentOutlined from '@mui/icons-material/SupportAgentOutlined';

import { useDesk, useOrders, usePortfolio, useSearch } from './api';
import { HOLDING_WORD, Icon, Menu, plural } from './ui';
import { ToastHost } from './Toast';
import { InboxWatcher } from './InboxWatcher';
import { Face } from './Face';
import { useInbox } from './inbox';
import { AssistantPanel } from '../assistant/AssistantPanel';
import { useAuth } from '../auth/AuthProvider';
import { PENDING_INVITE, PENDING_REFERRAL, redeemReferral } from './growthData';
import { UNIVERSITY_URL } from '../lib/links';
import { SCHEME_ICON } from '../components/schemeIcons';
import { useThemeChoice } from '../components/useThemeChoice';
import './w360.css';

const RAIL_KEY = 'w360.rail';

/** Which icon a jump hit wears: the record's kind, a paper, a person. */
const HIT_ICON: Record<string, string> = { record: 'parcel', paper: 'title', person: 'person' };
/** The kind tag on a search hit, in the rail's own nouns. The server's kinds
 *  are internal ('record', 'paper'); the reader sees Property and Document. */
const HIT_KIND: Record<string, string> = { record: 'property', paper: 'document', person: 'person' };

interface NavItem {
  to: string;
  label: string;
  icon: typeof MapOutlined;
  end?: boolean;
  count?: number;
  dot?: boolean;
  /** `to` is outside this app (Pattadar University): a plain link that opens
   *  a new tab and says so, rather than a router NavLink that cannot reach it. */
  external?: boolean;
}

/** What the shell hands the routed screen. Help & support opens the
 *  assistant drawer, which lives here, beside the topbar button. */
export interface ShellContext {
  openAssistant: () => void;
}

/** One named group of rail entries.
 *
 *  `desk` marks the single group the Pattadar desk hangs off when the account
 *  is a platform admin. It is a flag on the group rather than an item in it
 *  because the desk's badge is its own query — see `DeskRail`. */
interface NavSection {
  title: string;
  items: NavItem[];
  desk?: boolean;
  /** Pinned to the foot of the rail and ruled off (Help & resources). */
  foot?: boolean;
}

/** One entry in the rail.
 *
 *  Lifted out of the map below so the desk's entry — mounted separately, for
 *  the reason on `DeskRail` — is drawn by this code rather than by a copy of
 *  it that drifts from it.
 *
 *  The label sits in its own span so the collapsed rail can hide the words and
 *  keep the icons.
 *
 *  title and aria-label are set ONLY while the rail is collapsed, and for the
 *  same reason: they are a stand-in for a label that is not on screen. Set
 *  unconditionally, as they were, the browser popped a native tooltip reading
 *  "Properties" over the entry already reading "Properties" — a second, uglier
 *  label covering its neighbours a second after the pointer settled. And a
 *  static aria-label overrode the accessible name for the whole link, so the
 *  count badge beside "Services" was never announced; folding the count into
 *  the collapsed name keeps it audible. */
function RailLink({ it, railHidden, onNavigate }: {
  it: NavItem; railHidden: boolean; onNavigate: () => void;
}) {
  if (it.external) {
    const name = `${it.label} (opens in a new tab)`;
    return (
      <a
        href={it.to} target="_blank" rel="noopener noreferrer"
        title={railHidden ? it.label : undefined}
        aria-label={name}
        onClick={onNavigate}
      >
        <it.icon sx={{ fontSize: 19 }} aria-hidden />
        <span className="lbl">{it.label}</span>
        <OpenInNewOutlined className="ext" sx={{ fontSize: 14 }} aria-hidden />
      </a>
    );
  }
  return (
    <NavLink
      to={it.to} end={it.end}
      title={railHidden ? it.label : undefined}
      aria-label={railHidden
        ? (it.count !== undefined ? `${it.label}, ${it.count}` : it.label)
        : undefined}
      onClick={onNavigate}
    >
      <it.icon sx={{ fontSize: 19 }} aria-hidden />
      <span className="lbl">{it.label}</span>
      {it.count !== undefined && <span className="count">{it.count}</span>}
      {it.dot && <span className="dot" aria-hidden />}
    </NavLink>
  );
}

/** The Pattadar desk — the one rail entry that is not drawn for everybody.
 *
 *  It is a component instead of a plain item in the Operations group because
 *  its badge is a real query, and not a cheap one: `desk` is one of the
 *  resolvers that read every owner’s jobs, it answers nothing for anybody who
 *  is not a platform admin, and it writes an audit row each time it does
 *  answer. A hook cannot be called conditionally, so the condition has to be
 *  the component — mounted only when the portfolio says this account is an
 *  admin, which means no other account ever asks the question.
 *
 *  The badge is the number of jobs with nobody on them, and it does not draw
 *  at zero. Every job having somebody on it is the state the desk exists to
 *  reach, and a rail that always carries a number is one the operator stops
 *  reading. */
function DeskRail({ railHidden, onNavigate }: { railHidden: boolean; onNavigate: () => void }) {
  const desk = useDesk('open');
  return (
    <RailLink
      it={{
        to: '/app/desk',
        label: 'Pattadar desk',
        icon: SupportAgentOutlined,
        count: desk.data?.unassigned || undefined,
      }}
      railHidden={railHidden}
      onNavigate={onNavigate}
    />
  );
}

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const portfolio = usePortfolio();
  const orders = useOrders();
  // The signed-in identity, for the account menu. `user.email` is the one name
  // that exists before the portfolio query lands — and the only one at all for
  // an account with no records yet.
  const { user, signOut } = useAuth();
  // The colour scheme is the app's one choice, held by MUI and shared with the
  // previous app's menu (components/useThemeChoice.ts). theme-init.js carried
  // the old `w360.scheme` key into it once, before this bundle loaded.
  const theme = useThemeChoice();
  const scheme = theme.choice;

  // The jump box. `useDeferredValue` keeps typing smooth while results load.
  const [q, setQ] = useState('');
  const deferredQ = useDeferredValue(q);
  const search = useSearch(deferredQ);
  const [openResults, setOpenResults] = useState(false);
  const [activeHit, setActiveHit] = useState(0);
  const jumpRef = useRef<HTMLDivElement>(null);
  const hits = search.data ?? [];

  // The rail: a drawer on narrow screens, collapsible at desktop. Collapse is
  // a preference and survives a reload; the drawer is transient and never does.
  const [navOpen, setNavOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [railHidden, setRailHidden] = useState(() => localStorage.getItem(RAIL_KEY) === 'hidden');

  useEffect(() => { localStorage.setItem(RAIL_KEY, railHidden ? 'hidden' : 'open'); }, [railHidden]);

  // The drawer breakpoint, watched rather than sampled. Reading matchMedia once
  // inside the click handler answered for the width at click time but told the
  // rest of the component nothing, so `inert` below could not depend on it.
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    setNarrow(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // One button, two behaviours: below the drawer breakpoint it slides the
  // drawer; above it it collapses the rail in place.
  const onMenu = () => {
    if (narrow) setNavOpen((v) => !v);
    else setRailHidden((v) => !v);
  };

  const menuRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  /** Shut the drawer AND put focus back on the hamburger. Only the dismiss
   *  paths call this — Escape and the scrim. Navigating out of the drawer must
   *  not, or every in-drawer link would route the page and then yank focus back
   *  to the topbar, away from what just loaded. */
  const dismissNav = () => { setNavOpen(false); menuRef.current?.focus(); };

  // An open drawer is a modal surface: Escape closes it, and focus moves into
  // it so a keyboard user is not left behind it.
  useEffect(() => {
    if (!navOpen || !narrow) return undefined;
    navRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setNavOpen(false); menuRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen, narrow]);

  // Navigation closes everything transient — drawer, results, the typed text.
  useEffect(() => {
    setNavOpen(false);
    setOpenResults(false);
    setQ('');
  }, [location.pathname]);

  useEffect(() => { setActiveHit(0); }, [deferredQ]);

  // Someone who arrived by an invitation or a referral link and had to sign
  // up first lands back where the link was taking them. The referral is
  // recorded once; the server ignores it for an account that already has
  // records, is the referrer's own, or is already attributed.
  useEffect(() => {
    const code = localStorage.getItem(PENDING_REFERRAL);
    if (code) {
      localStorage.removeItem(PENDING_REFERRAL);
      void redeemReferral(code).catch(() => undefined);
    }
    const invite = localStorage.getItem(PENDING_INVITE);
    // Resumed once: cleared before navigating, so a link that turns out to be
    // spent cannot bounce every later visit back to it.
    if (invite) localStorage.removeItem(PENDING_INVITE);
    if (invite && /^[\w-]{8,200}$/.test(invite)) navigate(`/i/${invite}`, { replace: true });
  }, [navigate]);

  // ⌘K / Ctrl-K puts the caret in the jump box — the shortcut the box advertises.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        document.getElementById('w360-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A click anywhere outside the jump box closes its results.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!jumpRef.current?.contains(e.target as Node)) setOpenResults(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  // Only close the results here — the route effect clears the text. Clearing
  // in both places made the box empty-then-refill-then-empty: anything typed
  // between the eager clear and the navigation commit was silently wiped.
  const go = (route: string) => {
    setOpenResults(false);
    navigate(route);
  };

  // One expression, used for both the render gate and aria-expanded. They were
  // written separately and disagreed exactly when the panel held a message, so
  // a screen reader was told the popup was closed while it was visibly open.
  const showResults = openResults && q.trim().length >= 2;

  useEffect(() => {
    if (!showResults || activeHit < 0) return;
    document.getElementById(`w360-hit-${activeHit}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeHit, showResults]);

  const who = portfolio.data?.displayName ?? '';
  const ordered = orders.data?.length ?? 0;
  const waiting = portfolio.data?.waiting.length ?? 0;
  // The bell counts what is waiting on you AND what arrived unread (a reading
  // that finished while you were elsewhere). The same query InboxWatcher runs.
  const inbox = useInbox();
  const bell = waiting + (inbox.data?.unread ?? 0);
  // Tickets with work sitting on them. A dot that never clears trains people
  // to ignore the corner; a number that goes away when you have looked does not.
  const needsReview = orders.data?.filter((o) => o.needsYou || o.pendingReview > 0).length ?? 0;

  // Groups named for what the reader is trying to do rather than for the
  // machinery behind them: the land itself, the traffic between people, the
  // money, the account's own settings, staff-only groups, and — pinned to the
  // foot of the rail — help, learning and utilities.
  const sections: NavSection[] = [
    {
      title: 'Your portfolio',
      items: [
        { to: '/app', label: 'Home', icon: HomeOutlined, end: true },
        { to: '/app/properties', label: 'Properties', icon: MapOutlined },
        // Holdings: several properties held as one piece of ground. Beside
        // Properties because it is the same land seen another way. It merges
        // no title, boundary or record — each member stays separate.
        { to: '/app/holdings', label: HOLDING_WORD.many, icon: JoinFullOutlined },
        // Cadastral maps: village and plot geometry, distinct from the
        // Properties Map view and each record's Location tab.
        { to: '/app/maps', label: 'Cadastral maps', icon: LayersOutlined },
        { to: '/app/papers', label: 'Documents', icon: DescriptionOutlined },
      ],
    },
    {
      // What somebody else sent you, what somebody else is waiting on you for,
      // and the people either can arrive from. Invitations sits with them
      // because an invitation is how sharing starts, not an account setting.
      title: 'Shared',
      items: [
        { to: '/app/shared', label: 'Shared with me', icon: SaveAltOutlined },
        { to: '/app/assigned', label: 'Waiting on you', icon: AssignmentOutlined,
          count: needsReview || undefined },
        { to: '/app/invitations', label: 'Invitations', icon: MailOutlined },
        { to: '/app/groups', label: 'Families & groups', icon: GroupsOutlined },
        // Referral is how Pattadar grows, so it sits with the other ways
        // people arrive, not buried in settings.
        { to: '/app/refer', label: 'Invite & earn', icon: CardGiftcardOutlined },
      ],
    },
    {
      // Work you have ordered and the balance it comes out of.
      title: 'Money',
      items: [
        { to: '/app/services', label: 'Services', icon: HandshakeOutlined, count: ordered || undefined },
        { to: '/app/wallet', label: 'Wallet', icon: AccountBalanceWalletOutlined },
      ],
    },
    {
      // The account's own settings and trail. Notifications left this group
      // for the topbar bell: it is something that arrives, not a place you go.
      // "Admin & Ref Data" used to sit here for everybody; the desk is
      // DeskRail under Operations now, drawn for an admin and nobody else.
      title: 'Account',
      items: [
        { to: '/app/profile', label: 'Profile', icon: PersonOutlined },
        // The DPDP screen (consent, export, deletion). It was reachable only
        // from the avatar menu; settings-shaped screens belong in the rail too.
        { to: '/app/account', label: 'Privacy & your data', icon: ShieldOutlined },
        // The owner's own trail. "Activity", not "Audit log": that name
        // belongs to a compliance surface, and this one is the owner's.
        { to: '/app/audit', label: 'Activity', icon: FactCheckOutlined },
      ],
    },
    // The operator's desk has its own group. It used to hang off Money & help,
    // which put a staff job queue among the owner's own spending.
    ...(portfolio.data?.isPlatformAdmin ? [{
      title: 'Operations',
      desk: true,
      items: [],
    }] : []),
    ...(portfolio.data?.isSuperAdmin ? [{
      title: 'Administration',
      items: [
        { to: '/app/admin/members', label: 'Company members', icon: GroupsOutlined },
        { to: '/app/admin/compliance', label: 'Compliance rules', icon: PolicyOutlined },
        { to: '/app/admin/geography', label: 'Government geography', icon: PublicOutlined },
      ],
    }] : []),
    {
      // Utilities, learning and help — not the owner's data, so they sit at
      // the foot of the rail, ruled off from it, the way consoles place them.
      title: 'Help & resources',
      foot: true,
      items: [
        { to: '/app/tools', label: 'Tools', icon: CalculateOutlined },
        { to: UNIVERSITY_URL, label: 'Pattadar University', icon: SchoolOutlined, external: true },
        { to: '/app/help', label: 'Help & support', icon: HelpOutlineOutlined },
      ],
    },
  ];

  return (
    // ToastHost sits INSIDE .w360, not around it: it renders its stack as a
    // sibling of its children, and every toast rule is scoped `.w360 .toast`.
    // Outside, the toasts resolve none of the design tokens and paint as
    // unstyled text in the corner. The scheme is not repeated here: the
    // provider puts it on <html data-scheme>, where w360.css's slots read it.
    <div className="w360" data-rail={railHidden ? 'hidden' : 'open'}>
      <ToastHost>
      <InboxWatcher />
      <header className="topbar">
        <span className="row tight" style={{ flexWrap: 'nowrap' }}>
          {/* aria-expanded described the desktop rail even on a phone, so the
              hamburger announced itself as expanded while the drawer was shut.
              Each width gets the answer that is true of it. */}
          <button
            ref={menuRef}
            type="button"
            className="iconbtn menu-btn"
            aria-label={narrow ? 'Menu' : railHidden ? 'Show the rail' : 'Collapse the rail'}
            aria-expanded={narrow ? navOpen : !railHidden}
            onClick={onMenu}
          >
            <MenuOutlined sx={{ fontSize: 20 }} />
          </button>
          <NavLink to="/app" className="brand">Pattadar<span>.</span></NavLink>
        </span>

        <div className="jump" ref={jumpRef}>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const hit = hits[activeHit] ?? hits[0];
              if (hit) go(hit.route);
              else if (q.trim()) go(`/app/properties?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <SearchOutlined sx={{ fontSize: 18 }} aria-hidden />
            <input
              id="w360-search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpenResults(true); }}
              onFocus={() => q.trim().length >= 2 && setOpenResults(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpenResults(false);
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveHit((i) => Math.min(hits.length - 1, i + 1));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveHit((i) => Math.max(0, i - 1));
                }
              }}
              placeholder="Jump to a property, document, person…"
              aria-label="Jump to a property, document, person"
              role="combobox"
              aria-expanded={showResults}
              aria-controls="w360-jump-list"
              aria-autocomplete="list"
              // Index-based, and guarded: with no hits ArrowDown leaves
              // activeHit at -1, and "w360-hit--1" is an id nothing carries.
              aria-activedescendant={showResults && activeHit >= 0 && hits[activeHit]
                ? `w360-hit-${activeHit}` : undefined}
              autoComplete="off"
            />
            <kbd>⌘K</kbd>
          </form>

          {showResults && (
            // role="listbox" moved down onto the options wrapper: a listbox may
            // only contain options, and the two status messages below are
            // direct children of this panel. Most readers dropped them.
            <div className="jump-results" id="w360-jump-results">
              <div id="w360-jump-list" role="listbox" aria-label="Search results">
              {hits.map((h, i) => (
                <button
                  key={`${h.kind}-${h.id}`}
                  id={`w360-hit-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeHit}
                  className={`hit${i === activeHit ? ' active' : ''}`}
                  onClick={() => go(h.route)}
                  onMouseEnter={() => setActiveHit(i)}
                >
                  <span className="muted" style={{ display: 'flex' }}>
                    <Icon name={HIT_ICON[h.kind] ?? 'feature'} size={17} />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem' }}>
                      {h.title}
                    </span>
                    {h.subtitle && (
                      <span className="note" style={{ display: 'block', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="note mono" style={{ flex: 'none', fontSize: '0.625rem',
                    textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {HIT_KIND[h.kind] ?? h.kind}
                  </span>
                </button>
              ))}
              </div>
              {/* aria-hidden on all three: the permanently-mounted status
                  region below announces them. A live region inserted in the
                  same commit as its text is skipped by several readers, so it
                  has to exist before it has anything to say. */}
              {/* A dropped request is not an answer. Reporting "nothing
                  matches" for a search that never ran tells someone their
                  parcel is not in their own account. */}
              {hits.length === 0 && !search.isFetching && search.isError && (
                <p className="note" aria-hidden style={{ padding: '0.75rem 0.875rem', margin: 0,
                                             color: 'var(--w-danger)' }}>
                  That search could not run.
                </p>
              )}
              {hits.length === 0 && !search.isFetching && !search.isError && (
                <p className="note" aria-hidden style={{ padding: '0.75rem 0.875rem', margin: 0 }}>
                  Nothing matches “{q.trim()}”.
                </p>
              )}
              {hits.length === 0 && search.isFetching && (
                <p className="note" aria-hidden style={{ padding: '0.75rem 0.875rem', margin: 0 }}>Searching…</p>
              )}
            </div>
          )}
          {/* Mounted always, so it is a live region before it has anything to
              say. Visually hidden — the panel above carries the visible words. */}
          <p role="status" style={{
            position: 'absolute', width: 1, height: 1, overflow: 'hidden',
            clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap',
          }}>
            {!showResults ? ''
              : search.isError ? 'That search could not run.'
              : search.isFetching && hits.length === 0 ? 'Searching…'
              : hits.length === 0 ? `Nothing matches ${q.trim()}.`
              : `${plural(hits.length, 'result')}.`}
          </p>
        </div>

        <div className="topbar-right">
          {/* An EN / తెలుగు switch used to sit here. Both segments were static
              markup — no onClick, aria-pressed hardcoded to the literals "true"
              and "false" — so the app's primary audience tapped Telugu, got
              English, and concluded the app was broken.
              It is removed rather than wired because there is nothing to wire
              it to: apps/web has no translation layer, no string catalogue, and
              every W360 string is an English literal in JSX. A toggle that lit
              up and still showed English would be a better-disguised lie.
              When i18n lands, the preference belongs on Profile — which already
              promises "your language", and whose `me { language }` field and
              `updateProfile(language:)` mutation already exist. */}
          <Menu
            label="Change theme"
            trigger={<ContrastOutlined sx={{ fontSize: 18 }} aria-hidden />}
            items={theme.options.map((o) => {
              const Glyph = SCHEME_ICON[o.icon];
              return {
                label: o.label,
                selected: scheme === o.id,
                icon: <Glyph sx={{ fontSize: 16 }} aria-hidden />,
                onClick: () => theme.choose(o.id),
              };
            })}
          />
          {/* Wired, not removed: AssistantPanel is a finished SSE chat drawer
              that the legacy shell has always opened, and it degrades to its
              own "available soon" state when the service is unreachable. The
              button was simply never connected to it here. */}
          <button
            type="button" className="iconbtn assistant-btn" aria-label="Assistant"
            aria-expanded={assistantOpen}
            onClick={() => setAssistantOpen(true)}
          >
            <SmartToyOutlined sx={{ fontSize: 18 }} />
          </button>
          {/* Notifications, moved up from the rail's Account group. A link,
              not a popup: /app/notifications is the whole list. The badge is
              the same `waiting` count the rail carried — never `waiting + 1`,
              a number nobody could explain — and it is folded into the
              accessible name because the badge itself is aria-hidden. */}
          <NavLink
            to="/app/notifications"
            className="iconbtn notify-btn"
            aria-label={bell ? `Notifications, ${bell} waiting` : 'Notifications'}
            title="Notifications"
          >
            <NotificationsNoneOutlined sx={{ fontSize: 18 }} aria-hidden />
            {bell > 0 && (
              <span className="notify-badge" aria-hidden>{bell > 99 ? '99+' : bell}</span>
            )}
          </NavLink>
          {/* Was a hardcoded "S". On a product where several family members
              share one screen, an avatar that reads the same for everyone is
              worse than no avatar: it says you are signed in as someone you
              are not. */}
          {/* An empty circle would be the same mistake in the other direction.
              Until a name is known — a fresh account, or the portfolio query
              still in flight — the generic person mark is the honest glyph. */}
          {/* The avatar was a bare <span>. It sat in the one corner every
              application puts the account control in, drew the circle that
              control draws, and answered nothing — while the module it
              belongs to had no sign-out ANYWHERE. Leaving was a three-screen
              detour: the rail's Profile link, its "not yet redrawn" card, and
              finally the LEGACY shell's own avatar menu. It is a real menu
              button now, carrying the two account screens that already exist
              and the way out.

              It reuses `Menu` rather than growing a second popup here: the
              portalling, the arrow-key roving, Escape-and-Tab returning focus
              to the trigger, and the flip-up-when-low placement are all
              already solved there, and a hand-rolled twin would drift. */}
          <Menu
            label={who ? `Your account — ${who}` : 'Your account'}
            triggerClassName="avatar"
            // The sign-in provider's photo when the ID token carries one
            // (Google's), else initials, else the person mark (Face.tsx).
            trigger={<Face picture={user?.picture ?? ''} name={who || user?.name || ''} />}
            header={who || user?.name || user?.email || 'Signed in'}
            items={[
              { label: 'Profile',
                icon: <PersonOutlined sx={{ fontSize: 16 }} />,
                onClick: () => navigate('/app/profile') },
              // The DPDP screen — consent, export, deletion. It has been
              // routed at /app/account all along and reachable from nowhere
              // inside this module.
              { label: 'Privacy & your data',
                icon: <ShieldOutlined sx={{ fontSize: 16 }} />,
                onClick: () => navigate('/app/account') },
              // `signOut` clears whichever session is live and then assigns
              // the location, so the react-query cache and every screen's
              // state go with the page. Nothing to tear down by hand here.
              { label: 'Sign out', danger: true, rule: true,
                icon: <LogoutOutlined sx={{ fontSize: 16 }} />,
                onClick: () => { void signOut(); } },
            ]}
          />
        </div>
      </header>

      <div className="body">
        {navOpen && (
          <button type="button" className="nav-scrim" aria-label="Close menu"
                  onClick={dismissNav} />
        )}
        {/* Closing the drawer is done in CSS (translateX(-105%)), which hides it
            and leaves every link in it focusable and in the accessibility
            tree: on a phone, Tab walked off-screen once per entry before
            reaching the page, and a screen reader read out a navigation nobody
            could see. `inert` removes the subtree from both. No aria-hidden
            beside it — inert already does that, and the pair warns during the
            close transition. */}
        <nav
          ref={navRef}
          className={navOpen ? 'nav open' : 'nav'}
          aria-label="Sections"
          inert={narrow && !navOpen}
        >
          {/* role="group" + aria-label is what makes the grouping real for a
              screen reader, and it is what survives the collapsed rail — the
              heading text is display:none at 4rem wide, the group's name is
              not. The visible label is aria-hidden so the same four words are
              not announced twice on the way into each group. */}
          {sections.map((sec) => (
            <div className={sec.foot ? 'navsec foot' : 'navsec'} key={sec.title}
                 role="group" aria-label={sec.title}>
              <p className="navsec-t" aria-hidden>{sec.title}</p>
              {sec.items.map((it) => (
                <RailLink key={it.to} it={it} railHidden={railHidden}
                          onNavigate={() => setNavOpen(false)} />
              ))}
              {/* Only for one account, and only in the group that claims it.
                  It is the operator's entry, and it is the only thing in this
                  rail whose absence for everybody else is the whole point. */}
              {sec.desk && portfolio.data?.isPlatformAdmin && (
                <DeskRail railHidden={railHidden} onNavigate={() => setNavOpen(false)} />
              )}
            </div>
          ))}
        </nav>
        <Outlet context={{ openAssistant: () => setAssistantOpen(true) } satisfies ShellContext} />
      </div>
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      </ToastHost>
    </div>
  );
}
