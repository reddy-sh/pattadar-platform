import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import ContrastRounded from '@mui/icons-material/ContrastRounded';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import { Link, NavLink, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider';

export type ThemeChoice = 'light' | 'dark' | 'contrast';

interface AppHeaderProps {
  onSearch: () => void;
  onTutor: () => void;
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
}

export function AppHeader({ onSearch, onTutor, theme, onThemeChange }: AppHeaderProps) {
  const { user, isLoading, isPreview, signIn } = useAuth();
  const location = useLocation();
  return (
    <header className="app-header">
      <div className="app-header__bar page-shell">
        <Link className="brand" to="/" aria-label="Pattadar University home">
          <span className="brand__mark"><SchoolOutlined /></span>
          <span><strong>Pattadar</strong><small>University</small></span>
        </Link>
        <button className="search-pill" type="button" onClick={onSearch} aria-label="Search courses, state guides, locations, and work">
          <SearchRounded />
          <span>Search courses, states, roles, locations</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="app-header__actions">
          <button className="icon-button mobile-tutor-button" type="button" onClick={onTutor} aria-label="Open AI tutor">
            <SmartToyOutlined />
          </button>
          <label className="theme-picker">
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
          {user ? (
            <Link className="account-button" to="/account" aria-label="Open university account">
              <AccountCircleOutlined /><span>{user.name}</span>
            </Link>
          ) : null}
        </div>
      </div>
      <nav className="section-nav page-shell" aria-label="University">
        <NavLink to="/" end>Explore</NavLink>
        <NavLink to="/learn">My learning</NavLink>
        <NavLink to="/opportunities">Opportunities</NavLink>
        <NavLink to="/states">State guides</NavLink>
        <NavLink to="/locations/hyderabad">Locations</NavLink>
      </nav>
    </header>
  );
}
