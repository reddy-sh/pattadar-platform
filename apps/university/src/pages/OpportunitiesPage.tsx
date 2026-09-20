import CheckRounded from '@mui/icons-material/CheckRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { campusBySlug, opportunities, roleLabels } from '../data/catalog';
import type { AudienceRole } from '../domain/types';

export function OpportunitiesPage() {
  const [role, setRole] = useState<AudienceRole | 'all'>('all');
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const visible = useMemo(
    () => role === 'all' ? opportunities : opportunities.filter((opportunity) => opportunity.role === role),
    [role],
  );

  const toggleSaved = (id: string) => {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="page-shell interior-page">
      <header className="page-heading">
        <span className="context-line">Employment and assignment pathways</span>
        <h1>Opportunities</h1>
        <p>Match learning to supervised work. Listings show the preparation needed; saving interest is not an offer or guarantee.</p>
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
              <button className={isSaved ? 'button button--saved' : 'button button--quiet'} type="button" onClick={() => toggleSaved(opportunity.id)}>
                {isSaved ? <CheckRounded /> : null}{isSaved ? 'Interest saved' : 'Save interest'}
              </button>
            </article>
          );
        })}
      </div>
      <p className="governance-callout">Before an application is shared, Pattadar should collect explicit consent, disclose fees or commissions, verify the role owner, and show how to withdraw.</p>
    </main>
  );
}
