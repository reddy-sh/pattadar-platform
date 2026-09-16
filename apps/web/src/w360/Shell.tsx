/**
 * The record-360 shell: wordmark + jump-to search + language + scheme toggle
 * across the top, one navigation rail down the left, the routed screen in the
 * rest. It is the frame every one of W01–W15 is drawn inside.
 *
 * The rail is grouped rather than flat: Your land, Shared, Money & help,
 * Account. Fifteen equally-weighted entries in one column is a list you re-read
 * top to bottom every time, because nothing in it says where to start looking;
 * four named groups of three or four is a shape you learn once. Inside a group
 * the order is still the way the product reasons, not alphabetical.
 *
 * One entry is not the owner's at all — the Pattadar desk. It hangs off Money &
 * help rather than the foot of the rail, because that group is where the people
 * who do the work live, and it is drawn only for whoever runs the platform.
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
import ContrastOutlined from '@mui/icons-material/ContrastOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MailOutlined from '@mui/icons-material/MailOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import SaveAltOutlined from '@mui/icons-material/SaveAltOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import SupportAgentOutlined from '@mui/icons-material/SupportAgentOutlined';

import { useDesk, useOrders, usePortfolio, useSearch } from './api';
import { Icon, Menu, initialsOf, plural } from './ui';
import { ToastHost } from './Toast';
import { AssistantPanel } from '../assistant/AssistantPanel';
import { useAuth } from '../auth/AuthProvider';
import './w360.css';

const SCHEME_KEY = 'w360.scheme';
const RAIL_KEY = 'w360.rail';

type Scheme = 'light' | 'dark' | 'highContrast';

const isScheme = (value: string | null): value is Scheme =>
  value === 'light' || value === 'dark' || value === 'highContrast';

/** Which icon a jump hit wears: the record's kind, a paper, a person. */
const HIT_ICON: Record<string, string> = { record: 'parcel', paper: 'title', person: 'person' };

interface NavItem {
  to: string;
  label: string;
  icon: typeof MapOutlined;
  end?: boolean;
  count?: number;
  dot?: boolean;
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
 *  It is a component instead of a third line in the Money & help group because
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
  const [scheme, setScheme] = useState<Scheme>(() => {
    const stored = localStorage.getItem(SCHEME_KEY);
    return isScheme(stored) ? stored : 'dark';
  });

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

  useEffect(() => { localStorage.setItem(SCHEME_KEY, scheme); }, [scheme]);
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
  // Tickets with work sitting on them. A dot that never clears trains people
  // to ignore the corner; a number that goes away when you have looked does not.
  const needsReview = orders.data?.filter((o) => o.needsYou || o.pendingReview > 0).length ?? 0;

  // Four groups, named for what the reader is trying to do rather than for the
  // machinery behind them: the land itself, the traffic between people, the
  // money and the people paid to move it, then the account's own dials. Every
  // destination that was in the flat rail is still here, and nothing new is —
  // this is the same fifteen entries, grouped.
  const sections: NavSection[] = [
    {
      title: 'Your land',
      items: [
        { to: '/app', label: 'Dashboard', icon: GridViewOutlined, end: true },
        { to: '/app/properties', label: 'Properties', icon: MapOutlined },
        { to: '/app/villages', label: 'Maps', icon: LayersOutlined },
        { to: '/app/papers', label: 'Papers', icon: DescriptionOutlined },
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
        { to: '/app/groups', label: 'Families & Groups', icon: GroupsOutlined },
      ],
    },
    {
      // Work you have paid for, the balance it comes out of, and — for an
      // operator only — the desk that moves it.
      title: 'Money & help',
      desk: true,
      items: [
        { to: '/app/services', label: 'Services', icon: HandshakeOutlined, count: ordered || undefined },
        { to: '/app/wallet', label: 'Wallet', icon: AccountBalanceWalletOutlined },
      ],
    },
    {
      title: 'Account',
      items: [
        // `waiting + 1` used to sit here. Nobody could say what the extra one
        // was, and a badge reading 3 over a list of 2 teaches people to stop
        // trusting the badge — which is the only thing it exists to do.
        { to: '/app/notifications', label: 'Notifications', icon: NotificationsNoneOutlined,
          count: waiting || undefined },
        { to: '/app/tools', label: 'Tools', icon: CalculateOutlined },
        { to: '/app/audit', label: 'Audit Log', icon: FactCheckOutlined },
        // "Admin & Ref Data" used to sit here, for everybody, and pointed at a
        // stub. /app/admin is the desk now (routes.tsx), and the desk belongs
        // to whoever runs Pattadar rather than to whoever owns the land — so
        // the entry is DeskRail under Money & help, drawn for an admin and for
        // nobody else. The reference data itself is untouched at /legacy/admin.
        { to: '/app/profile', label: 'Profile', icon: PersonOutlined },
      ],
    },
  ];

  return (
    // ToastHost sits INSIDE .w360, not around it: it renders its stack as a
    // sibling of its children, and every toast rule is scoped `.w360 .toast`.
    // Outside, the toasts resolve none of the design tokens and paint as
    // unstyled text in the corner.
    <div className="w360" data-scheme={scheme} data-rail={railHidden ? 'hidden' : 'open'}>
      <ToastHost>
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
              placeholder="Jump to a parcel, paper, person…"
              aria-label="Jump to a parcel, paper, person"
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
                    <span style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem' }}>
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
                    {h.kind}
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
                  That search could not run. It is the connection, not your records.
                </p>
              )}
              {hits.length === 0 && !search.isFetching && !search.isError && (
                <p className="note" aria-hidden style={{ padding: '0.75rem 0.875rem', margin: 0 }}>
                  Nothing matches “{q.trim()}” — not a parcel, a paper or a person.
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
            items={[
              { label: 'Light', selected: scheme === 'light',
                icon: <LightModeOutlined sx={{ fontSize: 16 }} aria-hidden />,
                onClick: () => setScheme('light') },
              { label: 'Dark', selected: scheme === 'dark',
                icon: <DarkModeOutlined sx={{ fontSize: 16 }} aria-hidden />,
                onClick: () => setScheme('dark') },
              { label: 'High Contrast', selected: scheme === 'highContrast',
                icon: <ContrastOutlined sx={{ fontSize: 16 }} aria-hidden />,
                onClick: () => setScheme('highContrast') },
            ]}
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
            trigger={who ? initialsOf(who) : <PersonOutlined sx={{ fontSize: 17 }} aria-hidden />}
            header={who || user?.email || 'Signed in'}
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
            <div className="navsec" key={sec.title} role="group" aria-label={sec.title}>
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
        <Outlet />
      </div>
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      </ToastHost>
    </div>
  );
}
