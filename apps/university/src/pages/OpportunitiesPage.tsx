import CheckRounded from '@mui/icons-material/CheckRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { DiscoveryFilters } from '../components/DiscoveryFilters';
import { campusBySlug, campuses, opportunities, roleLabels } from '../data/catalog';
import { filterOpportunitiesByDiscovery } from '../domain/discovery';
import { useDiscoveryFilters } from '../state/useDiscoveryFilters';
import { useUniversity } from '../state/UniversityProvider';

export function OpportunitiesPage() {
  const { interestedOpportunityIds, toggleOpportunityInterest } = useUniversity();
  const { filters, updateFilters, clearFilters, hasActiveFilters } = useDiscoveryFilters({ lockGoal: 'career' });
  const saved = useMemo(() => new Set(interestedOpportunityIds), [interestedOpportunityIds]);
  const visible = useMemo(
    () => filterOpportunitiesByDiscovery(opportunities, campuses, filters),
    [filters],
  );

  return (
    <main className="page-shell interior-page">
      <header className="page-heading">
        <span className="context-line">Employment and assignment pathways</span>
        <h1>Opportunities</h1>
        <p>Preview how learning can lead to supervised work. These planned pathways are not open roles, offers, or guarantees.</p>
      </header>
      <DiscoveryFilters
        idPrefix="opportunities"
        mode="careers"
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        resultCount={visible.length}
        totalCount={opportunities.length}
        onChange={updateFilters}
        onClear={clearFilters}
      />
      {visible.length === 0 ? (
        <section className="filter-empty" aria-live="polite">
          <SearchOffRounded />
          <div><h2>No pathways match</h2><p>Try another career discipline or state.</p></div>
          <button className="button button--quiet" type="button" onClick={clearFilters}>Clear filters</button>
        </section>
      ) : null}
      {visible.length > 0 ? (
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
      ) : null}
      <p className="governance-callout">Saved interest stays in this browser preview. Production applications require explicit sharing consent, fee or commission disclosure, a verified role owner, and a withdrawal path.</p>
    </main>
  );
}
