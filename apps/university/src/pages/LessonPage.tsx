import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PlayCircleOutlineRounded from '@mui/icons-material/PlayCircleOutlineRounded';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CourseVisual } from '../components/CourseVisual';
import { contentForModule } from '../content';
import { courseBySlug } from '../data/catalog';
import { coverageForModule } from '../data/complianceCoverage';
import { officialReferencesById } from '../data/officialReferences';
import type { Course } from '../domain/types';
import { downloadCourseGuide } from '../pdf/coursePdf';
import { useUniversity } from '../state/UniversityProvider';

export function LessonPage({ onTutor }: { onTutor: (course: Course) => void }) {
  const { slug, moduleId } = useParams();
  const course = courseBySlug(slug);
  const moduleIndex = course?.modules.findIndex((item) => item.id === moduleId) ?? -1;
  const module = moduleIndex >= 0 ? course?.modules[moduleIndex] : undefined;
  const content = contentForModule(moduleId);
  const { enrollmentFor, joinCourse, toggleCourseModule } = useUniversity();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSelectedOption(null);
    setChecked(false);
  }, [moduleId]);

  if (!course || !module || !content) {
    return (
      <main className="page-shell empty-page">
        <h1>Lesson not found</h1>
        <p>The lesson may have moved or is not yet published.</p>
        <Link className="button button--primary" to={course ? `/courses/${course.slug}` : '/'}>Back to course</Link>
      </main>
    );
  }

  const enrollment = enrollmentFor(course.id);
  const isComplete = enrollment?.completedModuleIds.includes(module.id) ?? false;
  const passed = checked && selectedOption === content.knowledgeCheck.correctOption;
  const previous = course.modules[moduleIndex - 1];
  const next = course.modules[moduleIndex + 1];
  const references = officialReferencesById(content.referenceIds);
  const complianceCoverage = coverageForModule(module.id);

  return (
    <main className="lesson-page">
      <div className="page-shell">
        <Link className="back-link" to={`/courses/${course.slug}`}><ArrowBackRounded /> {course.title}</Link>

        <header className="lesson-heading">
          <div className="lesson-heading__copy">
            <span className="lesson-kicker">Lesson {moduleIndex + 1} of {course.modules.length} · {module.kind.replace('-', ' ')} · {module.minutes} min</span>
            <h1>{module.title}</h1>
            <p>{content.overview}</p>
            <div className="lesson-heading__actions">
              <button className="button button--quiet" type="button" onClick={() => onTutor(course)}><SmartToyOutlined /> Ask AI Tutor</button>
              <button className="button button--quiet" type="button" disabled={!enrollment} onClick={() => void downloadCourseGuide(course)}><DownloadRounded /> Course PDF</button>
            </div>
          </div>
          <CourseVisual course={course} priority />
        </header>

        {!enrollment ? (
          <section className="lesson-gate" aria-labelledby="lesson-gate-title">
            <LockOutlined />
            <div><h2 id="lesson-gate-title">Join to open this lesson</h2><p>Enrollment enables the complete reading, practice activity, knowledge check, downloads, and progress tracking.</p></div>
            <button className="button button--primary" type="button" onClick={() => void joinCourse(course.id)}>Join course</button>
          </section>
        ) : (
          <div className="lesson-layout">
            <article className="lesson-article">
              <section className="lesson-objectives">
                <span className="lesson-label">Learning objectives</span>
                <h2>By the end of this lesson</h2>
                <ul>{content.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
              </section>

              <aside className="video-plan" aria-label="Video lesson status">
                <PlayCircleOutlineRounded />
                <div><strong>Video lesson planned</strong><p>The complete learning material is available in the reading below. A reviewed video will be added in a later release.</p></div>
              </aside>

              {content.sections.map((section) => (
                <section className="lesson-section" key={section.heading}>
                  <h2>{section.heading}</h2>
                  <p>{section.body}</p>
                </section>
              ))}

              <section className="lesson-practice">
                <span className="lesson-label">Practice</span>
                <h2>{content.practice.title}</h2>
                <ol>{content.practice.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                <p><strong>Deliverable:</strong> {content.practice.deliverable}</p>
              </section>

              {references.length > 0 ? (
                <section className="lesson-references" aria-labelledby="official-references-title">
                  <span className="lesson-label">Official sources</span>
                  <h2 id="official-references-title">Government references</h2>
                  <p>These sources were reviewed on 20 September 2026. Verify the current government page and effective law before relying on a workflow.</p>
                  <ul>
                    {references.map((reference) => (
                      <li key={reference.id}>
                        <a href={reference.url} target="_blank" rel="noreferrer">
                          <span><strong>{reference.title}</strong><small>{reference.authority} · {reference.kind}</small></span>
                          <OpenInNewRounded aria-label="Open official government source" />
                        </a>
                        <p>{reference.description}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {complianceCoverage.length > 0 ? (
                <section className="lesson-compliance" aria-labelledby="compliance-alignment-title">
                  <span className="lesson-label">Compliance alignment</span>
                  <h2 id="compliance-alignment-title">Admin requirements covered here</h2>
                  <p>Training supports these published controls; it does not replace the live Admin policy or an authorised decision.</p>
                  <ul>
                    {complianceCoverage.map((requirement) => (
                      <li key={requirement.key}>
                        <CheckCircleRounded />
                        <Link to={`/compliance#coverage-${requirement.key}`}><strong>{requirement.title}</strong><small>{requirement.key}</small></Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="knowledge-check">
                <span className="lesson-label">Knowledge check</span>
                <h2>{content.knowledgeCheck.prompt}</h2>
                <div className="knowledge-options" role="radiogroup" aria-label="Answer choices">
                  {content.knowledgeCheck.options.map((option, index) => (
                    <label key={option} className={checked && index === content.knowledgeCheck.correctOption ? 'is-correct' : undefined}>
                      <input
                        type="radio"
                        name={`check-${module.id}`}
                        value={index}
                        checked={selectedOption === index}
                        onChange={() => { setSelectedOption(index); setChecked(false); }}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
                <button className="button button--quiet" type="button" disabled={selectedOption === null} onClick={() => setChecked(true)}>Check answer</button>
                {checked ? (
                  <p className={passed ? 'check-feedback is-correct' : 'check-feedback'} role="status">
                    <strong>{passed ? 'Correct.' : 'Not quite.'}</strong> {content.knowledgeCheck.explanation}
                  </p>
                ) : null}
              </section>

              <section className="lesson-completion">
                <div>
                  <span className="lesson-label">Progress</span>
                  <h2>{isComplete ? 'Lesson complete' : 'Finish this lesson'}</h2>
                  <p>{isComplete ? 'This lesson is included in your course progress.' : 'Pass the knowledge check, then record your completion.'}</p>
                </div>
                <button
                  className={isComplete ? 'button button--quiet' : 'button button--primary'}
                  type="button"
                  disabled={!isComplete && !passed}
                  onClick={() => void toggleCourseModule(course.id, module.id)}
                >
                  {isComplete ? <><CheckCircleRounded /> Mark incomplete</> : 'Mark lesson complete'}
                </button>
              </section>
            </article>

            <aside className="lesson-nav" aria-label="Course lessons">
              <span className="lesson-label">Course progress</span>
              <ol>
                {course.modules.map((item, index) => {
                  const complete = enrollment.completedModuleIds.includes(item.id);
                  return (
                    <li key={item.id} className={item.id === module.id ? 'is-current' : undefined}>
                      <Link to={`/courses/${course.slug}/lessons/${item.id}`} aria-current={item.id === module.id ? 'page' : undefined}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <strong>{item.title}</strong>
                        {complete ? <CheckCircleRounded aria-label="Complete" /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </aside>
          </div>
        )}

        <nav className="lesson-pager" aria-label="Lesson navigation">
          {previous ? <Link to={`/courses/${course.slug}/lessons/${previous.id}`}><ArrowBackRounded /> <span><small>Previous</small>{previous.title}</span></Link> : <span />}
          {next ? <Link to={`/courses/${course.slug}/lessons/${next.id}`}><span><small>Next</small>{next.title}</span> <ArrowForwardRounded /></Link> : <Link to={`/courses/${course.slug}`}><span><small>Course</small>Review course plan</span> <ArrowForwardRounded /></Link>}
        </nav>
      </div>
    </main>
  );
}
