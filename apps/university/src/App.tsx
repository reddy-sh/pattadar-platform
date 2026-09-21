import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router';
import { AiTutor } from './components/AiTutor';
import { AppHeader } from './components/AppHeader';
import type { ThemeChoice } from './components/AppHeader';
import { CommandPalette } from './components/CommandPalette';
import { Footer } from './components/Footer';
import type { Course } from './domain/types';
import { AccountPage } from './pages/AccountPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CoursePage } from './pages/CoursePage';
import { ComplianceCoveragePage } from './pages/ComplianceCoveragePage';
import { HomePage } from './pages/HomePage';
import { LearningPage } from './pages/LearningPage';
import { LocationPage } from './pages/LocationPage';
import { LessonPage } from './pages/LessonPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { StateGuidePage } from './pages/StateGuidePage';
import { StateGuidesPage } from './pages/StateGuidesPage';

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

  useEffect(() => {
    const targetId = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!targetId) {
      window.scrollTo(0, 0);
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.pathname]);

  const openTutor = (course?: Course) => {
    setTutorCourse(course);
    setTutorOpen(true);
  };

  if (location.pathname === '/auth/callback') {
    return <Routes><Route path="/auth/callback" element={<AuthCallbackPage />} /></Routes>;
  }

  return (
    <div className="app-frame">
      <AppHeader onSearch={() => setCommandOpen(true)} onTutor={() => openTutor()} theme={theme} onThemeChange={setTheme} />
      <Routes>
        <Route path="/" element={<HomePage onTutor={openTutor} />} />
        <Route path="/courses/:slug" element={<CoursePage onTutor={openTutor} />} />
        <Route path="/courses/:slug/lessons/:moduleId" element={<LessonPage onTutor={openTutor} />} />
        <Route path="/compliance" element={<ComplianceCoveragePage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/learn" element={<LearningPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/locations/:slug" element={<LocationPage />} />
        <Route path="/states" element={<StateGuidesPage />} />
        <Route path="/states/:slug" element={<StateGuidePage />} />
        <Route path="*" element={(
          <main className="page-shell empty-page">
            <h1>Page not found</h1>
            <p>The University link may be incomplete or no longer published.</p>
            <Link className="button button--primary" to="/">Open course catalog</Link>
          </main>
        )} />
      </Routes>
      <Footer />
      <CommandPalette open={commandOpen} onOpen={() => setCommandOpen(true)} onClose={() => setCommandOpen(false)} />
      <AiTutor open={tutorOpen} course={tutorCourse} onClose={() => setTutorOpen(false)} />
    </div>
  );
}
