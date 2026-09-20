import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { courseById } from '../data/catalog';
import { progressFor } from '../domain/learning';
import { downloadCertificate, downloadCourseGuide } from '../pdf/coursePdf';
import { useUniversity } from '../state/UniversityProvider';

export function LearningPage() {
  const { user } = useAuth();
  const { enrollments, isReady } = useUniversity();
  const rows = enrollments.flatMap((enrollment) => {
    const course = courseById(enrollment.courseId);
    return course ? [{ course, enrollment, progress: progressFor(course, enrollment) }] : [];
  });

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
      <div className="learning-list">
        {rows.map(({ course, enrollment, progress }) => (
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
              <button className="button button--quiet" type="button" onClick={() => downloadCourseGuide(course)}><DownloadRounded /> Guide</button>
              <button
                className="button button--quiet"
                type="button"
                disabled={progress !== 100}
                title={progress === 100 ? 'Download certificate' : 'Complete every module to unlock the certificate'}
                onClick={() => downloadCertificate(course, user?.name ?? 'Pattadar learner')}
              >
                <WorkspacePremiumOutlined /> Certificate
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
