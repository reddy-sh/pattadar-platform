import CheckRounded from '@mui/icons-material/CheckRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { campusBySlug, opportunities, roleLabels } from '../data/catalog';
import type { AudienceRole } from '../domain/types';
import { useUniversity } from '../state/UniversityProvider';

export function OpportunitiesPage() {
  const [role, setRole] = useState<AudienceRole | 'all'>('all');
  const { interestedOpportunityIds, toggleOpportunityInterest } = useUniversity();
  const saved = useMemo(() => new Set(interestedOpportunityIds), [interestedOpportunityIds]);
  const visible = useMemo(
    () => role === 'all' ? opportunities : opportunities.filter((opportunity) => opportunity.role === role),
    [role],
  );

  return (
    <main className="page-shell interior-page">
      <header className="page-heading">
        <span className="context-line">Employment and assignment pathways</span>
        <h1>Opportunities</h1>
        <p>Preview how learning can lead to supervised work. These planned pathways are not open roles, offers, or guarantees.</p>
      </header>
      <div className="role-filter" role="group" aria-label="Filter opportunities by role">
        <button type="button" aria-pressed={role === 'all'} onClick={() => setRole('all')}>All roles</button>
        {(Object.entries(roleLabels) as Array<[AudienceRole, string]>).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)}>{label}</button>
        ))}
      </div>
      <div className="opportunity-list" aria-live="polite">
        {visible.map((opportunity) => {
          const campus = campusBySlug(opportunity.locationSlug);
          const isSaved = saved.has(opportunity.id);
          return (
            <article key={opportunity.id} className="opportunity-row">
              <span className="icon-box"><WorkOutlineRounded /></span>
              <div className="opportunity-row__main">
                <span>{roleLabels[opportunity.role]}</span>
                <h2>{opportunity.title}</h2>
                <p>{opportunity.organization} · {opportunity.engagement}</p>
              </div>
              <div className="opportunity-row__requirement">
                <span>Preparation</span>
                <p>{opportunity.requirement}</p>
                {campus ? <Link to={`/locations/${campus.slug}`}><LocationOnOutlined /> {campus.name}</Link> : null}
              </div>
              <button className={isSaved ? 'button button--saved' : 'button button--quiet'} type="button" onClick={() => void toggleOpportunityInterest(opportunity.id)}>
                {isSaved ? <CheckRounded /> : null}{isSaved ? 'Interest saved' : 'Save interest'}
              </button>
            </article>
          );
        })}
      </div>
      <p className="governance-callout">Saved interest stays in this browser preview. Production applications require explicit sharing consent, fee or commission disclosure, a verified role owner, and a withdrawal path.</p>
    </main>
  );
}
