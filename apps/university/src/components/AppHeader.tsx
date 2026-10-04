import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import ContrastRounded from '@mui/icons-material/ContrastRounded';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import { Link, NavLink, useLocation } from 'react-router';
import { isSchemeId } from '@pattadar/tokens';
import { useAuth } from '../auth/AuthProvider';
import type { ThemeChoice } from '../state/useThemeChoice';

interface AppHeaderProps {
  onSearch: () => void;
  onTutor: () => void;
  /** The saved colour scheme and the switcher's options (registry order). */
  theme: ThemeChoice;
}

export function AppHeader({ onSearch, onTutor, theme }: AppHeaderProps) {
  const { user, isLoading, isPreview, signIn } = useAuth();
  const location = useLocation();
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
          <button className="icon-button mobile-tutor-button" type="button" onClick={onTutor} aria-label="Open AI tutor">
            <SmartToyOutlined />
          </button>
          <label className="theme-picker">
            <ContrastRounded />
            <span className="sr-only">Appearance</span>
            <select
              value={theme.choice}
              onChange={(event) => { if (isSchemeId(event.target.value)) theme.choose(event.target.value); }}
            >
              {theme.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          {isLoading ? <span className="header-status">Checking session</span> : null}
          {!isLoading && !user ? (
            <button className="button button--primary" type="button" onClick={() => void signIn(location.pathname)}>
              Sign in
            </button>
          ) : null}
          {user && isPreview ? <span className="preview-badge">Preview</span> : null}
          {user ? (
            <Link className="account-button" to="/account" aria-label="Open university account">
              <AccountCircleOutlined /><span>{user.name}</span>
            </Link>
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
