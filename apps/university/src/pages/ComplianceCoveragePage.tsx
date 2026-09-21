import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import { Link } from 'react-router';
import { courseForModule } from '../data/catalog';
import {
  complianceAreaLabels,
  complianceCoverage,
  coverageByArea,
  type ComplianceArea,
} from '../data/complianceCoverage';

const areas: ComplianceArea[] = ['property-records', 'buyer-seller', 'service-sharing', 'workforce'];

export function ComplianceCoveragePage() {
  const coveredModules = new Set(complianceCoverage.flatMap((requirement) => requirement.moduleIds));

  return (
    <main className="coverage-page page-shell">
      <header className="coverage-heading">
        <FactCheckOutlined />
        <div>
          <span className="eyebrow">Governance · IN/AP/*</span>
          <h1>Training compliance coverage</h1>
          <p>This matrix connects the published Andhra Pradesh Admin checklist and company workforce controls to specific University lessons. It is a reviewed training snapshot, not the runtime policy engine.</p>
        </div>
      </header>

      <dl className="coverage-summary" aria-label="Coverage summary">
        <div><dt>Requirements mapped</dt><dd>{complianceCoverage.length}</dd></div>
        <div><dt>Lessons involved</dt><dd>{coveredModules.size}</dd></div>
        <div><dt>Scope reviewed</dt><dd>IN/AP/*</dd></div>
        <div><dt>Reviewed</dt><dd>20 Sep 2026</dd></div>
      </dl>

      <aside className="coverage-boundary">
        <strong>How to use this matrix</strong>
        <p>The Admin service remains authoritative for the currently published policy, checklist version, effective date, and allocation decision. Lesson references link only to government sources; company controls are identified as Pattadar policy.</p>
      </aside>

      <div className="coverage-groups">
        {areas.map((area) => {
          const requirements = coverageByArea(area);
          return (
            <section className="coverage-group" key={area} aria-labelledby={`coverage-${area}-title`}>
              <div className="coverage-group__heading">
                <div><span className="eyebrow">{requirements.length} requirements</span><h2 id={`coverage-${area}-title`}>{complianceAreaLabels[area]}</h2></div>
                <span className="coverage-state"><CheckCircleRounded /> Covered</span>
              </div>
              <div className="coverage-list">
                {requirements.map((requirement) => (
                  <article className="coverage-row" id={`coverage-${requirement.key}`} key={requirement.key}>
                    <div className="coverage-row__copy">
                      <span>{requirement.key}</span>
                      <h3>{requirement.title}</h3>
                      <p>{requirement.description}</p>
                    </div>
                    <div className="coverage-row__lessons" aria-label={`Lessons covering ${requirement.title}`}>
                      {requirement.moduleIds.map((moduleId) => {
                        const course = courseForModule(moduleId);
                        const module = course?.modules.find((item) => item.id === moduleId);
                        return course && module ? (
                          <Link key={moduleId} to={`/courses/${course.slug}/lessons/${moduleId}`}>{module.title}</Link>
                        ) : null;
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
