import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router';
import { AiTutor } from './components/AiTutor';
import { AppHeader } from './components/AppHeader';
import type { ThemeChoice } from './components/AppHeader';
import { CommandPalette } from './components/CommandPalette';
import { Footer } from './components/Footer';
import type { Course } from './domain/types';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CoursePage } from './pages/CoursePage';
import { HomePage } from './pages/HomePage';
import { LearningPage } from './pages/LearningPage';
import { LocationPage } from './pages/LocationPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';

const THEME_KEY = 'pattadar.university.theme';

function initialTheme(): ThemeChoice {
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === 'dark' || saved === 'contrast' || saved === 'light' ? saved : 'light';
}

export function App() {
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorCourse, setTutorCourse] = useState<Course | undefined>();
  const [theme, setTheme] = useState<ThemeChoice>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const openTutor = (course?: Course) => {
    setTutorCourse(course);
    setTutorOpen(true);
  };

  if (location.pathname === '/auth/callback') {
    return <Routes><Route path="/auth/callback" element={<AuthCallbackPage />} /></Routes>;
  }

  return (
    <div className="app-frame">
      <AppHeader onSearch={() => setCommandOpen(true)} theme={theme} onThemeChange={setTheme} />
      <Routes>
        <Route path="/" element={<HomePage onTutor={openTutor} />} />
        <Route path="/courses/:slug" element={<CoursePage onTutor={openTutor} />} />
        <Route path="/learn" element={<LearningPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/locations/:slug" element={<LocationPage />} />
        <Route path="*" element={(
          <main className="page-shell empty-page">
            <h1>Page not found</h1>
            <p>The University link may be incomplete or no longer published.</p>
            <Link className="button button--primary" to="/">Open course catalog</Link>
          </main>
        )} />
      </Routes>
      <Footer />
      <button className="tutor-launcher" type="button" onClick={() => openTutor()} aria-label="Open AI tutor" title="Open AI tutor">
        <SmartToyOutlined /><span>AI tutor</span>
      </button>
      <CommandPalette open={commandOpen} onOpen={() => setCommandOpen(true)} onClose={() => setCommandOpen(false)} />
      <AiTutor open={tutorOpen} course={tutorCourse} onClose={() => setTutorOpen(false)} />
    </div>
  );
}
