import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import BookmarkBorderRounded from '@mui/icons-material/BookmarkBorderRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { courseById } from '../data/catalog';
import { progressFor } from '../domain/learning';
import { downloadCompletionPreview } from '../pdf/coursePdf';
import { useUniversity } from '../state/UniversityProvider';

export function AccountPage() {
  const { user, isLoading, isPreview, signIn, signOut } = useAuth();
  const { enrollments, interestedOpportunityIds, isReady } = useUniversity();
  const learning = enrollments.flatMap((enrollment) => {
    const course = courseById(enrollment.courseId);
    return course ? [{ course, enrollment, progress: progressFor(course, enrollment) }] : [];
  });
  const completed = learning.filter(({ progress }) => progress === 100);
  const completedLessons = learning.reduce(
    (total, { enrollment }) => total + enrollment.completedModuleIds.length,
    0,
  );
  const totalLessons = learning.reduce((total, { course }) => total + course.modules.length, 0);

  if (isLoading || !isReady) {
    return <main className="page-shell loading-block" role="status">Loading account...</main>;
  }

  if (!user) {
    return (
      <main className="page-shell interior-page">
        <section className="empty-state">
          <AccountCircleOutlined />
          <h1>Sign in to open your account</h1>
          <p>Your learning record, saved opportunities, and completion artifacts are tied to your Pattadar login.</p>
          <button className="button button--primary" type="button" onClick={() => void signIn('/account')}>
            <LoginRounded /> Sign in
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell account-page">
      <header className="account-page-heading">
        <div>
          <span className="context-line">Account</span>
          <h1>Profile</h1>
          <p>Your identity and University activity, connected to your Pattadar account.</p>
        </div>
        {!isPreview ? (
          <button className="button button--quiet" type="button" onClick={() => void signOut()}>
            <LogoutRounded /> Sign out
          </button>
        ) : null}
      </header>

      <div className="account-profile-grid">
        <section className="account-profile-card" aria-labelledby="account-details-title">
          <div className="account-identity">
            <span className="account-avatar" aria-hidden="true">{user.name.trim().slice(0, 1).toUpperCase() || 'P'}</span>
            <div>
              <h2 id="account-details-title">{user.name}</h2>
              <span>{user.id}</span>
            </div>
          </div>
          <div className="account-field"><span>Email</span><strong>{user.email}</strong></div>
          <div className="account-field"><span>Access</span><strong>{isPreview ? 'University preview learner' : 'Pattadar University learner'}</strong></div>
          <p className="account-session-note">
            {isPreview
              ? 'This local preview uses a sample Pattadar identity. Production learning records follow the signed-in platform account.'
              : 'You are signed in through the Pattadar platform. Your University record follows this account.'}
          </p>
        </section>

        <section className="account-profile-card account-record-card" aria-labelledby="account-record-title">
          <div>
            <span className="context-line">University</span>
            <h2 id="account-record-title">Learning record</h2>
          </div>
          <dl className="account-summary" aria-label="Learning account summary">
            <div><dt>Joined courses</dt><dd>{learning.length}</dd></div>
            <div><dt>Completed</dt><dd>{completed.length}</dd></div>
            <div><dt>Lessons finished</dt><dd>{completedLessons}<small> of {totalLessons}</small></dd></div>
            <div><dt>Saved opportunities</dt><dd>{interestedOpportunityIds.length}</dd></div>
          </dl>
          <Link className="text-action" to="/learn">Open learning record <ArrowForwardRounded /></Link>
        </section>
      </div>

      <section className="account-section" aria-labelledby="account-learning-title">
        <div className="account-section__heading">
          <div><span className="context-line">Courses</span><h2 id="account-learning-title">My learning</h2></div>
          <Link className="text-action" to="/learn">Open learning record <ArrowForwardRounded /></Link>
        </div>
        {learning.length === 0 ? (
          <div className="account-empty-row">
            <SchoolOutlined />
            <div><strong>No courses joined yet</strong><p>Choose a course to start building your learning record.</p></div>
            <Link className="button button--primary" to="/">Explore courses</Link>
          </div>
        ) : (
          <div className="account-learning-list">
            {learning.map(({ course, enrollment, progress }) => (
              <article className="account-learning-row" key={enrollment.id}>
                <div><strong>{course.title}</strong><span>{course.credential}</span></div>
                <div className="account-progress"><progress value={progress} max="100">{progress}%</progress><span>{progress}% complete</span></div>
                <Link className="button button--quiet" to={`/courses/${course.slug}`}>
                  {progress === 100 ? 'Review' : 'Continue'} <ArrowForwardRounded />
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="account-section" aria-labelledby="account-certificates-title">
        <div className="account-section__heading">
          <div><span className="context-line">Credentials</span><h2 id="account-certificates-title">My certificates</h2></div>
          <WorkspacePremiumOutlined />
        </div>
        <p className="account-governance-note">
          Completed courses currently unlock a completion preview. Formally issued credentials will appear here only after the required assessment, reviewer approval, and verification record are available.
        </p>
        {completed.length === 0 ? (
          <div className="account-empty-row">
            <WorkspacePremiumOutlined />
            <div><strong>No completion previews yet</strong><p>Finish every module in a joined course to unlock its preview.</p></div>
            <Link className="button button--quiet" to="/learn">View progress</Link>
          </div>
        ) : (
          <div className="account-certificate-list">
            {completed.map(({ course, enrollment }) => (
              <article className="account-certificate-row" key={enrollment.id}>
                <WorkspacePremiumOutlined />
                <div><strong>{course.credential}</strong><span>{course.title} · Completion preview</span></div>
                <button className="button button--quiet" type="button" onClick={() => void downloadCompletionPreview(course, user.name)}>
                  <DownloadRounded /> Download preview
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="account-section" aria-labelledby="account-opportunities-title">
        <div className="account-section__heading">
          <div><span className="context-line">Work pathways</span><h2 id="account-opportunities-title">Saved opportunities</h2></div>
          <BookmarkBorderRounded />
        </div>
        <div className="account-empty-row">
          <BookmarkBorderRounded />
          <div>
            <strong>{interestedOpportunityIds.length} saved {interestedOpportunityIds.length === 1 ? 'opportunity' : 'opportunities'}</strong>
            <p>Review pathways you marked for future work or mentoring.</p>
          </div>
          <Link className="button button--quiet" to="/opportunities">Open opportunities</Link>
        </div>
      </section>
    </main>
  );
}
