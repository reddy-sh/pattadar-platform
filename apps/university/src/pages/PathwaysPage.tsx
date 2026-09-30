import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import { Link } from 'react-router';
import { PageMeta } from '../components/PageMeta';
import { learningPathways, pathwayCourses } from '../data/pathways';
import { progressFor } from '../domain/learning';
import { useUniversity } from '../state/UniversityProvider';

export function PathwaysPage() {
  const { enrollmentFor } = useUniversity();

  return (
    <main className="page-shell interior-page pathways-page">
      <PageMeta title="Learning Pathways | Pattadar University" description="Suggested course sequences for property buyers, sellers, Pattadar employees, and service professionals, with current coverage and certificate limits." path="/pathways" />
      <header className="page-heading">
        <span className="context-line">Pattadar University · learning map</span>
        <h1>Find your learning path</h1>
        <p>Follow a suggested order for buying, selling, employee training, or service work. You can join any available course directly; these paths are guidance, not enforced prerequisites.</p>
      </header>

      <nav className="pathway-jump" aria-label="Jump to a learning path">
        {learningPathways.map((pathway) => (
          <a key={pathway.id} href={`#${pathway.id}`}>{pathway.audience} <ArrowForwardRounded /></a>
        ))}
      </nav>

      <div className="pathway-sections">
        {learningPathways.map((pathway) => (
          <section className="pathway-section" id={pathway.id} key={pathway.id} aria-labelledby={`${pathway.id}-title`}>
            <header className="pathway-section__heading">
              <div><span className="context-line">{pathway.audience}</span><h2 id={`${pathway.id}-title`}>{pathway.title}</h2><p>{pathway.summary}</p></div>
              <span className="pathway-section__count">{pathway.stages.length} stages</span>
            </header>
            <ol className="pathway-stages">
              {pathway.stages.map((stage, index) => (
                <li className="pathway-stage" key={`${pathway.id}-${stage.title}`}>
                  <div className="pathway-stage__heading">
                    <span className="pathway-stage__number">{String(index + 1).padStart(2, '0')}</span>
                    <div><span className="eyebrow">{stage.label}</span><h3>{stage.title}</h3><p>{stage.guidance}</p></div>
                  </div>
                  <div className="pathway-stage__courses">
                    {pathwayCourses(stage).map((course) => {
                      const enrollment = enrollmentFor(course.id);
                      const progress = progressFor(course, enrollment);
                      return (
                        <Link className="pathway-course" key={course.id} to={`/courses/${course.slug}`}>
                          <span><strong>{course.title}</strong><small>{course.level} · {course.jurisdictionScope === 'india-general' ? 'All India practice' : course.stateCodes.join(', ')} · {course.durationMinutes} min</small></span>
                          {progress === 100 ? <CheckCircleOutlineRounded aria-label="Completed in preview learning record" /> : <span className="pathway-course__action">{enrollment ? `${progress}% complete` : 'View course'} <ArrowForwardRounded /></span>}
                        </Link>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ol>
            <div className="pathway-outcome"><WorkspacePremiumOutlined /><p><strong>Completion and certificates</strong><br />{pathway.outcome} <Link to="/credentials">See how credentials work <ArrowForwardRounded /></Link></p></div>
          </section>
        ))}
      </div>
    </main>
  );
}
