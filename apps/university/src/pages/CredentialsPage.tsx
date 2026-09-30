import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { PageMeta } from '../components/PageMeta';
import { courseById } from '../data/catalog';
import { progressFor } from '../domain/learning';
import { downloadCompletionPreview } from '../pdf/coursePdf';
import { useUniversity } from '../state/UniversityProvider';

const issuanceSteps = [
  { title: 'Complete the course', detail: 'Finish the lessons and knowledge checks for a fixed course version.', state: 'Preview available' },
  { title: 'Submit practical evidence', detail: 'A practice or professional assessment needs a reviewable submission, not only a quiz answer.', state: 'Planned' },
  { title: 'Receive human review', detail: 'An authorised reviewer checks the work, identity, role limits, and any required professional qualification.', state: 'Planned' },
  { title: 'Issue and verify', detail: 'The Pattadar associate desk already supports signed internal training certificates and public status checks. University course evidence is not connected to it yet.', state: 'Desk service exists' },
];

export function CredentialsPage() {
  const { user } = useAuth();
  const { enrollments, isReady } = useUniversity();
  const completed = enrollments.flatMap((enrollment) => {
    const course = courseById(enrollment.courseId);
    return course && progressFor(course, enrollment) === 100 ? [course] : [];
  });

  return (
    <main className="page-shell interior-page credentials-page">
      <PageMeta title="Certificates and Completion | Pattadar University" description="Learn what Pattadar University completion previews show and what assessment, human review, and verification are required for future certificates." path="/credentials" />
      <header className="page-heading">
        <span className="context-line">Credentials and completion</span>
        <h1>How certificates work</h1>
        <p>Courses can build a learning record today. This learner app does not issue verified certificates. A separate Pattadar associate desk can issue signed internal training certificates, but it does not read this course progress. The steps below show what must be connected before a University course can lead to one.</p>
      </header>

      <section className="credential-boundary" aria-labelledby="credential-boundary-title">
        <WorkspacePremiumOutlined />
        <div><h2 id="credential-boundary-title">A completion preview is not a certificate</h2><p>Progress is currently saved in this browser. The downloadable PDF is a personal preview with no certificate number, official endorsement, licence, or employer clearance.</p></div>
      </section>

      <p className="credential-desk-note">For employees and service associates: an authorised Pattadar desk may issue a separate internal training certificate from documented training evidence. That record can be verified or revoked through the Pattadar platform. It does not replace a government licence or professional registration.</p>

      <section className="credential-section" aria-labelledby="issuance-title">
        <header className="section-heading"><div><h2 id="issuance-title">The route to an issued credential</h2><p>The same rules apply across buyer, seller, employee, and service pathways, with extra evidence and qualification checks for professional work.</p></div></header>
        <ol className="issuance-list">
          {issuanceSteps.map((step, index) => (
            <li key={step.title}>
              <span className="pathway-stage__number">{String(index + 1).padStart(2, '0')}</span>
              <div><h3>{step.title}</h3><p>{step.detail}</p></div>
              <span className="issuance-list__state">{step.state}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="credential-section" aria-labelledby="my-completions-title">
        <header className="section-heading"><div><h2 id="my-completions-title">My completion previews</h2><p>These downloads show what you completed in the local learning record. They cannot be independently verified.</p></div><Link className="text-action" to="/learn">Open my learning <ArrowForwardRounded /></Link></header>
        {!isReady ? <p role="status">Loading learning record…</p> : null}
        {isReady && completed.length === 0 ? (
          <div className="account-empty-row"><WorkspacePremiumOutlined /><div><strong>No completed courses yet</strong><p>Choose a pathway, then finish its course modules to unlock a preview.</p></div><Link className="button button--quiet" to="/pathways">View pathways</Link></div>
        ) : null}
        {completed.length > 0 ? (
          <div className="account-certificate-list">
            {completed.map((course) => (
              <article className="account-certificate-row" key={course.id}>
                <WorkspacePremiumOutlined />
                <div><strong>{course.title}</strong><span>Completion preview · {course.contentVersion}</span></div>
                <button className="button button--quiet" type="button" onClick={() => void downloadCompletionPreview(course, user?.name ?? 'Pattadar learner')}><DownloadRounded /> Download preview</button>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
