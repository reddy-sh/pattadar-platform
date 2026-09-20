import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import ContrastRounded from '@mui/icons-material/ContrastRounded';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { Link, NavLink, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider';

export type ThemeChoice = 'light' | 'dark' | 'contrast';

interface AppHeaderProps {
  onSearch: () => void;
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
}

export function AppHeader({ onSearch, theme, onThemeChange }: AppHeaderProps) {
  const { user, isLoading, isPreview, signIn, signOut } = useAuth();
  const location = useLocation();
  return (
    <header className="app-header">
      <div className="app-header__bar page-shell">
        <Link className="brand" to="/" aria-label="Pattadar University home">
          <span className="brand__mark"><SchoolOutlined /></span>
          <span><strong>Pattadar</strong><small>University</small></span>
        </Link>
        <button className="search-pill" type="button" onClick={onSearch} aria-label="Search courses, locations, and work">
          <SearchRounded />
          <span>Search courses, roles, locations</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="app-header__actions">
          <label className="theme-picker" title="Appearance">
            <ContrastRounded />
            <span className="sr-only">Appearance</span>
            <select value={theme} onChange={(event) => onThemeChange(event.target.value as ThemeChoice)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="contrast">High contrast</option>
            </select>
          </label>
          {isLoading ? <span className="header-status">Checking session</span> : null}
          {!isLoading && !user ? (
            <button className="button button--primary" type="button" onClick={() => void signIn(location.pathname)}>
              Sign in
            </button>
          ) : null}
          {user && isPreview ? <span className="preview-badge">Preview</span> : null}
          {user && !isPreview ? (
            <button className="account-button" type="button" onClick={() => void signOut()} title="Sign out of Pattadar">
              <AccountCircleOutlined /><span>{user.name}</span>
            </button>
          ) : null}
        </div>
      </div>
      <nav className="section-nav page-shell" aria-label="University">
        <NavLink to="/" end>Explore</NavLink>
        <NavLink to="/learn">My learning</NavLink>
        <NavLink to="/opportunities">Opportunities</NavLink>
        <NavLink to="/locations/hyderabad">Locations</NavLink>
      </nav>
    </header>
  );
}
