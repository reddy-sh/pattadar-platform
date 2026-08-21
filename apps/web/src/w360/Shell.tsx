/**
 * The record-360 shell: wordmark + jump-to search + language + scheme toggle
 * across the top, one navigation rail down the left, the routed screen in the
 * rest. It is the frame every one of W01–W15 is drawn inside.
 *
 * The rail is ordered the way the product reasons, not alphabetically:
 * what you own, what others sent you, what others asked of you, then the
 * vault and the services over it, then people, then the machinery.
 *
 * Below 900px the rail becomes a drawer behind a hamburger — it used to
 * simply vanish, leaving a phone with no navigation at all. And the jump box
 * is a real search: it asks the API for parcels, papers and people as you
 * type and takes you straight to the hit, exactly as its placeholder promises.
 */
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import CalculateOutlined from '@mui/icons-material/CalculateOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import MailOutlined from '@mui/icons-material/MailOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import SaveAltOutlined from '@mui/icons-material/SaveAltOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';

import { useOrders, usePortfolio, useSearch } from './api';
import { Icon } from './ui';
import './w360.css';

const SCHEME_KEY = 'w360.scheme';
const RAIL_KEY = 'w360.rail';

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

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const portfolio = usePortfolio();
  const orders = useOrders();
  const [scheme, setScheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem(SCHEME_KEY) as 'dark' | 'light') || 'dark');

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
  const [railHidden, setRailHidden] = useState(() => localStorage.getItem(RAIL_KEY) === 'hidden');

  useEffect(() => { localStorage.setItem(SCHEME_KEY, scheme); }, [scheme]);
  useEffect(() => { localStorage.setItem(RAIL_KEY, railHidden ? 'hidden' : 'open'); }, [railHidden]);

  // One button, two behaviours: below the drawer breakpoint it slides the
  // drawer; above it it collapses the rail in place.
  const onMenu = () => {
    if (window.matchMedia('(max-width: 900px)').matches) setNavOpen((v) => !v);
    else setRailHidden((v) => !v);
  };

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

  const assigned = orders.data?.length ?? 0;
  const waiting = portfolio.data?.waiting.length ?? 0;

  const items: NavItem[] = [
    { to: '/app', label: 'Dashboard', icon: GridViewOutlined, end: true },
    { to: '/app/properties', label: 'Properties', icon: MapOutlined },
    { to: '/app/shared', label: 'Shared with me', icon: SaveAltOutlined },
    { to: '/app/assigned', label: 'Assigned to me', icon: AssignmentOutlined, count: assigned || undefined },
    { to: '/app/papers', label: 'Papers', icon: DescriptionOutlined },
    { to: '/app/services', label: 'Services', icon: HandshakeOutlined },
    { to: '/app/groups', label: 'Families & Groups', icon: GroupsOutlined },
    { to: '/app/invitations', label: 'Invitations', icon: MailOutlined },
    { to: '/app/notifications', label: 'Notifications', icon: NotificationsNoneOutlined,
      count: waiting ? waiting + 1 : undefined },
    { to: '/app/wallet', label: 'Wallet', icon: AccountBalanceWalletOutlined, dot: true },
    { to: '/app/tools', label: 'Tools', icon: CalculateOutlined },
    { to: '/app/audit', label: 'Audit Log', icon: FactCheckOutlined },
    { to: '/app/admin', label: 'Admin & Ref Data', icon: AdminPanelSettingsOutlined },
    { to: '/app/profile', label: 'Profile', icon: PersonOutlined },
  ];

  return (
    <div className="w360" data-scheme={scheme} data-rail={railHidden ? 'hidden' : 'open'}>
      <header className="topbar">
        <span className="row tight" style={{ flexWrap: 'nowrap' }}>
          <button
            type="button"
            className="iconbtn menu-btn"
            aria-label="Menu"
            aria-expanded={navOpen || !railHidden}
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
              aria-expanded={openResults && hits.length > 0}
              aria-controls="w360-jump-results"
              aria-autocomplete="list"
              autoComplete="off"
            />
            <kbd>⌘K</kbd>
          </form>

          {openResults && q.trim().length >= 2 && (
            <div className="jump-results" id="w360-jump-results" role="listbox"
                 aria-label="Search results">
              {hits.map((h, i) => (
                <button
                  key={`${h.kind}-${h.id}`}
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
              {hits.length === 0 && !search.isFetching && (
                <p className="note" style={{ padding: '0.75rem 0.875rem', margin: 0 }}>
                  Nothing matches “{q.trim()}” — not a parcel, a paper or a person.
                </p>
              )}
              {hits.length === 0 && search.isFetching && (
                <p className="note" style={{ padding: '0.75rem 0.875rem', margin: 0 }}>Searching…</p>
              )}
            </div>
          )}
        </div>

        <div className="topbar-right">
          <div className="lang" role="group" aria-label="Language">
            <button type="button" aria-pressed="true">EN</button>
            <button type="button" aria-pressed="false">తెలుగు</button>
          </div>
          <button
            type="button"
            className="iconbtn"
            onClick={() => setScheme(scheme === 'dark' ? 'light' : 'dark')}
            aria-label={scheme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            {scheme === 'dark'
              ? <DarkModeOutlined sx={{ fontSize: 18 }} />
              : <LightModeOutlined sx={{ fontSize: 18 }} />}
          </button>
          <button type="button" className="iconbtn assistant-btn" aria-label="Assistant">
            <SmartToyOutlined sx={{ fontSize: 18 }} />
          </button>
          <span className="avatar" aria-label="Your account">S</span>
        </div>
      </header>

      <div className="body">
        {navOpen && (
          <button type="button" className="nav-scrim" aria-label="Close menu"
                  onClick={() => setNavOpen(false)} />
        )}
        <nav className={navOpen ? 'nav open' : 'nav'} aria-label="Sections">
          {items.map((it) => (
            // The label sits in its own span so the collapsed rail can hide the
            // words and keep the icons; title + aria-label keep each entry
            // named when only its icon shows.
            <NavLink key={it.to} to={it.to} end={it.end} title={it.label}
                     aria-label={it.label} onClick={() => setNavOpen(false)}>
              <it.icon sx={{ fontSize: 19 }} aria-hidden />
              <span className="lbl">{it.label}</span>
              {it.count !== undefined && <span className="count">{it.count}</span>}
              {it.dot && <span className="dot" aria-hidden />}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
