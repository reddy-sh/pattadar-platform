import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { CourseVisual } from '../components/CourseVisual';
import { courseBySlug, roleLabels } from '../data/catalog';
import { progressFor } from '../domain/learning';
import type { Course } from '../domain/types';
import { downloadCompletionPreview, downloadCourseGuide } from '../pdf/coursePdf';
import { useUniversity } from '../state/UniversityProvider';

export function CoursePage({ onTutor }: { onTutor: (course: Course) => void }) {
  const { slug } = useParams();
  const course = courseBySlug(slug);
  const { user } = useAuth();
  const { enrollmentFor, joinCourse, toggleCourseModule } = useUniversity();

  if (!course) {
    return (
      <main className="page-shell empty-page">
        <h1>Course not found</h1>
        <p>The course link may have changed or the course is not published.</p>
        <Link className="button button--primary" to="/">Browse courses</Link>
      </main>
    );
  }

  const enrollment = enrollmentFor(course.id);
  const progress = progressFor(course, enrollment);
  const completed = new Set(enrollment?.completedModuleIds ?? []);

  return (
    <main className="course-page">
      <div className="page-shell">
        <Link className="back-link" to="/"><ArrowBackRounded /> Course catalog</Link>
        <section className="course-overview">
          <div className="course-overview__copy">
            <div className="course-overview__meta"><span>{course.level}</span><span>{course.language}</span><span>{course.priceLabel}</span></div>
            <h1>{course.title}</h1>
            <p>{course.summary}</p>
            <div className="course-overview__actions">
              {enrollment ? (
                <span className="enrolled-label"><CheckCircleRounded /> Enrolled · {progress}% complete</span>
              ) : (
                <button className="button button--primary" type="button" onClick={() => void joinCourse(course.id)}>Join course</button>
              )}
              <button className="button button--quiet" type="button" onClick={() => onTutor(course)}><SmartToyOutlined /> Ask tutor</button>
            </div>
          </div>
          <CourseVisual tone={course.tone} />
        </section>

        <section className="course-content">
          <div className="course-modules">
            <header className="section-heading section-heading--compact">
              <div><h2>Course plan</h2><p>{course.outcome}</p></div>
            </header>
            <ol className="module-list">
              {course.modules.map((module, index) => {
                const isComplete = completed.has(module.id);
                return (
                  <li key={module.id} className={isComplete ? 'module-row is-complete' : 'module-row'}>
                    <span className="module-row__number">{String(index + 1).padStart(2, '0')}</span>
                    <label>
                      <input
                        type="checkbox"
                        checked={isComplete}
                        disabled={!enrollment}
                        onChange={() => void toggleCourseModule(course.id, module.id)}
                      />
                      <span><strong>{module.title}</strong><small>{module.kind.replace('-', ' ')} · {module.minutes} min</small></span>
                    </label>
                    {!enrollment ? <LockOutlined aria-label="Join the course to track this module" /> : null}
                  </li>
                );
              })}
            </ol>
          </div>

          <aside className="course-facts" aria-label="Course details">
            <div><span>For</span><strong>{course.roles.map((role) => roleLabels[role]).join(' · ')}</strong></div>
            <div><span>Credential</span><strong>{course.credential}</strong></div>
            <div><span>Content version</span><strong>{course.contentVersion}</strong></div>
            <div className="course-resources">
              <span>Resources</span>
              <button className="resource-button" type="button" disabled={!enrollment} onClick={() => void downloadCourseGuide(course)}>
                <DownloadRounded /> Download course guide <small>PDF</small>
              </button>
              <button
                className="resource-button"
                type="button"
                disabled={progress !== 100}
                aria-label={progress === 100 ? 'Download completion preview' : 'Completion preview locked until every module is complete'}
                onClick={() => void downloadCompletionPreview(course, user?.name ?? 'Pattadar learner')}
              >
                <WorkspacePremiumOutlined /> Completion preview <small>{progress === 100 ? 'PDF' : 'Locked'}</small>
              </button>
            </div>
            <p className="boundary-note">This course teaches a repeatable process. Live legal, survey, engineering, or safety decisions still require a qualified professional.</p>
          </aside>
        </section>
      </div>

    </main>
  );
}
