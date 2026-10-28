import ContrastRounded from '@mui/icons-material/ContrastRounded';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import TrackChangesOutlined from '@mui/icons-material/TrackChangesOutlined';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import type { ThemeChoice } from '../state/useThemeChoice';
import { HeaderMenu } from './HeaderMenu';

function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\s.]/gu, ' ').split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The account circle: the provider's photo, else initials, else the person
 *  mark — the same order as the Pattadar app's top bar. */
function Face({ picture, name }: { picture: string; name: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [picture]);
  const initials = initialsOf(name);
  if (picture && !broken) {
    return <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return initials ? <span aria-hidden>{initials}</span> : <PersonOutlined aria-hidden />;
}

interface AppHeaderProps {
  onSearch: () => void;
  onTutor: () => void;
  /** The saved colour scheme and the switcher's options (registry order). */
  theme: ThemeChoice;
}

export function AppHeader({ onSearch, onTutor, theme }: AppHeaderProps) {
  const { user, isLoading, isPreview, signIn, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <header className="app-header">
      <div className="app-header__bar page-shell">
        <Link className="brand" to="/" aria-label="Pattadar University home">
          <span className="brand__mark"><SchoolOutlined /></span>
          <span><strong>Pattadar</strong><small>University</small></span>
        </Link>
        <button className="search-pill" type="button" onClick={onSearch} aria-label="Search pathways, courses, certificates, state guides, locations, and work">
          <SearchRounded />
          <span>Search paths, courses, states, roles</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="app-header__actions">
          <HeaderMenu
            label="Appearance"
            trigger={<ContrastRounded aria-hidden />}
            items={theme.options.map((o) => ({
              label: o.label,
              selected: theme.choice === o.id,
              onSelect: () => theme.choose(o.id),
            }))}
          />
          <button className="header-icon" type="button" onClick={onTutor} aria-label="Open AI tutor">
            <SmartToyOutlined aria-hidden />
          </button>
          {isLoading ? <span className="header-status">Checking session</span> : null}
          {!isLoading && !user ? (
            <button className="button button--primary" type="button" onClick={() => void signIn(location.pathname)}>
              Sign in
            </button>
          ) : null}
          {user && isPreview ? <span className="preview-badge">Preview</span> : null}
          {user ? (
            <HeaderMenu
              label={`Your account — ${user.name}`}
              triggerClassName="header-avatar"
              trigger={<Face picture={user.picture} name={user.name} />}
              heading={<><strong>{user.name}</strong>{user.email ? <small>{user.email}</small> : null}</>}
              items={[
                { label: 'My learning', icon: <TrackChangesOutlined aria-hidden />, onSelect: () => navigate('/learn') },
                { label: 'Account', icon: <PersonOutlined aria-hidden />, onSelect: () => navigate('/account') },
                { label: 'Sign out', icon: <LogoutOutlined aria-hidden />, rule: true, onSelect: () => { void signOut(); } },
              ]}
            />
          ) : null}
        </div>
      </div>
      <nav className="section-nav page-shell" aria-label="University">
        <NavLink to="/" end>Explore</NavLink>
        <NavLink to="/pathways">Pathways</NavLink>
        <NavLink to="/learn">My learning</NavLink>
        <NavLink to="/credentials">Certificates</NavLink>
        <NavLink to="/opportunities">Opportunities</NavLink>
        <NavLink to="/states">State guides</NavLink>
        <NavLink to="/locations">Locations</NavLink>
      </nav>
    </header>
  );
}
