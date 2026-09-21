import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { DiscoveryFilters } from '../components/DiscoveryFilters';
import { courseById } from '../data/catalog';
import { courseMatchesDiscovery } from '../domain/discovery';
import { progressFor } from '../domain/learning';
import { downloadCompletionPreview, downloadCourseGuide } from '../pdf/coursePdf';
import { useDiscoveryFilters } from '../state/useDiscoveryFilters';
import { useUniversity } from '../state/UniversityProvider';

export function LearningPage() {
  const { user } = useAuth();
  const { enrollments, isReady } = useUniversity();
  const { filters, updateFilters, clearFilters, hasActiveFilters } = useDiscoveryFilters();
  const rows = enrollments.flatMap((enrollment) => {
    const course = courseById(enrollment.courseId);
    return course ? [{ course, enrollment, progress: progressFor(course, enrollment) }] : [];
  });
  const visibleRows = rows.filter(({ course }) => courseMatchesDiscovery(course, filters));

  return (
    <main className="page-shell interior-page">
      <header className="page-heading">
        <span className="context-line">Personal learning record</span>
        <h1>My learning</h1>
        <p>Continue modules, download enrolled course guides, and retrieve completed credentials.</p>
      </header>
      {!isReady ? <div className="loading-block" role="status">Loading learning record…</div> : null}
      {isReady && rows.length === 0 ? (
        <section className="empty-state">
          <WorkspacePremiumOutlined />
          <h2>No courses joined yet</h2>
          <p>Courses group lessons, field practice, mentor review, and credentials into one learning record.</p>
          <Link className="button button--primary" to="/">Choose a course</Link>
        </section>
      ) : null}
      {isReady && rows.length > 0 ? (
        <DiscoveryFilters
          idPrefix="learning"
          filters={filters}
          hasActiveFilters={hasActiveFilters}
          resultCount={visibleRows.length}
          totalCount={rows.length}
          onChange={updateFilters}
          onClear={clearFilters}
        />
      ) : null}
      {isReady && rows.length > 0 && visibleRows.length === 0 ? (
        <section className="filter-empty" aria-live="polite">
          <SearchOffRounded />
          <div><h2>No enrolled courses match</h2><p>Clear the filters to return to your complete learning record.</p></div>
          <button className="button button--quiet" type="button" onClick={clearFilters}>Clear filters</button>
        </section>
      ) : null}
      {visibleRows.length > 0 ? (
        <div className="learning-list" aria-live="polite">
          {visibleRows.map(({ course, enrollment, progress }) => (
            <article className="learning-row" key={enrollment.id}>
              <div>
                <span className="learning-row__level">{course.level}</span>
                <h2>{course.title}</h2>
                <p>{course.credential}</p>
              </div>
              <div className="progress-block">
                <div><span>Progress</span><strong>{progress}%</strong></div>
                <progress value={progress} max="100">{progress}%</progress>
                <span>{enrollment.completedModuleIds.length} of {course.modules.length} modules</span>
              </div>
              <div className="learning-row__actions">
                <Link className="button button--primary" to={`/courses/${course.slug}`}>Continue <ArrowForwardRounded /></Link>
                <button className="button button--quiet" type="button" onClick={() => void downloadCourseGuide(course)}><DownloadRounded /> Guide</button>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={progress !== 100}
                  aria-label={progress === 100 ? 'Download completion preview' : 'Completion preview locked until every module is complete'}
                  onClick={() => void downloadCompletionPreview(course, user?.name ?? 'Pattadar learner')}
                >
                  <WorkspacePremiumOutlined /> Completion preview
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </main>
  );
}
